import type {TaskExecutionResult, WorkflowDefinition, WorkflowExecutionResult} from "./contracts";
import {planWorkflow} from "./planner";
import {SkillRegistry} from "./registry";

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Executes in deterministic topological order and stops on the first failed task. */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  registry: SkillRegistry,
): Promise<WorkflowExecutionResult> {
  const plan = planWorkflow(definition, registry);
  const outputs: Record<string, unknown> = {};
  const results: TaskExecutionResult[] = [];

  for (const {task} of plan) {
    const skill = registry.get(task.skill);
    const input = skill.inputSchema.safeParse(task.input);
    if (!input.success) {
      results.push({taskId: task.id, skillId: task.skill, status: "failed", error: `Input validation failed: ${input.error.message}`});
      break;
    }
    const dependencies = Object.fromEntries(task.dependsOn.map((id) => [id, outputs[id]]));
    try {
      const rawOutput = await skill.execute(input.data, {workflowId: definition.id, taskId: task.id, dependencies});
      const output = skill.outputSchema.safeParse(rawOutput);
      if (!output.success) throw new Error(`Output validation failed: ${output.error.message}`);
      outputs[task.id] = output.data;
      results.push({taskId: task.id, skillId: task.skill, status: "completed", output: output.data});
    } catch (error) {
      results.push({taskId: task.id, skillId: task.skill, status: "failed", error: messageOf(error)});
      break;
    }
  }

  if (results.length < plan.length) {
    const visited = new Set(results.map((result) => result.taskId));
    for (const {task} of plan) if (!visited.has(task.id)) {
      results.push({taskId: task.id, skillId: task.skill, status: "skipped", reason: "Execution stopped after an earlier task failed."});
    }
  }
  return {
    workflowId: definition.id,
    status: results.some((result) => result.status === "failed") ? "failed" : "completed",
    tasks: results,
    outputs,
  };
}
