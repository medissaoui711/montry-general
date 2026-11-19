import type {TaskExecutionResult, WorkflowDefinition, WorkflowExecutionOptions, WorkflowExecutionResult} from "./contracts";
import {previewWorkflow} from "./planner";
import {SkillRegistry} from "./registry";

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/**
 * Executes dependency layers in order, with a bounded number of independent tasks in flight.
 * A failed task stops scheduling subsequent chunks/layers; already-running siblings are awaited.
 */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  registry: SkillRegistry,
  options: WorkflowExecutionOptions = {},
): Promise<WorkflowExecutionResult> {
  const maxConcurrency = options.maxConcurrency ?? 1;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 16) {
    throw new Error("maxConcurrency must be an integer between 1 and 16.");
  }

  const preview = previewWorkflow(definition, registry);
  const taskById = new Map(definition.tasks.map((task) => [task.id, task]));
  const outputs: Record<string, unknown> = {};
  const results = new Map<string, TaskExecutionResult>();
  let stopped = false;

  for (const layer of preview.layers) {
    if (stopped) break;
    for (let offset = 0; offset < layer.length; offset += maxConcurrency) {
      const chunk = layer.slice(offset, offset + maxConcurrency);
      const chunkResults = await Promise.all(chunk.map(async (taskId): Promise<TaskExecutionResult> => {
        const planned = preview.tasks.find((item) => item.taskId === taskId)!;
        const task = taskById.get(taskId)!;
        const skill = registry.get(planned.skillId);
        const input = skill.inputSchema.safeParse(task.input);
        if (!input.success) {
          return {taskId, skillId: planned.skillId, status: "failed", error: `Input validation failed: ${input.error.message}`};
        }
        const dependencies = Object.fromEntries(task.dependsOn.map((id) => [id, outputs[id]]));
        try {
          const rawOutput = await skill.execute(input.data, {workflowId: definition.id, taskId, dependencies});
          const output = skill.outputSchema.safeParse(rawOutput);
          if (!output.success) throw new Error(`Output validation failed: ${output.error.message}`);
          outputs[taskId] = output.data;
          return {taskId, skillId: planned.skillId, status: "completed", output: output.data};
        } catch (error) {
          return {taskId, skillId: planned.skillId, status: "failed", error: messageOf(error)};
        }
      }));
      for (const result of chunkResults) results.set(result.taskId, result);
      if (chunkResults.some((result) => result.status === "failed")) {
        stopped = true;
        break;
      }
    }
  }

  const failed = [...results.values()].some((result) => result.status === "failed");
  for (const planned of preview.tasks) {
    if (results.has(planned.taskId)) continue;
    const reason = failed
      ? "Execution stopped after a task in an earlier execution chunk or dependency layer failed."
      : "Task was not scheduled.";
    results.set(planned.taskId, {taskId: planned.taskId, skillId: planned.skillId, status: "skipped", reason});
  }

  const orderedResults = preview.tasks.map((planned) => results.get(planned.taskId)!);
  return {
    workflowId: definition.id,
    status: failed ? "failed" : "completed",
    tasks: orderedResults,
    outputs,
  };
}
