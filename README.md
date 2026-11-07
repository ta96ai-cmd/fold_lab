# REA Fold Lab

Turn a flat box **dieline (SVG)** into a **foldable 3D packaging preview** in the browser.
Built from an REA (Reverse Engineering Anything) breakdown of a packaging-preview reel. See `docs/REA-report.md`.

## Quick start

```bash
npm install
npm run dev            # opens http://localhost:5173 with live reload
npm test               # engine tests (Node 20+)
npm run build          # normal site      -> dist/
npm run build:single   # one offline HTML -> dist-single/index.html
```

## How it works

1. **Parse SVG or PDF** (`src/svg/parse-svg.js`, `src/svg/parse-pdf.js`): reads every stroked path, line, rect, polygon and curve, applies transforms, and groups lines by stroke colour (dashed lines count as their own group). PDFs and PDF-compatible Illustrator (.ai) files are read with pdf.js (page 1): only stroked lines are used, fills, text and images are ignored, and spot/CMYK colours are converted to RGB so cut and crease still get told apart.
2. **Map colours** (sidebar): each colour is set to Cut, Crease or Ignore. By default magenta, red and black become Cut; cyan, blue, green and any dashed colour become Crease.
3. **Find panels** (`src/engine/fold-engine.js`): builds a planar graph from all lines, splits at intersections (tolerating creases that stop a little short), and traces the closed faces. Those faces are the panels.
4. **Find hinges**: two panels sharing a crease edge form a hinge. A spanning tree grows from the largest panel, and each hinge stores its axis and which way is "fold back".
5. **Fold in 3D** (`src/viewer/viewer.js`): Three.js nests every child panel inside a pivot on its hinge axis, so rotating one hinge carries all the panels beyond it.

## Project layout

```
index.html                 page markup
src/main.js                state + UI wiring
src/styles.css
src/engine/fold-engine.js  panels, hinges, tree (pure JS, no DOM)
src/engine/fold-animation.js
src/engine/sample-dieline.js
src/engine/presets.js      fold presets, lid detection
src/art/sample-art.js      original sample artwork for any dieline
src/viewer/camera-moves.js 9 camera paths
src/export/                image + MP4 export, sizes, download
src/storage/library.js     saved dielines (IndexedDB)
src/generator/core.js      pieces + explicit creases -> cut/crease lines
src/generator/styles.js    7 parametric box styles
src/generator/writers.js   SVG, PDF (spot colours, layers), DXF
src/generator/guides.js    bleed and safe area (Clipper offsets)
src/generator/nesting.js   sheet layout
src/ui/maker.js            Dieline Maker tab
src/svg/parse-svg.js       SVG -> line segments (browser)
src/viewer/viewer.js       Three.js scene, hinge pivots, camera
src/ui/flat-preview.js     2D dieline map
test/fold-engine.test.js   node:test suite
docs/REA-report.md         the reverse-engineering breakdown
```

## Roadmap

- **Phase 1 (done):** SVG import, cut/crease mapping, panel and hinge detection, fold sliders, fold animation.
- **Phase 2 (done):** board thickness (hinges on the inside surface), exterior and interior artwork, sample artwork, fold presets (Flat, Half, Closed, Lid open), 3 camera moves (Showcase orbit, Hero reveal, Top-down reveal) with the lid opening mid-shot.
- **Phase 3 (done):** PNG export (1080p, 4K, square, vertical; fit-to-frame; transparent background), MP4 export (H.264, 30/60fps, landscape / vertical Reels / square, rendered frame by frame), all 9 camera moves, "My dielines" library saved in the browser.
- **v0.11 (done):** postal box without lid side flaps (FEFCO 0471-style): the 0427 mailer minus the lid's side dust flaps; less board, folds closed, exports SVG/PDF/DXF. Marked "-style" until checked against a real 0471 sample.
- **v0.10 (done):** slotted corrugated family (FEFCO 02xx): RSC 0201, OSC 0202 (overlap), FOL 0203 (full overlap), CSSC 0204 (all flaps meet), HSC 0200 (open-top bin) — one engine, each folds closed and exports SVG/PDF/DXF. Start of a 50+ standard-box library built from public FEFCO/ECMA standards.
- **v0.9 (done):** corrugated shipping carton — Regular Slotted Container (RSC, FEFCO 0201). Standard formula: 4 walls + manufacturer joint tab, every top and bottom flap = half the width so the outer flaps meet; folds closed in 3D, exports SVG / PDF / DXF, nests on the sheet. Built from the public FEFCO standard, not copied from any tool.
- **v0.8 (done):** Personalise tab: upload a client template PDF (stored only in your browser), mark designs and logo zones, drop in a client logo (PDF/SVG/PNG/JPG) with a resolution and colour report, keep colours or print single-colour CMYK, add finishes as per order (gold/silver/rose foil, spot UV, emboss, deboss as spot-colour plates), generate a print-ready PDF (artwork + one plate per finish + KLD + instructions page) with automatic versions V1, V2...
- **v0.7 (done):** style gallery (categories, search, thumbnails, style codes); size modes inside / die-cut / outside; units mm, cm, inch, 1/64 inch; board caliper in mm or pt; statistics (cut and crease line length, board used, rectangle, utilisation; per-sheet cut/crease metres). See docs/REA-packmage.md.
- **v0.6 (done):** Dieline Maker tab: 7 parametric styles (reverse tuck end, straight tuck end, auto-lock bottom, seal end, sleeve, tray with lid, roll-end mailer), mm/inch, dimensions, panel labels, bleed and safe-area guides, SVG / PDF (CutContour + Crease spot colours, layers) / DXF (layers) export, sheet nesting with sheet PDF/DXF, Fold in 3D with correct closing angles (e.g. 180° roll-over walls).
- **v0.5 (done):** PDF and PDF-compatible .ai import, collapsible sidebar sections.
- **v0.4 (done):** dieline generator (reverse tuck end, straight tuck end) from inside size + board thickness; dieline SVG download; 3D model (.glb) export at real size for Blender; sheet size shown in mm.
- **Next:** auto-lock bottom, tray and sleeve styles; PDF/DXF dieline export; BOS "3D proof" integration; holes and windows in panels.

