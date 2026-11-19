---
name: montry
version: 1.3.0
description: Open-source skills orchestration system with capability discovery, provider resolution and deterministic workflow execution.
---

# Montry skills orchestration

## Core responsibility
Coordinate specialist skills through versioned contracts. Renderers, models and external providers are capabilities used by skills; they are not the orchestration layer.

## Skill discovery and provider selection
1. Read local \`skill.json\` manifests under the configured skills root.
2. Validate each manifest and its directory identity.
3. Index the capabilities provided by each skill.
4. Confirm every required capability has at least one provider.
5. When a workflow requests a capability, resolve it to a registered implementation.
6. If multiple implementations provide the same capability, require an explicit provider choice. Never select one arbitrarily.

Manifest discovery is metadata-only. It must not execute code, dynamically import modules, run shell commands, install packages or access the network.

## Workflow execution
1. Validate the workflow and all skill/capability references.
2. Build a deterministic dependency order.
3. Validate each skill input and output against its declared schema.
4. Pass each skill only the outputs of its declared dependencies.
5. Record completed, failed and skipped task outcomes.
6. Send validated production outputs to the selected rendering/delivery capability.
7. Run independent quality checks before declaring a deliverable complete.

## Skill contract
Every executable skill must expose:
- A stable namespaced identifier.
- A semantic version.
- Explicit input and output schemas.
- Declared capabilities.
- An execution function receiving workflow/task context and declared dependency outputs.

## Current runtime boundary
The current in-process runtime uses deterministic topological scheduling and fail-fast execution. Persistence, retries, parallel execution, sandboxing, remote installation and distributed workers are not yet implemented and must not be claimed.

## Current Remotion capability
- 1080×1920 portrait, 60fps, 46.2 seconds.
- H.264 MP4 with no audio stream.
- Scene body fills exactly 42.2 seconds; locked ending occupies the final 4 seconds.
- One additional body word is revealed every 0.4 seconds.
- Production rendering rejects missing, unsafe or placeholder logos.

## Release gate
A release is not complete until CI passes and the rendered MP4 is inspected for silence, duration, frame size, frame rate, word timing, Arabic/Latin rendering and complete ending geometry.
