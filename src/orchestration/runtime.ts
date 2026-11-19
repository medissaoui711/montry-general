import type {
  TaskExecutionResult,
  WorkflowDefinition,
  WorkflowExecutionEvent,
  WorkflowExecutionOptions,
  WorkflowExecutionResult,
} from "./contracts";
import {previewWorkflow} from "./planner";
import {SkillRegistry} from "./registry";

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);
const abortReason = (signal: AbortSignal): string =>
  signal.reason instanceof Error ? signal.reason.message : signal.reason === undefined ? "Workflow cancelled." : String(signal.reason);

function emit(options: WorkflowExecutionOptions, event: WorkflowExecutionEvent): void {
  try { options.onEvent?.(event); } catch { /* Observers must not affect execution. */ }
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error(abortReason(signal));
  if (delayMs === 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error(abortReason(signal!)));
    };
    signal?.addEventListener("abort", onAbort, {once:true});
    if (signal?.aborted) onAbort();
  });
}

async function executeWithControls(
  execute: (signal: AbortSignal) => unknown | Promise<unknown>,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): Promise<unknown> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort!: (error: Error) => void;
  let timedOut = false;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onParentAbort = () => {
    const reason = abortReason(parentSignal!);
    controller.abort(reason);
    rejectAbort(new Error(reason));
  };

  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener("abort", onParentAbort, {once: true});

  if (timeoutMs !== undefined) {
    timeout = setTimeout(() => {
      timedOut = true;
      const reason = `Task timed out after ${timeoutMs}ms.`;
      controller.abort(reason);
      rejectAbort(new Error(reason));
    }, timeoutMs);
  }

  try {
    if (controller.signal.aborted) throw new Error(abortReason(controller.signal));
    return await Promise.race([Promise.resolve().then(() => execute(controller.signal)), aborted]);
  } catch (error) {
    if (timedOut) throw new Error(`Task timed out after ${timeoutMs}ms.`);
    if (parentSignal?.aborted) throw new Error(abortReason(parentSignal));
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Executes dependency layers in bounded chunks.
 * Cancellation prevents future scheduling; providers must honor context.signal to stop their own work.
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
  const taskTimeoutMs = options.taskTimeoutMs;
  if (taskTimeoutMs !== undefined && (!Number.isInteger(taskTimeoutMs) || taskTimeoutMs < 1 || taskTimeoutMs > 600_000)) {
    throw new Error("taskTimeoutMs must be an integer between 1 and 600000.");
  }
  const maxAttempts = options.maxAttempts ?? 1;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error("maxAttempts must be an integer between 1 and 10.");
  }
  const initialRetryDelayMs = options.initialRetryDelayMs ?? 100;
  if (!Number.isInteger(initialRetryDelayMs) || initialRetryDelayMs < 0 || initialRetryDelayMs > 60_000) {
    throw new Error("initialRetryDelayMs must be an integer between 0 and 60000.");
  }
  const retryBackoffMultiplier = options.retryBackoffMultiplier ?? 2;
  if (!Number.isFinite(retryBackoffMultiplier) || retryBackoffMultiplier < 1 || retryBackoffMultiplier > 10) {
    throw new Error("retryBackoffMultiplier must be between 1 and 10.");
  }
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 5_000;
  if (!Number.isInteger(maxRetryDelayMs) || maxRetryDelayMs < 0 || maxRetryDelayMs > 60_000) {
    throw new Error("maxRetryDelayMs must be an integer between 0 and 60000.");
  }

  const preview = previewWorkflow(definition, registry);
  const taskById = new Map(definition.tasks.map((task) => [task.id, task]));
  const plannedById = new Map(preview.tasks.map((task) => [task.taskId, task]));
  const outputs: Record<string, unknown> = {};
  const results = new Map<string, TaskExecutionResult>();
  let stopped = false;
  let cancelled = options.signal?.aborted ?? false;

  for (const layer of preview.layers) {
    if (stopped || cancelled) break;
    for (let offset = 0; offset < layer.length; offset += maxConcurrency) {
      if (options.signal?.aborted) { cancelled = true; break; }
      const chunk = layer.slice(offset, offset + maxConcurrency);
      const chunkResults = await Promise.all(chunk.map(async (taskId): Promise<TaskExecutionResult> => {
        const planned = plannedById.get(taskId)!;
        const task = taskById.get(taskId)!;
        const skill = registry.get(planned.skillId);
        const input = skill.inputSchema.safeParse(task.input);
        if (!input.success) {
          const error = `Input validation failed: ${input.error.message}`;
          emit(options, {type:"task.failed",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),attempt:1,error});
          return {taskId,skillId:planned.skillId,status:"failed",error};
        }
        const dependencies = Object.fromEntries(task.dependsOn.map((id) => [id, outputs[id]]));
        const startedAt = Date.now();
        const firstDeadlineAt = taskTimeoutMs === undefined ? undefined : startedAt + taskTimeoutMs;
        let attempt = 1;
        emit(options, {type:"task.started",workflowId:definition.id,taskId,skillId:planned.skillId,at:startedAt,attempt,...(firstDeadlineAt === undefined ? {} : {deadlineAt:firstDeadlineAt})});
        try {
          let rawOutput: unknown;
          while (true) {
            const attemptStartedAt = Date.now();
            const deadlineAt = taskTimeoutMs === undefined ? undefined : attemptStartedAt + taskTimeoutMs;
            try {
              rawOutput = await executeWithControls(
                (signal) => skill.execute(input.data, {
                  workflowId:definition.id,taskId,dependencies,signal,
                  ...(deadlineAt === undefined ? {} : {deadlineAt}),
                }),
                options.signal,
                taskTimeoutMs,
              );
              break;
            } catch (error) {
              const message = messageOf(error);
              const timedOut = message.startsWith("Task timed out after ");
              const canRetry = skill.retrySafe === true && attempt < maxAttempts && !timedOut && !options.signal?.aborted;
              if (!canRetry) throw error;
              const delayMs = Math.min(maxRetryDelayMs, Math.round(initialRetryDelayMs * retryBackoffMultiplier ** (attempt - 1)));
              emit(options, {type:"task.retrying",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),attempt,nextAttempt:attempt + 1,delayMs,error:message});
              await waitForRetry(delayMs, options.signal);
              attempt += 1;
            }
          }
          const output = skill.outputSchema.safeParse(rawOutput);
          if (!output.success) throw new Error(`Output validation failed: ${output.error.message}`);
          outputs[taskId] = output.data;
          emit(options, {type:"task.completed",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),attempt});
          return {taskId,skillId:planned.skillId,status:"completed",output:output.data};
        } catch (error) {
          const message = messageOf(error);
          if (options.signal?.aborted) {
            emit(options, {type:"task.cancelled",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),reason:message});
            return {taskId,skillId:planned.skillId,status:"cancelled",reason:message};
          }
          emit(options, {type:"task.failed",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),attempt,error:message});
          return {taskId,skillId:planned.skillId,status:"failed",error:message};
        }
      }));
      for (const result of chunkResults) results.set(result.taskId, result);
      if (options.signal?.aborted) { cancelled = true; break; }
      if (chunkResults.some((result) => result.status === "failed" || result.status === "cancelled")) {
        stopped = true;
        break;
      }
    }
  }

  const failed = [...results.values()].some((result) => result.status === "failed");
  cancelled ||= options.signal?.aborted ?? false;
  for (const planned of preview.tasks) {
    if (results.has(planned.taskId)) continue;
    const reason = cancelled
      ? (options.signal ? abortReason(options.signal) : "Workflow cancelled.")
      : failed
        ? "Execution stopped after a task in an earlier execution chunk or dependency layer failed."
        : "Task was not scheduled.";
    const taskResult: TaskExecutionResult = cancelled
      ? {taskId:planned.taskId,skillId:planned.skillId,status:"cancelled",reason}
      : {taskId:planned.taskId,skillId:planned.skillId,status:"skipped",reason};
    results.set(planned.taskId, taskResult);
    emit(options, cancelled
      ? {type:"task.cancelled",workflowId:definition.id,taskId:planned.taskId,skillId:planned.skillId,at:Date.now(),reason}
      : {type:"task.skipped",workflowId:definition.id,taskId:planned.taskId,skillId:planned.skillId,at:Date.now(),reason});
  }

  const orderedResults = preview.tasks.map((planned) => results.get(planned.taskId)!);
  return {
    workflowId:definition.id,
    status:failed ? "failed" : cancelled ? "cancelled" : "completed",
    tasks:orderedResults,
    outputs,
  };
}
