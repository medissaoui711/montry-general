# montry-general

**Open-source skills orchestration system** with reusable creative, visual, production and quality capabilities, including a deterministic Remotion video-rendering skill.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Project direction

Montry coordinates specialist skills through versioned contracts and explicit workflow dependencies. The orchestrator discovers skill metadata, resolves requested capabilities to registered providers, validates every input/output boundary and records execution outcomes. Renderers, model runtimes and external services are replaceable providers, not the orchestration core.

## Orchestration capabilities

- Versioned skill implementations with Zod input/output contracts.
- Local `skill.json` manifests for discovery and capability indexing.
- Health-aware capability resolution with healthy/degraded/unavailable provider states.
- Workflow tasks may target a stable skill ID or a capability.
- Stable topological planning with cycle, reference and duplicate validation.
- Dependency-scoped outputs, runtime schema validation and fail-fast execution.
- Bounded parallel execution, cooperative cancellation, per-attempt timeouts, safe opt-in retries and structured lifecycle events.
- Typed external adapter contract with pinned provider/source identity, schema-validated input/output, explicit side-effect/cost/idempotency metadata and indeterminate outcomes.
- Safe metadata discovery: no dynamic imports, shell execution, package installation or network access.

See [docs/skills-orchestration.md](docs/skills-orchestration.md), [docs/skill-catalog.md](docs/skill-catalog.md), [docs/bounded-workflow-execution.md](docs/bounded-workflow-execution.md), [docs/workflow-lifecycle-controls.md](docs/workflow-lifecycle-controls.md) and the [External Skill Integration Standard](docs/external-skill-integration.md).

## Current video capability

- Renders portrait videos at **1080×1920**, **60fps**, **46.2 seconds**.
- Exports **H.264 MP4** with audio disabled.
- Reveals body copy one word every **0.4 seconds**.
- Keeps the final **4-second brand ending** structurally locked.
- Supports per-user brand JSON and SVG logo files.
- Uses Remotion, Chromium rendering and FFmpeg-backed media encoding.

## Architecture

```
Workflow Definition
       |
       v
Skill Registry <---- Skill Manifest Catalog
       |                       |
       v                       v
Provider Health ------ Capability Resolver
       |                       |
       +----------+------------+
                  v
           Dependency Planner
                  |
                  v
          Orchestration Runtime
                  |
          Specialist Skills
                  |
          Validated Outputs
                  |
              Render / QC
```

## Repository layout

- `src/orchestration/`: contracts, manifest catalog, registry, capability resolver, planner and runtime.
- `src/schema.ts`: brand and reel input contracts.
- `src/timeline.ts`: deterministic frame timeline and word reveal.
- `src/Reel.tsx`: Remotion scene composition and locked ending.
- `scripts/render.ts`: command-line MP4 renderer.
- `skills/`: agent-facing skill instructions and machine-readable manifests.
- `tests/`: contract, catalog, planner, runtime and rendering tests.

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

## Discover skills

```ts
import {loadSkillCatalog} from "./src/orchestration";

const catalog = await loadSkillCatalog("./skills");
console.log(catalog.skills);
console.log(catalog.providers["video.render"]);
```

The catalog reads local `skill.json` files only. A manifest describes a capability; it does not automatically execute code or install a provider.

## Configure a brand

Edit `skills/template-reels/brand.json` and replace `skills/template-reels/logo-360.svg` with a self-contained 360×360 SVG. For multiple brands, keep each brand JSON and logo in a separate folder and pass `--brand path/to/brand.json` to the renderer.

## Render an MP4

```bash
npm run render -- ./examples/reel-input.example.json ./out/demo.mp4 --brand ./examples/brand.example.json
```

The renderer rejects missing logos, sample identity placeholders, invalid dimensions, scripts, event handlers and external network references inside SVG files.

## Optional audio providers

- **Openverse** searches openly licensed sound-effect candidates and preserves creator, license, attribution, source-page and duration metadata. Search never downloads or approves an asset.
- **Earshot** is an optional local CLI adapter for SFX bank listing, WAV generation and model-free SFX checks. It uses a shell-free process bridge with timeouts and output bounds; it is not installed automatically.

See [docs/audio-provider-adapters.md](docs/audio-provider-adapters.md). The core orchestration runtime works without either provider.

## Current runtime boundary

The in-process runtime supports health-aware provider resolution, bounded parallel scheduling, cooperative cancellation, per-attempt timeouts, explicit idempotency-gated retries, structured lifecycle events and optional checkpoint/resume when a caller supplies a `WorkflowRunStore`. The repository includes only an in-memory store, not a durable production backend; it does not claim sandbox isolation, remote skill installation or distributed execution. External providers such as Openverse and Earshot remain optional adapters behind explicit skill contracts.

## Quality gates

```bash
npm run typecheck
npm test
npm run render -- ./examples/reel-input.example.json ./out/demo.mp4 --brand ./examples/brand.example.json
```

A passing unit test suite alone is not proof that a rendered MP4 is visually correct. Inspect output dimensions, frame rate, duration, Arabic/Latin shaping, reveal timing and all locked ending elements.

## Contributing

1. Fork the repository and create a focused branch.
2. Add or update manifest and contract tests with each skill.
3. Run type-check and tests.
4. For rendering changes, attach a real MP4 and representative frame evidence.
5. Keep external providers optional and preserve capability boundaries.

## License

MIT. See [LICENSE](LICENSE).
