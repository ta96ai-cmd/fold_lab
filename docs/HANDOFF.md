# REA Fold Lab — project handoff (18 Nov 2026)

Packaging web tool for Navratan Offset, started as an REA (Reverse Engineering Anything) of a
"dieline → 3D box" Instagram reel. Built from scratch; box styles come from public FEFCO/ECMA standards.

## Where everything is
- **GitHub:** https://github.com/ta96ai-cmd/fold_lab (branch `main`)
- **Live site (Vercel, auto-deploys on push):** https://fold-lab-omega.vercel.app
- **The only local repo:** `D:\Blender OP\rea-fold-lab` (has the `.git`). `D:\FOLD LAB\rea-fold-lab` is an old copy without Git; do not use it.
- **Browser downloads** land in `C:\Users\Admin\Downloads` (sometimes `D:\Blender OP`).
- Latest commit: `56fe3ae` v0.13 · **14 box styles · 77 tests passing**

## Stack
Vite + Three.js, plain JS modules. `npm run dev` · `npm run build` · `npm run build:single` (one-file HTML) · `npm test` (node --test).
Libraries: three, pdf-lib, pdfjs-dist 4.10.38, clipper-lib, mp4-muxer; dev: pngjs, vite-plugin-singlefile.

## The three tabs
1. **3D Fold** — load a dieline (SVG / PDF / .ai), it finds panels and hinges and folds it in 3D; board thickness, artwork, 9 camera moves; export PNG, MP4, GLB (Blender).
2. **Dieline Maker** — pick a style, type the size (inside / die-cut / outside; mm, cm, inch, 1/64"), get the cutting layout with cut/crease lines, dimensions, bleed/safe, statistics, nesting on a sheet; export PDF (CutContour/Crease spot colours), SVG, DXF.
3. **Personalise** — upload a client template PDF (kept only in the browser, never committed), mark logo zones, drop a client logo; finishes (foil gold/silver/rose, spot UV, emboss, deboss) as separate spot-colour plates; output = artwork + plates + KLD + instruction sheet, auto versions V1, V2…

## Box styles (14)
- Tuck-end: Reverse tuck, Straight tuck · Lock-bottom: Auto-lock · Seal end · Sleeve · Tray with lid
- Mailers: Mailer roll-end front tuck (FEFCO 0427) · Postal box without lid side flaps (0471-style) · **Flip-top mailer with lock tabs (0427 type)**, built like Packmage E005C: tuck side wings, finger notch, rounded lid flaps, rectangle ears, single front wall, double crease on side walls, lock tabs + base slots (all switchable)
- Corrugated: RSC 0201 · OSC 0202 (overlap setting, min 25 mm) · FOL 0203 · CSSC 0204 · HSC 0200

## Key code
- `src/generator/styles.js` — every style (`STYLES`), `num()` lengths, `count()` counts (never unit-converted), `mailer(p, opt)` with the flip-top options, `slotted()` for the corrugated family
- `src/generator/core.js` — `buildDieline(pieces, creases, holes)`; holes = slots/handle holes
- `src/engine/fold-engine.js` — planar graph → faces → hinges; step 3b ignores closed cut outlines inside a panel (holes)
- `src/generator/writers.js` (SVG/PDF/DXF), `nesting.js`, `guides.js`; `src/ui/maker.js`; `src/personalise/*`

## How we work
- **Updates:** small changes = find-and-replace snippets (find this / replace with), not whole files. Big changes = zip, then
  `Expand-Archive` to `D:\temp`, `robocopy D:\temp\rea-fold-lab "D:\Blender OP\rea-fold-lab" /E /XD .git node_modules dist dist-single`, `npm install`, `npm test`, `git add -A`, `git commit`, `git push`.
- Never `git push --force` without a backup branch. Check `git status` before copying over files.
- Copy-paste only the commands, never the `PS D:\...>` prompt or old output.

## Rules
- Do not copy Packmage (or anyone's) templates, code or drawings. Match what a box does, built from standards and our own formulas.
- Do not try to get around the Hunger Inc Tools login.
- Client artwork/templates are never committed to the repo.

## Open items
1. Header label still says **v0.12** → change to v0.13 in `index.html` (3 places).
2. "Chamfering of edges" from Packmage E005C: meaning unknown, needs a photo or explanation from the boss.
3. FEFCO 0471: confirm against a real sample (now labelled "0471-style").
4. Keep adding standard styles toward 50+ (more 04xx folders, 03xx telescope, drawer/slide 05xx, inserts 09xx, bags).
5. Personalise: batch mode (many clients/logos in one run), 3D proof for rigid-box templates.
6. Optional: board presets (E/B/C flute, double wall) instead of typing the caliper.
