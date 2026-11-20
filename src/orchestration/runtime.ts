import type {
  TaskExecutionResult,
  WorkflowDefinition,
  WorkflowExecutionEvent,
  WorkflowExecutionOptions,
  WorkflowExecutionResult,
} from "./contracts";
import {
  fingerprintWorkflow,
  workflowTaskIdempotencyKey,
  WorkflowCheckpointSchema,
  type WorkflowCheckpoint,
  type WorkflowCheckpointTask,
} from "./checkpoint";
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
 * Executes dependency layers in bounded chunks. When a checkpoint store is configured,
 * each provider invocation is preceded by a durable running snapshot and each successful
 * output is persisted before dependent tasks can be scheduled.
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

  if (Boolean(options.runId) !== Boolean(options.checkpointStore)) {
    throw new Error("runId and checkpointStore must be provided together.");
  }
  if (options.resume && !options.checkpointStore) {
    throw new Error("resume requires runId and checkpointStore.");
  }

  const preview = previewWorkflow(definition, registry);
  const taskById = new Map(definition.tasks.map((task) => [task.id, task]));
  const plannedById = new Map(preview.tasks.map((task) => [task.taskId, task]));
  const outputs: Record<string, unknown> = {};
  const results = new Map<string, TaskExecutionResult>();
  let checkpoint: WorkflowCheckpoint | undefined;
  let runFingerprint: string | undefined;
  let writeQueue: Promise<void> = Promise.resolve();

  if (options.checkpointStore && options.runId) {
    const store = options.checkpointStore;
    const fingerprint = fingerprintWorkflow(definition);
    runFingerprint = fingerprint;
    const now = Date.now();
    if (options.resume) {
      const loaded = await store.load(options.runId);
      if (!loaded) throw new Error(`No checkpoint exists for run "${options.runId}".`);
      checkpoint = WorkflowCheckpointSchema.parse(loaded);
      if (checkpoint.runId !== options.runId || checkpoint.workflowId !== definition.id) {
        throw new Error("Checkpoint runId or workflowId does not match this workflow execution.");
      }
      if (checkpoint.workflowFingerprint !== fingerprint) {
        throw new Error("Workflow definition fingerprint does not match the saved checkpoint.");
      }
      const checkpointById = new Map(checkpoint.tasks.map((task) => [task.taskId, task]));
      if (checkpointById.size !== preview.tasks.length || preview.tasks.some((task) => !checkpointById.has(task.taskId))) {
        throw new Error("Checkpoint task set does not match the current workflow plan.");
      }
      let normalized = false;
      for (const planned of preview.tasks) {
        const saved = checkpointById.get(planned.taskId)!;
        if (saved.skillId !== planned.skillId || saved.skillVersion !== planned.version) {
          throw new Error(`Checkpoint skill identity/version mismatch for task "${planned.taskId}".`);
        }
        const skill = registry.get(planned.skillId);
        if (saved.status === "completed") {
          const parsedOutput = skill.outputSchema.safeParse(saved.output);
          if (!parsedOutput.success) throw new Error(`Saved output for task "${planned.taskId}" no longer matches its skill output contract.`);
          outputs[planned.taskId] = parsedOutput.data;
          results.set(planned.taskId,{taskId:planned.taskId,skillId:planned.skillId,status:"completed",output:parsedOutput.data});
        } else if (saved.status === "pending" || saved.status === "skipped") {
          if (saved.status === "skipped") normalized = true;
        } else {
          if (skill.retrySafe !== true) {
            throw new Error(`Task "${planned.taskId}" has checkpoint status "${saved.status}" and is not declared retrySafe; refusing possible duplicate side effects.`);
          }
          normalized = true;
        }
      }
      if (normalized) {
        checkpoint = {
          ...checkpoint,
          revision:checkpoint.revision + 1,
          updatedAt:now,
          tasks:checkpoint.tasks.map((task) => ({
            ...task,
            ...(task.status === "completed" ? {} : {status:"pending" as const,error:undefined,output:undefined,updatedAt:now}),
          })),
        };
        await store.save(checkpoint);
      }
    } else {
      if (await store.load(options.runId)) {
        throw new Error(`Checkpoint already exists for run "${options.runId}"; set resume:true to restore it.`);
      }
      checkpoint = {
        schemaVersion:1,
        runId:options.runId,
        workflowId:definition.id,
        workflowFingerprint:fingerprint,
        revision:0,
        tasks:preview.tasks.map((task): WorkflowCheckpointTask => ({
          taskId:task.taskId,skillId:task.skillId,skillVersion:task.version,status:"pending",updatedAt:now,
        })),
        updatedAt:now,
      };
      await store.save(checkpoint);
    }
  }

  const persistTask = async (
    taskId: string,
    update: (current: WorkflowCheckpointTask) => WorkflowCheckpointTask,
  ): Promise<void> => {
    if (!checkpoint || !options.checkpointStore) return;
    writeQueue = writeQueue.then(async () => {
      const current = checkpoint!.tasks.find((task) => task.taskId === taskId);
      if (!current) throw new Error(`Checkpoint is missing task "${taskId}".`);
      const nextTask = WorkflowCheckpointSchema.shape.tasks.element.parse(update(current));
      const next: WorkflowCheckpoint = {
        ...checkpoint!,
        revision:checkpoint!.revision + 1,
        updatedAt:Date.now(),
        tasks:checkpoint!.tasks.map((task) => task.taskId === taskId ? nextTask : task),
      };
      await options.checkpointStore!.save(next);
      checkpoint = next;
    });
    await writeQueue;
  };

  let stopped = false;
  let cancelled = options.signal?.aborted ?? false;

  for (const layer of preview.layers) {
    if (stopped || cancelled) break;
    for (let offset = 0; offset < layer.length; offset += maxConcurrency) {
      if (options.signal?.aborted) { cancelled = true; break; }
      const chunk = layer.slice(offset, offset + maxConcurrency).filter((taskId) => !results.has(taskId));
      if (chunk.length === 0) continue;
      const settledChunk = await Promise.allSettled(chunk.map(async (taskId): Promise<TaskExecutionResult> => {
        const planned = plannedById.get(taskId)!;
        const task = taskById.get(taskId)!;
        const skill = registry.get(planned.skillId);
        const input = skill.inputSchema.safeParse(task.input);
        if (!input.success) {
          const error = `Input validation failed: ${input.error.message}`;
          await persistTask(taskId,(current) => ({...current,status:"failed",error,output:undefined,updatedAt:Date.now()}));
          emit(options, {type:"task.failed",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),attempt:1,error});
          return {taskId,skillId:planned.skillId,status:"failed",error};
        }
        const dependencies = Object.fromEntries(task.dependsOn.map((id) => [id, outputs[id]]));
        await persistTask(taskId,(current) => ({...current,status:"running",error:undefined,output:undefined,updatedAt:Date.now()}));
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
                  ...(options.runId && runFingerprint ? {idempotencyKey:workflowTaskIdempotencyKey(options.runId,runFingerprint,taskId)} : {}),
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
          await persistTask(taskId,(current) => ({...current,status:"completed",output:output.data,error:undefined,updatedAt:Date.now()}));
          outputs[taskId] = output.data;
          emit(options, {type:"task.completed",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),attempt});
          return {taskId,skillId:planned.skillId,status:"completed",output:output.data};
        } catch (error) {
          const message = messageOf(error);
          if (options.signal?.aborted) {
            await persistTask(taskId,(current) => ({...current,status:"cancelled",error:message,output:undefined,updatedAt:Date.now()}));
            emit(options, {type:"task.cancelled",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),reason:message});
            return {taskId,skillId:planned.skillId,status:"cancelled",reason:message};
          }
          await persistTask(taskId,(current) => ({...current,status:"failed",error:message,output:undefined,updatedAt:Date.now()}));
          emit(options, {type:"task.failed",workflowId:definition.id,taskId,skillId:planned.skillId,at:Date.now(),attempt,error:message});
          return {taskId,skillId:planned.skillId,status:"failed",error:message};
        }
      }));
      const rejectedTask = settledChunk.find((item): item is PromiseRejectedResult => item.status === "rejected");
      if (rejectedTask) throw rejectedTask.reason;
      const chunkResults = settledChunk.map((item) => (item as PromiseFulfilledResult<TaskExecutionResult>).value);
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
    await persistTask(planned.taskId,(current) => ({
      ...current,status:cancelled ? "cancelled" : "skipped",error:reason,output:undefined,updatedAt:Date.now(),
    }));
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
