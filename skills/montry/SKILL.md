---
name: montry
version: 1.2.0
description: Open-source skills orchestration system with replaceable creative, audio, visual and production capabilities.
---

# Montry skills orchestration

## Core responsibility
Coordinate specialized skills through versioned contracts. Do not treat a renderer, media provider or model as the orchestrator.

## Execution priority
1. Validate the workflow and all skill/dependency references.
2. Build a deterministic dependency order.
3. Validate every skill input and output against its declared schema.
4. Pass each skill only the outputs of its declared dependencies.
5. Record completed, failed and skipped task outcomes.
6. Send validated production outputs to the selected rendering/delivery capability.
7. Run independent quality checks before declaring a deliverable complete.

## Skill contract
Every skill must expose:
- A stable namespaced identifier.
- A semantic version.
- An explicit input schema.
- An explicit output schema.
- An execution function that receives workflow/task context and declared dependency outputs.

External tools are adapters used by skills. They must not become mandatory dependencies of the orchestration core.

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
