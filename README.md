# montry-general

> **Silent Reels Studio** — Build publish-ready vertical reels with deterministic motion, word-level sync, and a locked ending. No voice. No guesswork. No deleted logo.

[[License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[[Format: 1080×1920](https://img.shields.io/badge/Format-1080x1920-blue.svg)]()
[[FPS: 60](https://img.shields.io/badge/FPS-60-green.svg)]()
[[Duration: 46.2s](https://img.shields.io/badge/Duration-46.2s-orange.svg)]()
[[Audio: Silent](https://img.shields.io/badge/Audio-Silent-lightgrey.svg)]()
[[Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-black.svg)]()

---

## Why montry-general exists

Most AI video tools fail in the same three places:

1. **They delete the ending.** The logo or slogan disappears because the model thinks it is optional.
2. **They break Arabic + Latin.** Mixed text renders as `□□□` because the font and shaping pipeline is wrong.
3. **They return HTML instead of MP4.** A preview is not a publishable video.

`montry-general` fixes all three by contract, not by prompt luck:

- The ending is **files, not instructions**. The model copies `template.html` + `logo-360.svg` + `brand.json` verbatim.
- The priority is explicit: **template wins over every other skill**. If any skill conflicts with the template, the template wins.
- The output is **real MP4 only**. HTML is a preview, never a deliverable.
- If the logo file is missing, the run **stops**. It never silently deletes the logo and continues.

---

## What it produces

| Property | Value |
|---|---|
| Format | `1080 × 1920` vertical |
| Duration | `46.2s` (configurable, ending locked to last 4s) |
| Frame rate | `60fps` |
| Codec | `H.264` |
| Audio | **Silent** — no voiceover, no music, no SFX |
| Captions | Word-by-word, `0.4s` per word, synced to display time |
| Motion | `Reveal` — left-to-right, soft wipe before each scene |
| Ending | 4 items together until end: logo + local name + latin name + slogan |

---

## Architecture

```
montry-general/
├── README.md
├── LICENSE
└── skills/
    ├── montry/
    │   └── SKILL.md              # Orchestrator. Priority + fixed rules.
    ├── template-reels/
    │   ├── SKILL.md              # PRIORITY #1. Copy files verbatim.
    │   ├── template.html         # Locked template. Do not rewrite.
    │   ├── logo-360.svg          # Your logo, 360×360. Replace this file.
    │   └── brand.json            # Your brand. Edit values only.
    ├── motion-builder/
    │   └── SKILL.md              # Reveal + sync + soft wipe.
    └── qc-checker/
        └── SKILL.md              # Problems only. Never explains correct parts.
```

### Execution flow

```
brand.json ──► template-reels ──► motion-builder ──► qc-checker ──► MP4
     (values)      (copy files)      (Reveal)          (problems only)
```

### Priority contract

```
1. template-reels   ← WINS ALWAYS
2. brand
3. motion-builder
4. qc-checker
```

If any skill tells the model to delete the logo, delete the slogan, or rewrite the ending, **ignore that skill**. The template wins.

---

## Installation

### Option A — Claude / Codex / Antigravity (recommended)

Claude Code and Codex execute files. They do not guess from chat text. Use them.

```bash
# 1. Unzip
unzip montry-general.zip

# 2. Point the agent to the skill folder
# In Codex / Claude Code, first line:
```

> Read the skill from: `./montry-general/skills/template-reels/` and use its files verbatim. Do not rewrite them.

```bash
# 3. Give the script only. Do not re-explain the ending.
```

### Option B — Claude (plugin)

1. `Load a plugin` → select `montry-general.zip`
2. Verify: `skills/montry/SKILL.md` starts with:
```yaml
---
name: montry
version: 1.0.0
```

### Option C — ChatGPT (not recommended for video)

ChatGPT does not accept plugin ZIPs and does not reliably output MP4.

If you must use it:
1. Create a **Project**
2. Paste `skills/template-reels/SKILL.md` into Project instructions
3. Paste `brand.json` values
4. Expect **code**, not MP4. You must export MP4 yourself.

> **Recommendation:** Use Codex for execution, Claude for review. Do not use ChatGPT for video generation.

---

## Quickstart — 3 steps

### Step 1 — Configure your brand (once)

Edit **only** `skills/template-reels/brand.json`:

```json
{
  "brand_name": "YOUR_BRAND",
  "brand_name_local": "اسم علامتك",
  "slogan": "Your Slogan Here",
  "colors": {
    "bg": "#FEF3C7",
    "text": "#1C1917",
    "accent1": "#EA5808",
    "accent2": "#0EA5A4"
  },
  "font": "Cairo",
  "logo_file": "logo-360.svg"
}
```

**Rules:**
- Edit **values only**. Do not change the JSON structure.
- Replace `logo-360.svg` with your real logo, same filename, same size `360×360`.
- Keep the slogan line `dir="ltr"` in `template.html`. This keeps dots in place (`.Build.` not `.Build` reversed by RTL).

### Step 2 — Give the script (per video)

```text
Using montry-general, execute only, do not explain.

Copy files from skills/template-reels/ verbatim.
Build a silent reel, 46.2s, 1080×1920, 60fps.
Topic: [YOUR TOPIC] - 3 steps: [STEP 1] + [STEP 2] + [STEP 3].
Motion: Reveal left-to-right. Each word 0.4s. Soft wipe before each scene.
Audio: none. No voice, no music, no SFX.
If logo file is missing, STOP. Do not delete it.
Output: MP4 only. No HTML.
```

### Step 3 — QC (problems only)

Send one frame at `45.5s`. Check:
- [ ] Logo `360×360` present
- [ ] Local name present
- [ ] Latin name present, once only
- [ ] Slogan present, dots in correct place
- [ ] No `□` boxes
- [ ] No HTML instead of MP4

If all pass → **Publish**. If any fail → Fix that item only. Do not reopen the ending.

---

## The locked ending — do not rewrite

The ending is **4 items together** from `42.2s` to `46.2s`:

| Item | Position | Time | Source |
|---|---|---|---|
| Logo | `360×360`, `left:360`, `top:520` | `42.2–46.2` | `logo-360.svg` |
| Local name | `top:1000` | `42.2–46.2` | From `tick()`, not from `mk()` |
| Latin name | `top:1180` | `43.8–46.2` | `e2`, once only |
| Slogan | `top:1360`, `dir="ltr"` | `44.8–46.2` | `slogan` |

### Critical implementation notes (read before you touch the code)

**1. Line 1 and Line 3 are empty in `mk()` by design.**

```js
// CORRECT - do not "fix" this
e1: mk("", "abs end", 42.2, 46.2, "top:1000px")
slogan: mk("", "seg row top", 44.8, 46.2, "top:1360px")
```

- `e1` text comes from `tick()`: `e1.textContent = AR.slice(0, n)`
- `slogan` words are appended by code after `mk()`
- **Never fill `e1` or `slogan` in `mk()`.** Filling them duplicates the Latin name and breaks the ending. This is the most common model mistake.

**2. The Latin name appears once only, in `e2`.**

```js
// CORRECT
e2: mk("YOUR_BRAND", "abs end", 43.8, 46.2, "top:1180px")
```

**3. The slogan must be `dir="ltr"`.**

```html
<!-- CORRECT -->
<div id="slogan" dir="ltr">Your Slogan Here</div>
```

Without `dir="ltr"`, RTL flips the dots: `.Build. Innovate. Teach` instead of `Build. Innovate. Teach.`

**4. If the logo file is missing, STOP.**

Do not delete the logo and continue. Do not draw a placeholder and continue. Say `logo file missing` and stop.

---

## Motion spec — `motion-builder`

| Rule | Value | Why |
|---|---|---|
| Reveal | Left-to-right, never all at once | Feels hand-drawn, keeps attention |
| Word timing | `0.4s` per word | Matches silent reading speed |
| Sync | Word appears at its display second | No lead, no lag |
| Wipe | Soft wipe before each scene | No hard jump, no slide-out distortion |
| Accumulation | Clear before next scene | No text pile-up |

**Forbidden:**
- Slide-out exit animation (causes sideways distortion)
- All-at-once appearance
- Text that stays on screen across scenes

---

## Text rendering — Arabic + Latin

Mixed Arabic + Latin text breaks in most AI pipelines. `montry-general` requires:

- Font: **Cairo** (supports Arabic + Latin)
- Shaping: `arabic_reshaper` + `python-bidi`
- Slogan: `dir="ltr"` always

**Test:** If you see `□` instead of `DigitalNawa` or `Build.`, the font / shaping is wrong. Stop and fix the font. Do not ship.

---

## Examples

### Example 1 — 3-step tutorial reel

```text
Topic: Claude Code changed web design - 3 steps: Impeccable + Test Skill + Figma MCP + Playwright.
Duration: 46.2s, silent, 1080×1920, 60fps.
```

### Example 2 — Performance Testing explainer

```text
Topic: Performance Testing - Load, Stress, Spike.
Visual: Pixel bars rise for Load, fill orange for Stress, spike for Spike.
Ending: Locked.
```

---

## FAQ

**Q: Why silent? Why no voiceover?**
A: Most Reels are watched muted. Silent + word-by-word captions performs better than distorted TTS, and removes the #1 failure mode (bad audio).

**Q: Why 46.2s?**
A: The ending needs 4s (`42.2–46.2`). The body needs `42.2s` for 3 steps at comfortable reading speed. Change the total if you must, but keep the ending as the last 4s.

**Q: Can I change the ending layout?**
A: No. The ending is locked. Change brand values in `brand.json` only.

**Q: Claude deleted my logo. Is the template broken?**
A: No. The template is files. If the logo is missing in output, the model ignored the priority contract. Use Codex for execution (it copies files verbatim) and Claude for review only.

**Q: ChatGPT gave me HTML. Is that a video?**
A: No. HTML is a preview. A video is MP4. Use Remotion / Codex to export MP4.

---

## Contributing

1. Fork the repo
2. Edit `brand.json` values only for your brand — do not change the ending structure
3. Test with one 10s reel first, then the full 46.2s
4. Open a PR with: `MP4` + frame at `45.5s` + QC checklist

**Do not submit PRs that:**
- Delete the logo / slogan from the ending
- Fill `e1` or `slogan` in `mk()`
- Remove `dir="ltr"` from the slogan
- Return HTML instead of MP4

---

## Roadmap

- [x] v1.0.0 — General skill, locked ending, silent reels
- [ ] v1.1.0 — Remotion exporter (no screen recording)
- [ ] v1.2.0 — RTL / LTR auto-detection for slogan
- [ ] v1.3.0 — Real-logo validator (rejects placeholder `DN` box)

---

## License

MIT — Free for personal and commercial use. See [LICENSE](LICENSE).

## Credits

Built from production failures: deleted endings, `□` boxes, HTML instead of MP4, and Claude vs Codex execution differences. The locked-ending contract exists because those failures happened.
