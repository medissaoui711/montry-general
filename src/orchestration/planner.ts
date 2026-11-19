import {WorkflowSchema, type PlannedTask, type WorkflowDefinition, type WorkflowPlanPreview} from "./contracts";
import {SkillRegistry} from "./registry";

export function planWorkflow(definition: WorkflowDefinition, registry: SkillRegistry): PlannedTask[] {
  const workflow = WorkflowSchema.parse(definition);
  const taskById = new Map(workflow.tasks.map((task) => [task.id, task]));
  if (taskById.size !== workflow.tasks.length) throw new Error("Workflow task IDs must be unique.");

  const resolvedSkills = new Map<string, string>();
  for (const task of workflow.tasks) {
    const skillId = task.skill ?? registry.resolveCapability(task.capability!, task.provider);
    if (!registry.has(skillId)) throw new Error(`Task "${task.id}" references unregistered skill "${skillId}".`);
    resolvedSkills.set(task.id, skillId);
    if (new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error(`Task "${task.id}" contains duplicate dependencies.`);
    for (const dependency of task.dependsOn) {
      if (dependency === task.id) throw new Error(`Task "${task.id}" cannot depend on itself.`);
      if (!taskById.has(dependency)) throw new Error(`Task "${task.id}" depends on unknown task "${dependency}".`);
    }
  }

  const remaining = new Map(workflow.tasks.map((task, index) => [task.id, {task, index}]));
  const completed = new Set<string>();
  const ordered: PlannedTask[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(({task}) => task.dependsOn.every((dependency) => completed.has(dependency)))
      .sort((a, b) => a.index - b.index);
    if (ready.length === 0) throw new Error(`Workflow contains a dependency cycle involving: ${[...remaining.keys()].join(", ")}.`);
    for (const item of ready) {
      remaining.delete(item.task.id);
      completed.add(item.task.id);
      ordered.push({task: item.task, skillId: resolvedSkills.get(item.task.id)!, order: ordered.length});
    }
  }
  return ordered;
}

/**
 * Produces a deterministic, side-effect-free execution preview.
 * It validates task/provider resolution and the dependency DAG, but never invokes skills.
 */
export function previewWorkflow(definition: WorkflowDefinition, registry: SkillRegistry): WorkflowPlanPreview {
  const plan = planWorkflow(definition, registry);
  const layerByTask = new Map<string, number>();
  const layers: string[][] = [];

  const tasks = plan.map(({task, skillId, order}) => {
    const skill = registry.get(skillId);
    const layer = task.dependsOn.length === 0
      ? 0
      : Math.max(...task.dependsOn.map((dependency) => (layerByTask.get(dependency) ?? 0) + 1));
    layerByTask.set(task.id, layer);
    layers[layer] ??= [];
    layers[layer]!.push(task.id);

    const requirements = (skill.requires ?? []).map((capability) => ({
      capability,
      providers: registry.listProviders(capability),
    }));
    return {
      taskId: task.id,
      skillId,
      version: skill.version,
      requestedCapability: task.capability ?? null,
      provider: task.provider ?? null,
      dependsOn: [...task.dependsOn],
      order,
      layer,
      capabilities: [...(skill.capabilities ?? [])].sort(),
      requirements,
    };
  });

  return {
    workflowId: definition.id,
    taskCount: tasks.length,
    layerCount: layers.length,
    layers,
    tasks,
  };
}
