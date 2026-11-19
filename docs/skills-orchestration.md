# Skills orchestration core

Montry is organized as a skills orchestration system. Rendering engines and external providers are replaceable capabilities; they are not the orchestration layer.

## Core concepts

- **Skill**: a versioned capability with explicit Zod input and output schemas and an execution function.
- **Registry**: the runtime catalog of installed skills. Duplicate IDs and invalid versions are rejected.
- **Workflow**: a bounded list of tasks. Each task names a skill, supplies JSON input, and declares task dependencies.
- **Planner**: validates references and builds a stable topological order. Independent tasks retain their declaration order.
- **Runtime**: validates each skill input and output, passes only declared dependency outputs, and records task outcomes.

## Runtime guarantees

- Workflow and task structure is validated before execution.
- Unknown skills, unknown dependencies, duplicate task IDs/dependencies, self-dependencies, and cycles are rejected before any skill runs.
- Execution follows a deterministic topological order.
- Inputs and outputs are checked against the skill's declared schemas.
- A task receives outputs only from dependencies it explicitly declared.
- The first task failure stops the workflow; all remaining tasks are marked skipped.
- The runtime does not silently substitute mock outputs or external providers.

## Deliberate boundaries

This is an in-process orchestration foundation, not a distributed job system. It does not yet claim persistence, retries, parallel scheduling, sandbox isolation, remote skill installation, or cross-process execution. Those capabilities require separate contracts and operational controls.

External capabilities such as Openverse search and Earshot analysis/generation will be integrated as optional skill providers behind this contract. Their availability, licensing and model/runtime requirements must not become hard dependencies of the core registry or planner.
