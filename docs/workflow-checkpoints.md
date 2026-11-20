# Workflow checkpoint storage

The orchestration runtime now supports checkpoint persistence and safe resume through
the `WorkflowRunStore` contract.

- Use `InMemoryWorkflowRunStore` for tests and ephemeral single-process execution.
- Use `FileWorkflowRunStore` for durable local-disk checkpoints in a single process.
- Implement a transactional or compare-and-swap adapter for multi-worker deployments.

See [workflow checkpoint persistence and resume](./workflow-checkpoint-resume.md) for
usage, recovery policy, provider idempotency keys, JSON compatibility constraints,
and the guarantees and limitations of each adapter.

Checkpoint storage does not provide exactly-once external side effects. Interrupted
tasks are only replayed when their registered skill explicitly declares `retrySafe: true`.
