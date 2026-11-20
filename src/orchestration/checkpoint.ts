import {createHash} from "node:crypto";
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
  if (task.status === "completed" && !("output" in task)) {
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
}
