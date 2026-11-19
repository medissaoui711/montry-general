---
name: montry
version: 1.1.0
description: Open-source silent reels orchestrator backed by a configurable Remotion renderer.
---

# montry-general

## Execution priority
1. User-selected brand JSON and SVG logo.
2. Locked ending geometry and timing contract.
3. Validated reel input and deterministic timeline.
4. Remotion renderer and automated media QC.
5. Legacy HTML reference only when explicitly requested.

## Fixed output contract
- 1080×1920 portrait, 60fps, 46.2 seconds.
- H.264 MP4 with no audio stream.
- Scene body fills exactly 42.2 seconds; the locked ending occupies the final 4 seconds.
- Reveal one additional body word every 0.4 seconds.
- Preserve all four ending elements, positions, and entry times.
- Never substitute a personal or repository-owner brand for the user's configured brand.
- Reject missing, unsafe, or placeholder production logos.
- HTML is a reference/preview only; it is never the final video deliverable.

## Brand selection
- Remotion Studio preview uses `examples/brand.example.json` and `examples/reel-input.example.json`.
- Default CLI brand configuration: `skills/template-reels/brand.json` (sample values are rejected for production until configured).
- For a separate user/client identity, provide a brand JSON and a self-contained 360×360 SVG beside it.
- Use `--brand path/to/brand.json` when rendering.
- Never overwrite a shared brand configuration when rendering for a different user.

## Render
```bash
npm install
npm run typecheck
npm test
npm run studio
npm run render -- ./examples/reel-input.example.json ./out/demo.mp4 --brand ./examples/brand.example.json
```

## Release gate
A release is not complete until CI passes and a real MP4 has been rendered and inspected for silence, duration, frame size, frame rate, word timing, Arabic/Latin rendering, and the complete locked ending.
