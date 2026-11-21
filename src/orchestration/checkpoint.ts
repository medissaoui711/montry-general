import {createHash, randomUUID} from "node:crypto";
import {mkdir, open, readFile, rename, stat, unlink} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import type {WorkflowDefinition} from "./contracts";
import type {SkillRegistry} from "./registry";

export const WorkflowCheckpointReconciliationSchema = z.object({
  resolution: z.enum(["completed", "failed", "retry-authorized"]),
  actorId: z.string().trim().min(1).max(200),
  evidence: z.string().trim().min(1).max(4000),
  reconciledAt: z.number().int().nonnegative(),
}).strict();

export const WorkflowCheckpointTaskSchema = z.object({
  taskId: z.string().min(1),
  skillId: z.string().min(1),
  skillVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  status: z.enum(["pending", "running", "completed", "failed", "skipped", "cancelled", "indeterminate"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  reconciliation: WorkflowCheckpointReconciliationSchema.optional(),
  updatedAt: z.number().int().nonnegative(),
}).strict().superRefine((task, context) => {
  if (task.status === "completed" && !("output" in task)) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["output"],message:"Completed checkpoint tasks must include output."});
  }
  if ((task.status === "failed" || task.status === "indeterminate") && !task.error) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["error"],message:"Failed and indeterminate checkpoint tasks must include an error or reconciliation reason."});
  }
  if (task.reconciliation?.resolution === "completed" && task.status !== "completed") {
    context.addIssue({code:z.ZodIssueCode.custom,path:["reconciliation"],message:"A task reconciled as completed must remain completed."});
  }
  if (task.reconciliation?.resolution === "failed" && task.status !== "failed") {
    context.addIssue({code:z.ZodIssueCode.custom,path:["reconciliation"],message:"A task reconciled as failed must remain terminally failed."});
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

/**
 * A store must atomically replace one run checkpoint per save. Implementations shared
 * across processes should provide transactional writes; callers must not assume
 * exactly-once execution of external side effects.
 */
export interface WorkflowRunStore {
  load(runId: string): Promise<WorkflowCheckpoint | null>;
  save(checkpoint: WorkflowCheckpoint): Promise<void>;
  /** Atomically persist only when the current revision matches; null means create-if-absent. */
  compareAndSwap(runId: string, expectedRevision: number | null, checkpoint: WorkflowCheckpoint): Promise<boolean>;
}

export type ReconcileWorkflowTaskInput = {
  runId: string;
  taskId: string;
  expectedRevision: number;
  actorId: string;
  evidence: string;
} & (
  | {resolution:"completed"; output:unknown}
  | {resolution:"failed"; reason:string}
  | {resolution:"retry-authorized"; reason:string}
);

export type ReconciliationAuthorizationContext = Pick<
  ReconcileWorkflowTaskInput,
  "runId" | "taskId" | "actorId" | "resolution"
>;
export type ReconciliationAuthorizer = (
  context: ReconciliationAuthorizationContext,
) => boolean | Promise<boolean>;

/**
 * Explicitly resolves an indeterminate checkpoint using operator-supplied evidence.
 * Retry authorization is an assertion that authoritative evidence confirms no effect
 * occurred; it is never inferred from retrySafe.
 */
export async function reconcileWorkflowTask(
  store: WorkflowRunStore,
  registry: SkillRegistry,
  input: ReconcileWorkflowTaskInput,
  authorize: ReconciliationAuthorizer,
): Promise<WorkflowCheckpoint> {
  const request = z.object({
    runId:z.string().trim().min(1),
    taskId:z.string().trim().min(1),
    expectedRevision:z.number().int().nonnegative(),
    actorId:z.string().trim().min(1).max(200),
    evidence:z.string().trim().min(1).max(4000),
    resolution:z.enum(["completed","failed","retry-authorized"]),
    output:z.unknown().optional(),
    reason:z.string().trim().min(1).max(2000).optional(),
  }).strict().parse(input);
  if (request.resolution === "completed" && !Object.prototype.hasOwnProperty.call(input,"output")) {
    throw new Error("An output is required when reconciling a task as completed.");
  }
  if (typeof authorize !== "function") throw new Error("A host reconciliation authorizer is required.");
  const authorized = await authorize({
    runId:request.runId,taskId:request.taskId,actorId:request.actorId,resolution:request.resolution,
  });
  if (!authorized) throw new Error("Reconciliation was not authorized by the host policy.");
  const current = await store.load(request.runId);
  if (!current) throw new Error(`No checkpoint exists for run "${request.runId}".`);
  const parsed = WorkflowCheckpointSchema.parse(current);
  if (parsed.revision !== request.expectedRevision) {
    throw new Error(`Checkpoint revision conflict: expected ${request.expectedRevision}, found ${parsed.revision}.`);
  }
  const task = parsed.tasks.find((item) => item.taskId === request.taskId);
  if (!task) throw new Error(`Checkpoint task "${request.taskId}" was not found.`);
  if (task.status !== "indeterminate") {
    throw new Error(`Task "${request.taskId}" is not indeterminate and cannot be reconciled through this operation.`);
  }
  const skill = registry.get(task.skillId);
  const reconciledAt = Date.now();
  const record = {
    resolution:request.resolution,
    actorId:request.actorId,
    evidence:request.evidence,
    reconciledAt,
  } as const;
  let nextTask: WorkflowCheckpointTask;
  if (request.resolution === "completed") {
    const output = skill.outputSchema.parse(request.output);
    nextTask = {...task,status:"completed",output,error:undefined,reconciliation:record,updatedAt:reconciledAt};
  } else if (request.resolution === "failed") {
    if (!request.reason) throw new Error("A reason is required when reconciling a task as failed.");
    nextTask = {...task,status:"failed",output:undefined,error:request.reason,reconciliation:record,updatedAt:reconciledAt};
  } else {
    if (!request.reason) throw new Error("A reason is required to authorize a retry.");
    nextTask = {...task,status:"pending",output:undefined,error:undefined,reconciliation:record,updatedAt:reconciledAt};
  }
  const next = WorkflowCheckpointSchema.parse({
    ...parsed,
    revision:parsed.revision + 1,
    updatedAt:reconciledAt,
    tasks:parsed.tasks.map((item) => item.taskId === request.taskId ? nextTask : item),
  });
  const swapped = await store.compareAndSwap(request.runId,parsed.revision,next);
  if (!swapped) throw new Error("Checkpoint revision conflict during reconciliation; reload before retrying.");
  return next;
}

export type FileWorkflowRunStoreOptions = {
  /** Maximum time to wait for another local writer; defaults to 10000ms. */
  lockWaitMs?: number;
  /** Locks older than this are treated as abandoned; defaults to 60000ms. */
  staleLockMs?: number;
  /** Maximum serialized checkpoint size; defaults to 10 MiB. */
  maxCheckpointBytes?: number;
};

/**
 * Durable single-host checkpoint store. Uses atomic rename and a per-run exclusive
 * lock file for compare-and-swap. It is not a distributed/multi-host database.
 */
export class FileWorkflowRunStore implements WorkflowRunStore {
  private readonly directory: string;
  private readonly lockWaitMs: number;
  private readonly staleLockMs: number;
  private readonly maxCheckpointBytes: number;

  constructor(directory: string, options: FileWorkflowRunStoreOptions = {}) {
    if (!directory.trim()) throw new Error("Checkpoint directory must be a non-empty path.");
    this.directory = path.resolve(directory);
    this.lockWaitMs = options.lockWaitMs ?? 10_000;
    this.staleLockMs = options.staleLockMs ?? 60_000;
    this.maxCheckpointBytes = options.maxCheckpointBytes ?? 10 * 1024 * 1024;
    if (!Number.isInteger(this.maxCheckpointBytes) || this.maxCheckpointBytes < 1024 || this.maxCheckpointBytes > 100 * 1024 * 1024) {
      throw new Error("maxCheckpointBytes must be an integer between 1024 and 104857600.");
    }
    if (!Number.isInteger(this.lockWaitMs) || this.lockWaitMs < 1 || this.lockWaitMs > 120_000) {
      throw new Error("lockWaitMs must be an integer between 1 and 120000.");
    }
    if (!Number.isInteger(this.staleLockMs) || this.staleLockMs < 1_000 || this.staleLockMs > 3_600_000) {
      throw new Error("staleLockMs must be an integer between 1000 and 3600000.");
    }
  }

  private key(runId: string): string {
    return createHash("sha256").update(runId).digest("hex");
  }

  private filePath(runId: string): string {
    return path.join(this.directory, `${this.key(runId)}.json`);
  }

  private async readUnlocked(runId: string): Promise<WorkflowCheckpoint | null> {
    try {
      const file = this.filePath(runId);
      const info = await stat(file);
      if (info.size > this.maxCheckpointBytes) throw new Error("Checkpoint file exceeds maxCheckpointBytes.");
      const raw = await readFile(file,"utf8");
      if (Buffer.byteLength(raw,"utf8") > this.maxCheckpointBytes) throw new Error("Checkpoint file exceeds maxCheckpointBytes.");
      return WorkflowCheckpointSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
  }

  private async withRunLock<T>(runId: string, action: () => Promise<T>): Promise<T> {
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const lockPath = path.join(this.directory,`${this.key(runId)}.lock`);
    const deadline = Date.now() + this.lockWaitMs;
    let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
    while (!lockHandle) {
      try {
        lockHandle = await open(lockPath,"wx",0o600);
        await lockHandle.writeFile(JSON.stringify({pid:process.pid,createdAt:Date.now()}));
        await lockHandle.sync();
      } catch (error) {
        if (lockHandle) { await lockHandle.close(); lockHandle = undefined; }
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (code !== "EEXIST") throw error;
        try {
          const lockStat = await stat(lockPath);
          if (Date.now() - lockStat.mtimeMs > this.staleLockMs) {
            await unlink(lockPath);
            continue;
          }
        } catch (statError) {
          const statCode = statError && typeof statError === "object" && "code" in statError ? statError.code : undefined;
          if (statCode === "ENOENT") continue;
          throw statError;
        }
        if (Date.now() >= deadline) throw new Error("Timed out waiting for the checkpoint run lock.");
        await new Promise((resolve) => setTimeout(resolve,10));
      }
    }
    try {
      return await action();
    } finally {
      await lockHandle.close();
      try { await unlink(lockPath); } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (code !== "ENOENT") throw error;
      }
    }
  }

  private async writeAtomically(checkpoint: WorkflowCheckpoint): Promise<void> {
    const parsed = WorkflowCheckpointSchema.parse(checkpoint);
    const serialized = JSON.stringify(parsed);
    if (serialized === undefined) throw new Error("Checkpoint cannot be serialized as JSON.");
    if (Buffer.byteLength(serialized,"utf8") > this.maxCheckpointBytes) throw new Error("Checkpoint exceeds maxCheckpointBytes.");
    // Verify JSON round-trip before replacing the previous durable snapshot.
    WorkflowCheckpointSchema.parse(JSON.parse(serialized));
    const target = this.filePath(parsed.runId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const handle = await open(temporary,"wx",0o600);
    try {
      await handle.writeFile(serialized,"utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary,target);
      // Best-effort directory sync persists the rename on filesystems that support it.
      try {
        const directoryHandle = await open(this.directory,"r");
        try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      } catch { /* Some platforms do not allow opening/syncing directories. */ }
    } finally {
      try { await unlink(temporary); } catch { /* Renamed or already cleaned up. */ }
    }
  }

  async load(runId: string): Promise<WorkflowCheckpoint | null> {
    if (!runId.trim()) throw new Error("runId must be a non-empty string.");
    await mkdir(this.directory,{recursive:true,mode:0o700});
    return this.readUnlocked(runId);
  }

  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    const parsed = WorkflowCheckpointSchema.parse(checkpoint);
    await this.withRunLock(parsed.runId,async () => {
      const current = await this.readUnlocked(parsed.runId);
      if (current && parsed.revision <= current.revision) {
        throw new Error(`Checkpoint revision must increase for run "${parsed.runId}".`);
      }
      await this.writeAtomically(parsed);
    });
  }

  async compareAndSwap(runId: string, expectedRevision: number | null, checkpoint: WorkflowCheckpoint): Promise<boolean> {
    const parsed = WorkflowCheckpointSchema.parse(checkpoint);
    if (parsed.runId !== runId) throw new Error("Checkpoint runId does not match compareAndSwap key.");
    return this.withRunLock(runId,async () => {
      const current = await this.readUnlocked(runId);
      if (expectedRevision === null ? current !== null : current?.revision !== expectedRevision) return false;
      if (expectedRevision === null && parsed.revision !== 0) throw new Error("New checkpoints must start at revision zero.");
      if (expectedRevision !== null && parsed.revision !== expectedRevision + 1) {
        throw new Error("Checkpoint revision must increase by exactly one for compareAndSwap.");
      }
      await this.writeAtomically(parsed);
      return true;
    });
  }
}

/** Deterministic SHA-256 over workflow identity, task order, inputs and dependencies. */
export function fingerprintWorkflow(definition: WorkflowDefinition): string {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Workflow contains a value that cannot be fingerprinted.");
    return encoded;
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

  async compareAndSwap(runId: string, expectedRevision: number | null, checkpoint: WorkflowCheckpoint): Promise<boolean> {
    const parsed = WorkflowCheckpointSchema.parse(checkpoint);
    if (parsed.runId !== runId) throw new Error("Checkpoint runId does not match compareAndSwap key.");
    const current = this.checkpoints.get(runId);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return false;
    if (expectedRevision !== null && parsed.revision !== expectedRevision + 1) {
      throw new Error("Checkpoint revision must increase by exactly one for compareAndSwap.");
    }
    if (expectedRevision === null && parsed.revision !== 0) {
      throw new Error("New checkpoints must start at revision zero.");
    }
    this.checkpoints.set(runId,structuredClone(parsed));
    return true;
  }
}
