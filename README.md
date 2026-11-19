# montry-general

**Open-source silent reels engine** — create deterministic vertical videos with word-level reveal, configurable brand identity, a locked ending, and an actual MP4 export.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What it does

- Renders portrait videos at **1080×1920**, **60fps**, **46.2 seconds**.
- Exports **H.264 MP4** with audio disabled.
- Reveals body copy one word every **0.4 seconds**.
- Keeps the final **4-second brand ending** structurally locked.
- Supports per-user brand JSON and SVG logo files.
- Uses a bundled Cairo font for Arabic and Latin text.
- Uses Remotion, Chromium rendering, and FFmpeg-backed media encoding.

## Architecture

```
Reel JSON ──► Zod validation ──► Timeline ──► Remotion Composition
                                                  │
Brand JSON + SVG ──► Brand validation ────────────┤
                                                  ▼
                                      Chromium frame rendering
                                                  │
                                                  ▼
                                         H.264 silent MP4
```

Repository responsibilities:

- `src/schema.ts`: preview and production input contracts.
- `src/timeline.ts`: deterministic frame timeline and word reveal.
- `src/Reel.tsx`: scene composition and locked ending.
- `scripts/render.ts`: command-line MP4 renderer.
- `src/logo.ts`: SVG safety and dimensions validation.
- `skills/`: agent-facing workflow contracts and preserved HTML reference.

## Requirements

- Node.js 22+
- npm
- A real SVG logo (360×360) for production rendering

## Quick start

Install dependencies:

```bash
npm install
npm run typecheck
npm test
```

Open the generic preview composition:

```bash
npm run studio
```

The preview opens with the complete generic demo reel, demo brand, and sample mark. These are examples for preview only; the production renderer rejects untouched default sample identity values and placeholder logos.

## Configure a brand

The simplest setup is to edit values in `skills/template-reels/brand.json` and replace `skills/template-reels/logo-360.svg` with your own self-contained 360×360 SVG.

For multiple brands or a shared installation, keep each brand configuration separate. The logo file must sit beside its brand JSON and its filename must match `logo_file`.

Example:

```text
brands/
  client-a/
    brand.json
    logo.svg
  client-b/
    brand.json
    logo.svg
```

Each brand JSON retains the same schema and locked ending geometry. The renderer does not require editing engine source code to switch brands.

## Reel input

A reel input is JSON containing a title and one to twelve scenes:

```json
{
  "title": "Example reel",
  "scenes": [
    {
      "id": "scene-1",
      "title": "First idea",
      "body": "Make every frame tell a clear story",
      "durationSec": 14
    },
    {
      "id": "scene-2",
      "title": "Second idea",
      "body": "Keep each message focused and readable",
      "durationSec": 14
    },
    {
      "id": "scene-3",
      "title": "Final idea",
      "body": "Finish with a consistent brand signature",
      "durationSec": 14.2
    }
  ]
}
```

Validation rules:

- Scene IDs must be unique.
- Each scene must have enough duration for its word count at 0.4 seconds per word.
- Combined scene duration must equal 42.2 seconds so the body fills the timeline without a blank gap before the ending.
- The final 4 seconds are reserved for the locked brand ending.

## Render an MP4

After configuring `skills/template-reels/brand.json` and replacing its placeholder SVG logo:

```bash
npm run render -- ./reel-input.json ./out/reel.mp4
```

Using the included, editable demo brand and reel:

```bash
npm run render -- ./examples/reel-input.example.json ./out/demo.mp4 --brand ./examples/brand.example.json
```

Using an independent brand configuration:

```bash
npm run render -- ./reel-input.json ./out/client-a.mp4 --brand ./brands/client-a/brand.json
```

The logo is resolved relative to the selected brand JSON. The renderer refuses missing logos, sample identity placeholders, invalid dimensions, scripts, event handlers, and external network references inside SVG files.

## Locked ending contract

The ending occupies 42.2s–46.2s and its geometry/timing is validated:

| Element | Position | Appears |
|---|---:|---:|
| Logo | 360×360 at x=360, y=520 | 42.2s |
| Local brand name | y=1000 | 42.2s |
| Latin brand name | y=1180 | 43.8s |
| Slogan (LTR) | y=1360 | 44.8s |

The brand content is configurable; the layout contract is not. This keeps the engine reusable while preserving a consistent ending structure.

## Quality and release checks

```bash
npm run typecheck
npm test
npm run render -- ./reel-input.json ./out/reel.mp4
```

A release candidate must additionally be inspected for:

- 1080×1920 dimensions and 60fps
- 46.2-second duration
- No audio stream
- Correct Arabic/Latin shaping
- Word reveal timing
- All four ending elements and their timing
- No missing glyphs or clipped text

A passing unit test suite alone is not proof that a rendered MP4 is visually correct.

## Contributing

1. Fork the repository.
2. Create a focused feature branch.
3. Run type-check and tests.
4. If changing rendering behavior, attach a real MP4 and representative ending-frame evidence to the pull request.
5. Preserve the brand configuration contract and locked ending unless a documented design change is proposed.

## License

MIT. See [LICENSE](LICENSE).
