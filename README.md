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
src/svg/parse-svg.js       SVG -> line segments (browser)
src/viewer/viewer.js       Three.js scene, hinge pivots, camera
src/ui/flat-preview.js     2D dieline map
test/fold-engine.test.js   node:test suite
docs/REA-report.md         the reverse-engineering breakdown
```

## Roadmap

- **Phase 1 (done):** SVG import, cut/crease mapping, panel and hinge detection, fold sliders, fold animation.
- **Phase 2:** exterior and interior artwork, fold presets (closed, lid open, half, tuck in), board thickness, 3 camera moves.
- **Phase 3:** 60fps MP4 and 4K PNG export, all 9 camera moves, saved dieline library, BOS "3D proof" integration.

## Known limits (Phase 1)

- Holes and windows inside a panel are not cut out yet.
- Panels have no thickness, so overlapping flaps can flicker slightly.
