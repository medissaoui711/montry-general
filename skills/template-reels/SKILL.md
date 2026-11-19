---
name: template-reels
version: 1.1.0
description: Shared locked-ending contract and default sample brand configuration.
---

# template-reels

This folder contains the shared brand schema example and the preserved legacy HTML reference. The Remotion renderer is the production MP4 path.

## Files
- `template.html`: preserved v1.0 HTML reference/preview. Do not treat it as an MP4 renderer.
- `logo-360.svg`: generic placeholder asset for the default sample configuration. Production rendering rejects it until replaced.
- `brand.json`: default sample brand configuration. Edit values only, or pass a separate brand JSON with `--brand`.

## Locked ending contract
- Logo: 360×360, left 360, top 520; visible from 42.2s.
- Local brand name: top 1000; visible from 42.2s.
- Latin brand name: top 1180; visible from 43.8s.
- Slogan: top 1360; visible from 44.8s; always LTR.
- Ending remains visible through 46.2s.

## Rules
- Brand content is user-configurable; ending geometry and timing are fixed.
- The Latin brand name appears once only.
- Keep slogan direction LTR to preserve punctuation.
- If the production logo is missing, invalid, externally linked, or still the placeholder, stop rendering.
- Do not rewrite the legacy HTML template as part of normal Remotion rendering.
