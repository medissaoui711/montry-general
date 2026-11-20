import {createHash, randomUUID} from "node:crypto";
import {mkdir, open, readFile, rename, rm} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import type {WorkflowDefinition} from "./contracts";

export const WorkflowCheckpointTaskSchema = z.object({
  taskId: z.string().min(1),
  skillId: z.string().min(1),
  skillVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  status: z.enum(["pending", "running", "completed", "failed", "skipped", "cancelled", "indeterminate"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  updatedAt: z.number().int().nonnegative(),
}).strict().superRefine((task, context) => {
  if (task.status === "completed" && task.output === undefined) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["output"],message:"Completed checkpoint tasks must include output."});
  }
  if (task.status === "failed" && !task.error) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["error"],message:"Failed checkpoint tasks must include an error."});
  }
});

export const WorkflowCheckpointSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  workflowFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.number().int().nonnegative(),
  tasks: z.array(WorkflowCheckpointTaskSchema),
  updatedAt: z.number().int().nonnegative(),
}).strict();

export type WorkflowCheckpointTask = z.infer<typeof WorkflowCheckpointTaskSchema>;
export type WorkflowCheckpoint = z.infer<typeof WorkflowCheckpointSchema>;

/** Stable across retries and resumes of the same run/task; suitable for provider deduplication. */
export function workflowTaskIdempotencyKey(runId: string, workflowFingerprint: string, taskId: string): string {
  return createHash("sha256").update([runId,workflowFingerprint,taskId].join("\\0")).digest("hex");
}

/**
 * A store must atomically replace one run checkpoint per save. Implementations shared
 * across processes should provide transactional writes; callers must not assume
 * exactly-once execution of external side effects.
 */
export interface WorkflowRunStore {
  load(runId: string): Promise<WorkflowCheckpoint | null>;
  save(checkpoint: WorkflowCheckpoint): Promise<void>;
}

/** Deterministic SHA-256 over workflow identity, task order, inputs and dependencies. */
export function fingerprintWorkflow(definition: WorkflowDefinition): string {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new Error("Workflow contains a non-plain object that cannot be fingerprinted.");
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
    }
    throw new Error("Workflow contains a non-JSON value that cannot be fingerprinted.");
  };
  return createHash("sha256").update(canonical(definition)).digest("hex");
}

/** Process-local adapter for tests and single-process workflows; not durable storage. */
export class InMemoryWorkflowRunStore implements WorkflowRunStore {
  private readonly checkpoints = new Map<string, WorkflowCheckpoint>();

  async load(runId: string): Promise<WorkflowCheckpoint | null> {
    const checkpoint = this.checkpoints.get(runId);
    return checkpoint ? structuredClone(checkpoint) : null;
  }

  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    const parsed = WorkflowCheckpointSchema.parse(checkpoint);
    const current = this.checkpoints.get(parsed.runId);
    if (current && parsed.revision <= current.revision) {
      throw new Error(`Checkpoint revision must increase for run "${parsed.runId}".`);
    }
    this.checkpoints.set(parsed.runId, structuredClone(parsed));
  }
}


/**
 * Durable local-disk adapter. Writes use a same-directory temporary file and atomic
 * rename. It serializes writes within this instance; do not share a directory between
 * multiple processes without an external lock/CAS coordinator.
 */
export class FileWorkflowRunStore implements WorkflowRunStore {
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(private readonly directory: string) {
    if (!directory.trim()) throw new Error("Checkpoint directory must not be empty.");
  }

  private filePath(runId: string): string {
    const normalized = z.string().trim().min(1).parse(runId);
    const key = createHash("sha256").update(normalized).digest("hex");
    return path.join(this.directory, `${key}.json`);
  }

  async load(runId: string): Promise<WorkflowCheckpoint | null> {
    const file = this.filePath(runId);
    try {
      const raw = await readFile(file, "utf8");
      const checkpoint = WorkflowCheckpointSchema.parse(JSON.parse(raw));
      if (checkpoint.runId !== runId) throw new Error("Checkpoint runId does not match its storage key.");
      return checkpoint;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async save(value: WorkflowCheckpoint): Promise<void> {
    const checkpoint = WorkflowCheckpointSchema.parse(value);
    const previous = this.writeQueues.get(checkpoint.runId) ?? Promise.resolve();
    const next = previous.then(async () => {
      await mkdir(this.directory, {recursive:true,mode:0o700});
      const current = await this.load(checkpoint.runId);
      if (current && checkpoint.revision <= current.revision) {
        throw new Error(`Checkpoint revision must increase for run "${checkpoint.runId}".`);
      }
      const destination = this.filePath(checkpoint.runId);
      const temporary = path.join(this.directory, `.${path.basename(destination)}.${randomUUID()}.tmp`);
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(temporary, "wx", 0o600);
        await handle.writeFile(JSON.stringify(checkpoint), "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporary, destination);
      } finally {
        if (handle) await handle.close();
        await rm(temporary, {force:true});
      }
    });
    this.writeQueues.set(checkpoint.runId, next);
    try {
      await next;
    } finally {
      if (this.writeQueues.get(checkpoint.runId) === next) this.writeQueues.delete(checkpoint.runId);
    }
  }
}
