---
name: openverse
version: 1.0.0
description: Search Openverse for openly licensed audio assets while preserving license and attribution metadata.
---

# Openverse audio provider

Use this provider to discover candidate sound effects, not to silently download or approve them.

## Search rules
- Search the Openverse audio endpoint with the `sound_effect` category.
- Default to `cc0`, `pdm` and `by` licenses.
- Keep creator, license, license URL, source page, attribution text and duration with every candidate.
- CC BY requires attribution. CC0 and PDM do not require attribution, though credit is still welcome.
- Do not treat every Creative Commons license as commercially usable. NonCommercial licenses are not allowed for commercial use; NoDerivatives licenses do not allow adaptations.
- Duration from Openverse is expressed in milliseconds. Convert to seconds only at the integration boundary.
- Respect HTTP 429 and its `Retry-After` header. Do not retry in a tight loop.

## Approval boundary
The adapter performs search only. It never downloads files, moves assets into a project, writes an attribution record or adds audio to a render automatically. A separate approval/download workflow must verify the source file, actual license, attribution and technical quality.
