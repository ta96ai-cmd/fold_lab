import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { PDFDocument } from 'pdf-lib';
import { layerAffine, layerCorners, pdfAffine, fitLayer, apply, history, snapshot, restore, layerDpi, rasterMm, mirrorX, MM2PT } from '../src/artwork/art-core.js';
import { buildArtPdf } from '../src/artwork/art-pdf.js';
import { generate } from '../src/generator/styles.js';
import { prepare, toPDF } from '../src/generator/writers.js';

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const L0 = { id: 'a', w: 100, h: 50, x: 200, y: 100, s: 1, rot: 0, fx: false, fy: false, op: 1, visible: true };

test('layer placement: centre, size, rotation and mirror', () => {
  const c = layerCorners(L0);
  assert.deepEqual(c.map(p => p.map(v => +v.toFixed(6))), [[150, 75], [250, 75], [250, 125], [150, 125]]);
  const r = layerCorners({ ...L0, rot: 90 });                    // 90° clockwise: top-left goes to top-right
  assert.ok(near(r[0][0], 225) && near(r[0][1], 50));
  const f = layerCorners({ ...L0, fx: true });                   // mirrored: image left edge on the right
  assert.ok(near(f[0][0], 250) && near(f[0][1], 75));
  const m = layerAffine({ ...L0, s: 2 });
  const [x, y] = apply(m, [1, 1]); assert.ok(near(x, 300) && near(y, 150));
});

test('fit to a box: cover, contain, width; rotation swaps sides', () => {
  const box = { x: 0, y: 0, w: 300, h: 300 };
  assert.ok(near(fitLayer(L0, box, 'cover').s, 6));
  assert.ok(near(fitLayer(L0, box, 'contain').s, 3));
  assert.ok(near(fitLayer(L0, box, 'width').s, 3));
  const r = fitLayer({ ...L0, rot: 90 }, { x: 0, y: 0, w: 50, h: 100 }, 'contain');
  assert.ok(near(r.s, 1) && near(r.x, 25) && near(r.y, 50));
});

test('PDF placement matches the page placement (y flipped, points)', () => {
  const page = { x: -10, y: -20, w: 500, h: 400 };
  const m = pdfAffine(L0, page);
  // PDF image top-left is (0,1); it must land on the layer's top-left corner in mm, converted to points
  const [X, Y] = apply(m, [0, 1]);
  assert.ok(near(X, (150 - page.x) * MM2PT, 1e-6) && near(Y, (page.y + page.h - 75) * MM2PT, 1e-6));
});

test('undo / redo of placements', () => {
  const A = { ...L0 }, byId = new Map([[A.id, A]]), h = history();
  let sides = { out: [A], in: [] };
  h.push(snapshot(sides)); A.x = 999;
  const back = h.undo(snapshot(sides)); sides = restore(back, byId);
  assert.equal(sides.out[0].x, 200);
  const fwd = h.redo(snapshot(sides)); sides = restore(fwd, byId);
  assert.equal(sides.out[0].x, 999);
  assert.equal(h.canRedo, false);
});

test('resolution and helpers', () => {
  const mm = rasterMm(3000, 1500); assert.ok(near(mm.w, 254) && near(mm.h, 127));
  assert.ok(near(layerDpi({ w: 254, s: 1 }, 3000), 300));
  assert.equal(mirrorX(10, { x: 0, w: 100 }), 90);
});

function pngBytes(w, h, rgba = [200, 30, 60, 255]) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) p.data.set(rgba, i * 4);
  return new Uint8Array(PNG.sync.write(p));
}

test('print PDF: outside art + die line, inside page mirrored, die line page', async () => {
  const g = generate('rte', {}), o = { dims: false, labels: false };
  const P = prepare(g, o), page = P.page;
  const die = toPDF(g, o);
  const box = { x: g.dieline.bbox.minx, y: g.dieline.bbox.miny, w: g.dieline.bbox.w, h: g.dieline.bbox.h };
  const bg = fitLayer({ id: 'bg', w: 40, h: 40, s: 1, rot: 0, fx: false, fy: false, op: 1, visible: true }, box, 'cover');
  const inside = { ...bg, id: 'in1', op: 0.5 };
  const asset = async () => ({ kind: 'png', bytes: pngBytes(8, 8) });
  const one = await buildArtPdf({ page, bleed: P.bleed, dielinePdf: die, sides: { out: [bg], in: [] }, asset });
  const two = await buildArtPdf({ page, bleed: P.bleed, dielinePdf: die, sides: { out: [bg], in: [inside] }, asset });
  const d1 = await PDFDocument.load(one), d2 = await PDFDocument.load(two);
  assert.equal(d1.getPageCount(), 2);                    // outside + die line
  assert.equal(d2.getPageCount(), 3);                    // outside + inside + die line
  const { width, height } = d2.getPage(0).getSize();
  assert.ok(near(width, page.w * MM2PT, 1e-3) && near(height, page.h * MM2PT, 1e-3));
});
