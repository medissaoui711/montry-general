# Workflow checkpoint persistence and resume

Pass `runId` and `checkpointStore` together to enable checkpoint persistence.
Pass `resume: true` as well to restore a previously saved run.

```ts
const store = new FileWorkflowRunStore("./.montry/checkpoints");
const result = await executeWorkflow(workflow, registry, {
  runId: "customer-request-2026-001",
  checkpointStore: store,
});
```

`InMemoryWorkflowRunStore` is process-local and intended for tests or ephemeral runs.
`FileWorkflowRunStore` persists JSON checkpoints to local disk, uses restrictive file
permissions, hashes run IDs into filenames, and replaces files through a same-directory
atomic rename. It serializes writes across store instances in the same Node.js process.
Do not share its directory between multiple processes: use a database-backed adapter with transactions or
compare-and-swap for multi-worker deployments.

## Persistence guarantees

- A new run writes its initial pending-task checkpoint before any provider executes.
- Checkpointed workflow inputs and outputs must be JSON-compatible; undefined values,
  non-finite numbers, and non-plain objects are rejected rather than silently changed.
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

The runtime supplies a stable `context.idempotencyKey` whenever checkpointing is enabled.
It is derived from the run ID, workflow fingerprint, and task ID, and remains stable
across retries and resumes. Providers should forward it to external APIs or store it in
their own deduplication ledger.

A process may crash after a provider performs an external side effect but before its
completed output is durably saved. Such a task is indistinguishable from an interrupted
running task. The runtime therefore does not promise exactly-once effects. Skills that
opt into safe replay should use durable idempotency keys, deduplication, or transactional
provider APIs wherever possible.

If a checkpoint save fails before invocation, the provider is not called. If saving a
completed result fails after the provider returns, the persisted state remains running;
the next resume applies the same conservative replay policy.

## Limits

- `FileWorkflowRunStore` is a durable single-process adapter; it is not a distributed
  lock or multi-process compare-and-swap implementation.
- Hosted database adapters remain pluggable and must provide atomic per-run writes.
- Concurrent workers must coordinate through an atomic backend. The runtime's local
  write queue only serializes writes made by one invocation.
- A workflow fingerprint change or skill version change requires a new run ID or an
  explicit migration process; old outputs are never silently reused.
