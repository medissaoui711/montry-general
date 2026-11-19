---
name: motion-builder
version: 1.1.0
description: Deterministic Remotion motion and word-level reveal rules.
---

# motion-builder
- Reveal body text one word at a time, adding one word every 0.4 seconds.
- Reset the reveal at each scene boundary.
- Use the soft wipe as a transition into each scene; do not distort or slide text out.
- Each scene must remain visible for at least 0.4 seconds per word.
- The complete scene timeline must fill exactly 42.2 seconds.
- The locked brand ending begins at 42.2 seconds and is not part of the scene timeline.
- Remotion frame time is authoritative; do not use wall-clock timers.
