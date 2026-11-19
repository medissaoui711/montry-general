import {z} from "zod";

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
};
export type SkillDefinition<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: z.infer<typeof SkillIdSchema>;
  version: z.infer<typeof SkillVersionSchema>;
  capabilities?: string[];
  requires?: string[];
  inputSchema: I;
  outputSchema: O;
  execute: (input: z.infer<I>, context: SkillExecutionContext) => z.infer<O> | Promise<z.infer<O>>;
};
export type PlannedTask = {task: WorkflowTask; skillId: string; order: number};
export type TaskExecutionResult =
  | {taskId: string; skillId: string; status: "completed"; output: unknown}
  | {taskId: string; skillId: string; status: "failed"; error: string}
  | {taskId: string; skillId: string; status: "skipped"; reason: string};
export type WorkflowExecutionResult = {
  workflowId: string;
  status: "completed" | "failed";
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

export type WorkflowExecutionOptions = {
  /** Maximum number of independent tasks to execute concurrently. Defaults to 1. */
  maxConcurrency?: number;
};