## Personalise

1. **Template:** upload the template PDF (export it from CorelDRAW as PDF). It stays in your browser only; it is never uploaded or committed.
2. **+ Add design:** drag a rectangle round one piece (the area that will be printed), then drag the logo zone inside it. Repeat for each design on the sheet. **Save template.**
3. **Job:** client name, campaign, quantity, file prefix.
4. **Logo:** drop the client file. The report shows vector or raster, effective dpi, colours and transparency, with warnings (for example low resolution).
5. **As per order:** keep logo colours or pick one CMYK colour; set the logo size in the zone; tick the finishes this order needs.
6. **Generate:** downloads `PREFIX_DATE_CAMPAIGN_CLIENT_TEMPLATE-DESIGN_ARTWORK_Vn.pdf`. Generating again for the same job makes the next version.

Each finish is a separate page with a 100% spot colour (Foil_Gold, Spot_UV, ...) in exactly the logo shape, all pages the same size so they register. The KLD page has the die lines in the CutContour spot colour.

## Artwork

Export the print artwork as PNG or JPG at the **same artboard size as the dieline SVG**: same width, height and position, so the art lines up with the panels. The app warns you if the image's shape doesn't match.
- **Exterior**: the outside print, laid out like the dieline.
- **Interior**: the inside print. By default it is treated as laid out "as seen from inside" (a mirror of the dieline); untick the box if yours isn't mirrored.
- You can also drop a PNG/JPG anywhere on the page to set the exterior.

## Dieline Maker

Open the **Dieline Maker** tab, click the style card to open the **gallery** (filter by category or search), then enter the size. Sizes can be entered as **inside** (room for the product), **die-cut** (crease to crease = inside + board) or **outside** (inside + 2 × board), in mm, cm, inch or 1/64 inch; board caliper in mm or pt (1 pt = 0.001 in). The dieline updates live, with cut and crease line lengths for die-maker quotes.

| Style | Notes |
|---|---|
| Reverse / straight tuck end | Lid + tuck flap, dust flaps |
| Auto-lock (crash-lock) bottom | Tuck top; bottom lock flaps with 45° glue-assist creases (flat when closed) |
| Seal end | Major/minor flaps glued at both ends; set the major-flap overlap |
| Sleeve | 4 panels + glue flap, open ends |
| Tray with lid | Two pieces on one sheet; lid = tray + 2 × board + clearance |
| Mailer (roll end, front tuck) | Double front and side walls (roll over 180°), ears, lid with front tuck and dust flaps |

- **Show:** dimensions, panel labels, bleed (default 3 mm) and safe area (default 3 mm).
- **Export:** SVG; PDF at true size with spot colours **CutContour** and **Crease** and one layer per kind (Cut, Crease, Bleed, Safe area, Dimensions, Labels); DXF (R12, mm) with layers CUT, CREASE, BLEED, SAFE, DIMENSIONS, LABELS.
- **Sheet layout:** choose a sheet (18×23 … 28×40 in, SRA3, A2, B1 or custom), gutter and gripper margin; see how many fit (upright and rotated) and the share of the sheet used; export the sheet as PDF or DXF.
- **Fold in 3D:** opens the box in the 3D tab with the right closing angles. The SVG/PDF page is also the artwork template: artwork exported at that page size lines up in 3D.

Allowances: panel = inside size + board; lid depth = W + board; tray lid = tray + 2 × board + clearance. These are common starting values for proofs. Check the first physical sample with your die-maker before cutting a die.

## Export

- **Image:** saves the current view as PNG. "Fit box to frame" keeps your viewing angle and zooms so the box fills the picture. Tick "Transparent background" for a cut-out PNG.
- **Video:** renders the selected camera move to MP4 (H.264). Every frame is rendered offline, so the video is perfectly smooth even on a slow PC; it just takes longer. Needs a current Chrome or Edge (WebCodecs).
- **3D model (.glb):** the box as currently folded, at real size (metres), with artwork. In Blender: File → Import → glTF 2.0. Size comes from the SVG's width unit (mm, cm, in, pt, px); the sheet size shown under the file name tells you if it was read correctly.
- **My dielines:** saves the dieline, its colour settings and artwork in this browser (IndexedDB). It stays on this computer and this browser only.

## Known limits

- Holes and windows inside a panel are not cut out yet.
- Smaller flaps are layered a fraction of a millimetre inside larger panels to avoid overlap, so a tiny step can show at some creases up close.
- The lid used for "Lid open" and camera moves is found automatically (the highest horizontal hinge whose panel has its own tuck flap).
