# Workflow run checkpoints

The orchestration package exposes a versioned checkpoint format and a pluggable
`WorkflowRunStore` contract. The runtime integrates this contract for optional
checkpoint persistence and resume when the caller supplies both `runId` and a
store. Checkpoints identify a run independently from the workflow ID and include
a SHA-256 fingerprint of the workflow definition.

## Store contract

- `load(runId)` returns a validated checkpoint or `null`.
- `save(checkpoint)` atomically replaces the checkpoint for that run.
- `compareAndSwap(runId, expectedRevision, checkpoint)` provides atomic create-if-absent
  (`expectedRevision: null`) and revision-checked updates.
- Reconciliation writes use compare-and-swap so stale operator decisions cannot overwrite
  newer runtime state.
- Persistent adapters MUST implement these operations transactionally across workers;
  a process-local mutex is not sufficient.

`InMemoryWorkflowRunStore` is intended for tests and single-process use only. It
does not survive process restarts and is not a production durable backend. No
filesystem, SQLite or hosted database adapter is included in this repository.

## Runtime integration

The runtime supports the following behavior when `runId` and `checkpointStore`
are provided together:

- A new run writes its initial pending-task checkpoint before any provider executes.
- A task is persisted as `running` before its provider is invoked.
- A validated output is persisted as `completed` before dependent tasks are scheduled.
- Writes are serialized within one execution so parallel tasks cannot overwrite each
  other's snapshots.
- With `resume: true`, the runtime validates the workflow fingerprint, task set,
  selected skill IDs and versions before restoring completed outputs.
- Completed outputs are validated again against the currently registered output schema.

The package ships both in-memory and single-host file-backed stores, but does not
ship a multi-host database backend. See
[workflow-checkpoint-resume.md](workflow-checkpoint-resume.md) for the resume
contract and example.

## Execution safety

A task left in `running` when a process disappears is indeterminate: the provider
may have performed an external side effect before the checkpoint was updated.
Timeout or cancellation after the skill invocation has begun is surfaced as
`indeterminate`, persisted when a checkpoint store is configured, and never
automatically replayed—even when `retrySafe: true`. Cancellation before invocation
begins remains `cancelled`. On resume, any task left in `running` after process
loss is atomically converted to `indeterminate`; resume stops until it is reconciled.

Do not interpret checkpoint storage as exactly-once execution. Skills that opt
into safe replay should use durable idempotency keys, deduplication or
transactional provider APIs wherever possible. A provider timeout or process
failure may leave an external side effect uncertain even when the local checkpoint
does not show completion.

Checkpoint schema version 1 supports task states: `pending`, `running`,
`completed`, `failed`, `skipped`, `cancelled` and `indeterminate`.
Indeterminate tasks require an explanation and can be resolved only through the
explicit `reconcileWorkflowTask` API. The API requires a host-supplied authorization
callback; it does not authenticate identities itself. A reconciliation record stores
the actor, evidence, resolution and timestamp. Supported resolutions are:
- `completed`: provider evidence confirms completion; output is validated against the
  registered skill output schema.
- `failed`: evidence confirms a terminal failure/no further action is appropriate.
- `retry-authorized`: authoritative evidence confirms no side effect occurred; the task
  returns to pending. This is an explicit operator decision, not a `retrySafe` shortcut.

The in-memory store remains non-durable. Production reconciliation requires a durable
store implementing atomic compare-and-swap and an authenticated operator boundary.
