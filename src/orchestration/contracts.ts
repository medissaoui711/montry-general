import {z} from "zod";
import type {WorkflowRunStore} from "./checkpoint";

export const SkillIdSchema = z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9._/-]*$/i);
export const SkillCapabilitySchema = z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9._/-]*$/i);
export const SkillVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

export const WorkflowTaskSchema = z.object({
  id: z.string().trim().min(1),
  skill: SkillIdSchema.optional(),
  capability: SkillCapabilitySchema.optional(),
  provider: SkillIdSchema.optional(),
  input: z.record(z.unknown()),
  dependsOn: z.array(z.string().trim().min(1)).default([]),
}).strict().superRefine((task, context) => {
  if (Boolean(task.skill) === Boolean(task.capability)) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "Specify exactly one of skill or capability."});
  }
  if (task.provider && !task.capability) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "provider can only be used with capability."});
  }
});

export const WorkflowSchema = z.object({
  id: z.string().trim().min(1),
  tasks: z.array(WorkflowTaskSchema).min(1).max(100),
}).strict();

export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowSchema>;
export type SkillExecutionContext = {
  workflowId: string;
  taskId: string;
  dependencies: Readonly<Record<string, unknown>>;
  /** Aborted when the workflow is cancelled or this task exceeds its timeout. */
  signal: AbortSignal;
  /** Unix epoch milliseconds; absent when no task timeout is configured. */
  deadlineAt?: number;
};
export type SkillDefinition<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: z.infer<typeof SkillIdSchema>;
  version: z.infer<typeof SkillVersionSchema>;
  capabilities?: string[];
  requires?: string[];
  /** Explicit opt-in: the provider guarantees repeating execute has no unsafe duplicate side effects. */
  retrySafe?: boolean;
  inputSchema: I;
  outputSchema: O;
  execute: (input: z.infer<I>, context: SkillExecutionContext) => z.infer<O> | Promise<z.infer<O>>;
};
export type PlannedTask = {task: WorkflowTask; skillId: string; order: number};
export type TaskExecutionResult =
  | {taskId: string; skillId: string; status: "completed"; output: unknown}
  | {taskId: string; skillId: string; status: "failed"; error: string}
  | {taskId: string; skillId: string; status: "skipped"; reason: string}
  | {taskId: string; skillId: string; status: "cancelled"; reason: string}
  | {taskId: string; skillId: string; status: "indeterminate"; reason: string; reconciliationRequired: true};
export type WorkflowExecutionResult = {
  workflowId: string;
  status: "completed" | "failed" | "cancelled" | "indeterminate";
  tasks: TaskExecutionResult[];
  outputs: Record<string, unknown>;
};

export type WorkflowPlanPreview = {
  workflowId: string;
  taskCount: number;
  layerCount: number;
  /** Tasks in the same layer have no dependency ordering between each other. */
  layers: string[][];
  tasks: Array<{
    taskId: string;
    skillId: string;
    version: string;
    requestedCapability: string | null;
    provider: string | null;
    dependsOn: string[];
    order: number;
    layer: number;
    capabilities: string[];
    requirements: Array<{capability: string; providers: string[]}>;
  }>;
};

export type WorkflowExecutionEvent =
  | {type: "task.started"; workflowId: string; taskId: string; skillId: string; at: number; attempt: number; deadlineAt?: number}
  | {type: "task.retrying"; workflowId: string; taskId: string; skillId: string; at: number; attempt: number; nextAttempt: number; delayMs: number; error: string}
  | {type: "task.completed"; workflowId: string; taskId: string; skillId: string; at: number; attempt: number}
  | {type: "task.failed"; workflowId: string; taskId: string; skillId: string; at: number; attempt: number; error: string}
  | {type: "task.skipped"; workflowId: string; taskId: string; skillId: string; at: number; reason: string}
  | {type: "task.cancelled"; workflowId: string; taskId: string; skillId: string; at: number; reason: string}
  | {type: "task.indeterminate"; workflowId: string; taskId: string; skillId: string; at: number; reason: string; reconciliationRequired: true};

export type WorkflowExecutionOptions = {
  /** Maximum number of independent tasks to execute concurrently. Defaults to 1. */
  maxConcurrency?: number;
  /** Per-attempt execution timeout in milliseconds. Must be between 1 and 600000. */
  taskTimeoutMs?: number;
  /** Maximum provider attempts. Retries occur only for skills explicitly marked retrySafe; defaults to 1. */
  maxAttempts?: number;
  /** Initial delay before a retry, in milliseconds. Defaults to 100. */
  initialRetryDelayMs?: number;
  /** Exponential backoff multiplier. Must be between 1 and 10; defaults to 2. */
  retryBackoffMultiplier?: number;
  /** Maximum retry delay in milliseconds. Must be between 0 and 60000; defaults to 5000. */
  maxRetryDelayMs?: number;
  /** Cancels active tasks and prevents subsequent tasks from being scheduled. */
  signal?: AbortSignal;
  /** Stable identifier required when checkpoint persistence is enabled. */
  runId?: string;
  /** Optional checkpoint backend. Must provide atomic per-run saves. */
  checkpointStore?: WorkflowRunStore;
  /** Restore completed outputs from an existing checkpoint. Requires runId and checkpointStore. */
  resume?: boolean;
  /** Observer errors are isolated and never fail workflow execution. */
  onEvent?: (event: WorkflowExecutionEvent) => void;
};
