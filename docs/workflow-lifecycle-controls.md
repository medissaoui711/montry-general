# Workflow lifecycle controls

The in-process runtime accepts optional lifecycle controls:

```ts
const controller = new AbortController();
const events: WorkflowExecutionEvent[] = [];

const result = await executeWorkflow(workflow, registry, {
  maxConcurrency: 3,
  taskTimeoutMs: 30_000,
  signal: controller.signal,
  onEvent: (event) => events.push(event),
});
```

- `signal` cancels active work and prevents later tasks/chunks from being scheduled. The result status is `cancelled`; affected tasks use the `cancelled` status.
- `taskTimeoutMs` is an optional per-task timeout from 1 through 600000 milliseconds. A timed-out task fails with a timeout error.
- Every skill receives an `AbortSignal` in `SkillExecutionContext.signal`. Providers should pass it to cancellable APIs and stop their own work when aborted. JavaScript cannot forcibly terminate a provider that ignores the signal; the runtime stops waiting for it, but that provider may continue in the background.
- `deadlineAt` is supplied in the skill context and `task.started` event when a timeout is configured.
- `onEvent` receives `task.started`, `task.completed`, `task.failed`, `task.skipped` and `task.cancelled` events. Event timestamps are Unix epoch milliseconds. Observer exceptions are isolated and do not change workflow results.

Defaults preserve existing behavior: sequential execution, no timeout, no cancellation signal and no event observer. Retries are intentionally not implicit; they require a separate idempotency and side-effect policy before they can be safe.
