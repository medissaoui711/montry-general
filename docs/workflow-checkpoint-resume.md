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

The in-memory adapter is process-local and intended for tests. For durable single-host
deployments, use `FileWorkflowRunStore`, which uses atomic replacement and per-run
compare-and-swap locks. It is not a distributed store; multi-host deployments must use
a transactional database-backed implementation of `WorkflowRunStore`.

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

A task restored as `indeterminate` is never eligible for automatic replay, regardless
of `retrySafe`. A task left `running` after process loss is atomically converted to
`indeterminate` and resume stops. This is conservative because the provider may have
completed an external effect before the process disappeared. Failed or cancelled
checkpoints may be replayed only when the skill declares `retrySafe: true`; a task
explicitly reconciled as failed is terminal and is not automatically replayed.
Skipped tasks return to pending because they were not invoked by the previous execution.

Use `reconcileWorkflowTask(store, registry, input, authorize)` to resolve an indeterminate task.
The host MUST provide an authorization callback that authenticates/authorizes the actor
and operation; the library does not authenticate users. The call requires the current
checkpoint revision, a non-empty actor ID and evidence.
A stale revision fails closed. `retry-authorized` requires a reason and means an
operator has verified that the provider did not apply the operation. It is not a
general-purpose retry switch.

A process may crash after a provider performs an external side effect but before its
completed output is durably saved. Such a task is indistinguishable from an interrupted
running task. The runtime therefore does not promise exactly-once effects. Skills that
opt into safe replay should use durable idempotency keys, deduplication, or transactional
provider APIs wherever possible.

If a checkpoint save fails before invocation, the provider is not called. If saving a
completed result fails after the provider returns, the persisted state remains running;
the next resume converts it to indeterminate and requires reconciliation before replay.

## Limits

- Checkpoint storage is pluggable. A file-backed single-host adapter is included;
  no multi-host database adapter is included.
- Concurrent workers must coordinate through an atomic backend. The runtime's local
  write queue only serializes writes made by one invocation.
- A workflow fingerprint change or skill version change requires a new run ID or an
  explicit migration process; old outputs are never silently reused.
