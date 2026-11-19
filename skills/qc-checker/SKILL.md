---
name: qc-checker
version: 1.1.0
description: Validate MP4 output and report failures with evidence.
---

# qc-checker

## Input and brand gates
- Confirm the reel JSON passes schema and exact 42.2-second timeline validation.
- Confirm the selected brand configuration is production-ready.
- Confirm the logo is present, self-contained SVG, 360×360, and not the placeholder.
- Reject scripts, event handlers, and external network references inside SVG.

## MP4 gates
- Confirm a real MP4 exists; HTML or a Remotion preview is not a deliverable.
- Confirm 1080×1920, 60fps, and 46.2 seconds.
- Confirm there is no audio stream.
- Inspect representative scene frames for word reveal, soft wipe, clipping, and Arabic/Latin shaping.
- Inspect the ending at 42.2s, 43.8s, 44.8s, and near 46.2s.
- Confirm logo, local name, Latin name, and slogan remain visible through the end.
- Report only failures, with timestamps and reproducible evidence. Never claim visual QC from unit tests alone.
