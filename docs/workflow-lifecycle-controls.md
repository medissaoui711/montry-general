# Workflow lifecycle controls

The in-process runtime accepts optional lifecycle controls:

```ts
const controller = new AbortController();
const events: WorkflowExecutionEvent[] = [];

const result = await executeWorkflow(workflow, registry, {
  maxConcurrency: 3,
  taskTimeoutMs: 30_000,
  maxAttempts: 3,
  initialRetryDelayMs: 200,
  retryBackoffMultiplier: 2,
  maxRetryDelayMs: 2_000,
  signal: controller.signal,
  onEvent: (event) => events.push(event),
});
```

- `signal` cancels active work and prevents later tasks/chunks from being scheduled.
If cancellation occurs before a skill invocation starts, the task is `cancelled`.
If cancellation occurs after invocation begins, the task and workflow are
`indeterminate` because the external outcome may be unknown.
- `taskTimeoutMs` is an optional per-attempt timeout from 1 through 600000 milliseconds.
A timeout after invocation begins produces `indeterminate` and is never retried automatically.
- Every skill receives an `AbortSignal` in `SkillExecutionContext.signal`. Providers should pass it to cancellable APIs and stop their own work when aborted. JavaScript cannot forcibly terminate a provider that ignores the signal; the runtime stops waiting for it, but that provider may continue in the background.
- `deadlineAt` is supplied in the skill context and `task.started` event when a timeout is configured.
- `onEvent` receives `task.started`, `task.retrying`, `task.completed`, `task.failed`,
`task.skipped`, `task.cancelled` and `task.indeterminate` events. Attempt numbers and retry delays are included where relevant. Event timestamps are Unix epoch milliseconds. Observer exceptions are isolated and do not change workflow results.

## Safe retries

Retries are disabled by default (`maxAttempts: 1`). A skill implementation must explicitly declare `retrySafe: true` to opt in; that declaration is a provider guarantee that repeating its execution cannot create unsafe duplicate side effects. A workflow-wide attempt limit never overrides a skill's opt-out.

- `maxAttempts`: 1–10 total attempts, including the first.
- `initialRetryDelayMs`: initial delay before retry; defaults to 100ms.
- `retryBackoffMultiplier`: exponential multiplier from 1–10; defaults to 2.
- `maxRetryDelayMs`: caps each delay at 60000ms; defaults to 5000ms.
- Retry events include the failed attempt, next attempt, delay and error.
- Only provider execution errors are eligible. Input/output contract failures, timeouts and workflow cancellation are not retried.
- Cancellation during backoff prevents the next attempt. Providers still must honor the per-attempt AbortSignal.

Retries are not a substitute for durable idempotency keys or transactional side-effect handling. Skills that write files, charge payments, publish content or otherwise mutate external state should remain non-retryable unless they implement and document a robust deduplication strategy.
