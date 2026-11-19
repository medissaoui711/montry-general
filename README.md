# montry-general

**Open-source skills orchestration system** with a deterministic Remotion video-rendering capability.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Project direction

Montry is built around coordinating specialized skills through explicit contracts. Creative, visual, audio, research, production and quality skills are independent capabilities. The orchestrator plans their dependencies, validates their inputs and outputs, and records execution outcomes. Rendering engines and external providers are replaceable tools used by skills, not the orchestration core.

## Skills orchestration core

- Versioned skill definitions with Zod input/output contracts.
- A registry that rejects duplicate skill identifiers.
- Workflow tasks with explicit dependencies.
- Stable topological planning with cycle and reference validation.
- Runtime input/output validation and dependency-scoped outputs.
- Fail-fast execution with explicit failed/skipped task results.

See [docs/skills-orchestration.md](docs/skills-orchestration.md) for the contract and current runtime boundaries.

## Current video capability

- Renders portrait videos at **1080×1920**, **60fps**, **46.2 seconds**.
- Exports **H.264 MP4** with audio disabled.
- Reveals body copy one word every **0.4 seconds**.
- Keeps the final **4-second brand ending** structurally locked.
- Supports per-user brand JSON and SVG logo files.
- Uses Remotion, Chromium rendering, and FFmpeg-backed media encoding.

## Architecture

```
Workflow Definition
       |
       v
Skill Registry --> Contract Validation
       |                  |
       v                  v
Dependency Planner --> Orchestration Runtime
                            |
             +--------------+--------------+
             |              |              |
        Creative Skills  Audio Skills  Production Skills
             |              |              |
             +--------------+--------------+
                            |
                     Validated Outputs
                            |
                     Render / Delivery
```

Rendering is one skill capability among many. Optional providers such as Openverse and Earshot must remain behind skill adapters and must not become hard dependencies of the core runtime.

## Repository layout

- `src/orchestration/`: skill contracts, registry, planner and runtime.
- `src/schema.ts`: brand and reel input contracts.
- `src/timeline.ts`: deterministic frame timeline and word reveal.
- `src/Reel.tsx`: Remotion scene composition and locked ending.
- `scripts/render.ts`: command-line MP4 renderer.
- `skills/`: agent-facing skill definitions and reusable workflow guidance.
- `tests/`: contract, planner, runtime and rendering tests.

## Requirements

- Node.js 22+
- npm
- A real SVG logo (360×360) for production rendering

## Quick start

```bash
npm install
npm run typecheck
npm test
npm run studio
```

## Configure a brand

Edit `skills/template-reels/brand.json` and replace `skills/template-reels/logo-360.svg` with a self-contained 360×360 SVG. For multiple brands, keep each brand JSON and logo in a separate folder and pass `--brand path/to/brand.json` to the renderer.

## Reel input and rendering

A reel input is JSON with a title and one to twelve scenes. Scene IDs must be unique, each scene must allow enough time for its word count, and combined scene duration must equal 42.2 seconds.

```bash
npm run render -- ./examples/reel-input.example.json ./out/demo.mp4 --brand ./examples/brand.example.json
```

The logo is resolved relative to the selected brand JSON. The renderer rejects missing logos, sample identity placeholders, invalid dimensions, scripts, event handlers and external network references inside SVG files.

## Current orchestration boundary

The in-process runtime is the first orchestration increment. It does not yet claim persistence, retries, parallel scheduling, sandbox isolation, remote skill installation or cross-process execution. Audio providers and additional specialist skills will be added through the same versioned contract and tested independently.

## Quality gates

```bash
npm run typecheck
npm test
npm run render -- ./examples/reel-input.example.json ./out/demo.mp4 --brand ./examples/brand.example.json
```

A passing unit test suite alone is not proof that a rendered MP4 is visually correct. Inspect output dimensions, frame rate, duration, Arabic/Latin shaping, reveal timing and all locked ending elements.

## Contributing

1. Fork the repository and create a focused branch.
2. Add or update contract tests with each skill or orchestration change.
3. Run type-check and tests.
4. For rendering changes, attach a real MP4 and representative frame evidence.
5. Keep external providers optional and preserve skill-level boundaries.

## License

MIT. See [LICENSE](LICENSE).
