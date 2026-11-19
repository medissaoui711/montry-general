# Skills orchestration core

Montry is organized around coordinating specialized skills. Rendering engines and external providers are replaceable capabilities; they are not the orchestration layer.

## Core concepts

- **Skill**: a versioned capability with explicit Zod input/output schemas and an execution function.
- **Manifest catalog**: local metadata describing skill identity, capabilities, requirements and implementation status.
- **Registry**: the runtime catalog of trusted implementations, their capabilities and their current operational health.
- **Capability resolver**: maps a workflow capability request to a healthy provider, or to a sole degraded provider when no healthy option exists. Ambiguous choices always require explicit selection.
- **Workflow**: a bounded list of tasks. Each task names a skill or capability, supplies JSON input and declares task dependencies.
- **Planner**: validates references and builds a stable topological order.
- **Runtime**: validates each skill input/output, passes only declared dependency outputs and records task outcomes.

## Provider health

Registered providers begin in the `healthy` state. The host application can update a provider to `degraded` or `unavailable` through `SkillRegistry.setProviderHealth`, optionally attaching a diagnostic reason. Health snapshots are available through `getProviderHealth` and `listProviderHealth`.

Automatic capability resolution follows a conservative order:

1. Select the sole healthy provider.
2. If there are no healthy providers, select the sole degraded provider.
3. If multiple candidates exist at the selected level, require an explicit provider.
4. Never automatically select an unavailable provider.

An explicit provider hint can select a degraded provider, but cannot override an unavailable state. The registry does not perform network probes, restart providers, or infer health from manifest metadata; health monitoring and state updates belong to the host integration. This keeps provider lifecycle policy deterministic and the orchestration core independent from external services.

## Runtime guarantees

- Workflow/task structure is validated before execution.
- Unknown skills, unknown capabilities, duplicate task IDs/dependencies, self-dependencies and cycles are rejected before any skill runs.
- Capability selection is deterministic and health-aware; ambiguous providers are never selected implicitly.
- Execution follows a stable topological order.
- Inputs and outputs are checked against the skill's declared schemas.
- A task receives outputs only from dependencies it explicitly declared.
- The first task failure stops the workflow; remaining tasks are marked skipped.
- The runtime does not silently substitute mock outputs or external providers.

## Deliberate boundaries

This is an in-process orchestration foundation, not a distributed job system. It does not yet claim persistence, sandbox isolation, remote skill installation or cross-process execution. Those capabilities require separate contracts and operational controls.

External capabilities such as Openverse search and Earshot analysis/generation remain optional skill providers behind these contracts. Their availability, licensing and model/runtime requirements must not become hard dependencies of the core registry or planner.
