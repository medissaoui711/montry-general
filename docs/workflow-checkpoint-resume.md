# Workflow checkpoint persistence and resume

Pass `runId` and `checkpointStore` together to enable checkpoint persistence.
Pass `resume: true` as well to restore a previously saved run.

```ts
const store = new InMemoryWorkflowRunStore();
const result = await executeWorkflow(workflow, registry, {
  runId: "customer-request-2026-001",
  checkpointStore: store,
});
```

The in-memory adapter is process-local and is intended for tests or single-process
workflows. A production adapter must persist checkpoints durably and provide atomic,
monotonic per-run writes (for example with a database transaction or compare-and-swap).

## Persistence guarantees

- A new run writes its initial pending-task checkpoint before any provider executes.
- A task is persisted as `running` before its provider is invoked.
- A validated output is persisted as `completed` before dependent tasks are scheduled.
- Writes are serialized within one execution so parallel tasks cannot overwrite each
  other's snapshots.
- Resume validates the workflow fingerprint, task set, selected skill IDs and versions.
- Completed outputs are validated again against the currently registered output schema
  before they are restored.

## Safe resume policy

A task restored as `running`, `indeterminate`, `failed`, or `cancelled` is only
eligible for automatic replay when its skill declares `retrySafe: true`. Otherwise
resume fails closed and explains which task needs operator intervention. Skipped tasks
return to pending because they were not invoked by the previous execution.

A process may crash after a provider performs an external side effect but before its
completed output is durably saved. Such a task is indistinguishable from an interrupted
running task. The runtime therefore does not promise exactly-once effects. Skills that
opt into safe replay should use durable idempotency keys, deduplication, or transactional
provider APIs wherever possible.

If a checkpoint save fails before invocation, the provider is not called. If saving a
completed result fails after the provider returns, the persisted state remains running;
the next resume applies the same conservative replay policy.

## Limits

- Checkpoint storage is a pluggable contract; no filesystem, SQLite, or hosted database
  adapter is included in this package.
- Concurrent workers must coordinate through an atomic backend. The runtime's local
  write queue only serializes writes made by one invocation.
- A workflow fingerprint change or skill version change requires a new run ID or an
  explicit migration process; old outputs are never silently reused.
