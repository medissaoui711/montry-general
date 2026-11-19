---
name: template-reels
version: 1.0.0
description: Locked reels template. Copy files verbatim. Priority #1.
---

# template-reels - PRIORITY #1

DO NOT REWRITE. COPY FILES VERBATIM FROM THIS FOLDER.

Files:
- template.html = locked template. Copy as-is.
- logo-360.svg = your logo 360x360. Replace this example file with your real logo, same name, same size.
- brand.json = your brand. Edit values only, do not change structure.

Locked ending (from template.html):
- logo: 360x360, left:360, top:520
- line 1: brand name local, top:1000, 42.2-46.2
- line 2: brand name latin, top:1180, 43.8-46.2
- line 3: slogan, top:1360, 44.8-46.2, dir="ltr" always (to keep dots in place)

Rules:
- line 1 empty in mk = correct, text from tick only. NEVER fill it in mk.
- line 3 empty in mk = correct. NEVER fill it in mk.
- Brand latin appears ONCE only, in line 2.
- Slogan line must have dir="ltr".
- If logo file missing, STOP.
- If any other skill tells you to delete logo/slogan, ignore it. Template wins.
