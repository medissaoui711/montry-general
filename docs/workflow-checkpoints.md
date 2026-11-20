# Workflow run checkpoints

The orchestration package exposes a versioned checkpoint format and a pluggable
`WorkflowRunStore` contract. Checkpoints identify a run independently from the
workflow ID and include a SHA-256 fingerprint of the workflow definition.

## Store contract

- `load(runId)` returns a validated checkpoint or `null`.
- `save(checkpoint)` atomically replaces the checkpoint for that run.
- Revisions must increase monotonically. The in-memory adapter enforces this rule.
- Persistent adapters shared by multiple workers must implement transactional or
  compare-and-swap writes; a process-local mutex is not sufficient.

`InMemoryWorkflowRunStore` is intended for tests and single-process use only. It
does not survive process restarts and is not a production durable backend.

## Execution safety

This package addition defines storage primitives only; it does not yet claim that
workflow execution can resume automatically. A future runtime integration must
validate workflow fingerprints and skill versions before restoring outputs.

A task left in `running` when a process disappears is indeterminate: the provider
may have performed an external side effect before the checkpoint was updated.
Do not automatically rerun such a task unless the skill explicitly guarantees
safe repetition (for example through durable idempotency keys or deduplication).
Exactly-once execution of external effects cannot be guaranteed by checkpoint
storage alone.

Checkpoint schema version 1 supports task states: `pending`, `running`,
`completed`, `failed`, `skipped`, `cancelled`, and `indeterminate`.
