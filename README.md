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

1. **Parse SVG** (`src/svg/parse-svg.js`): reads every stroked path, line, rect, polygon and curve, applies transforms, and groups lines by stroke colour (dashed lines count as their own group).
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
- **Next:** BOS "3D proof" integration, holes and windows in panels, more box styles tested with real dielines.

## Artwork

Export the print artwork as PNG or JPG at the **same artboard size as the dieline SVG**: same width, height and position, so the art lines up with the panels. The app warns you if the image's shape doesn't match.
- **Exterior**: the outside print, laid out like the dieline.
- **Interior**: the inside print. By default it is treated as laid out "as seen from inside" (a mirror of the dieline); untick the box if yours isn't mirrored.
- You can also drop a PNG/JPG anywhere on the page to set the exterior.

## Export

- **Image:** saves the current view as PNG. "Fit box to frame" keeps your viewing angle and zooms so the box fills the picture. Tick "Transparent background" for a cut-out PNG.
- **Video:** renders the selected camera move to MP4 (H.264). Every frame is rendered offline, so the video is perfectly smooth even on a slow PC; it just takes longer. Needs a current Chrome or Edge (WebCodecs).
- **My dielines:** saves the dieline, its colour settings and artwork in this browser (IndexedDB). It stays on this computer and this browser only.

## Known limits

- Holes and windows inside a panel are not cut out yet.
- Smaller flaps are layered a fraction of a millimetre inside larger panels to avoid overlap, so a tiny step can show at some creases up close.
- The lid used for "Lid open" and camera moves is found automatically (the highest horizontal hinge whose panel has its own tuck flap).
