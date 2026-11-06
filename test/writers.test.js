import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildModel, defaultRole } from '../src/engine/fold-engine.js';
import { STYLES, generate } from '../src/generator/styles.js';
import { toEngineSegments } from '../src/generator/core.js';
import { toPDF, toDXF, toSVG } from '../src/generator/writers.js';
import { strokesFromOperatorList } from '../src/svg/parse-pdf.js';

async function pdfModel(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  const cfg = await doc.getOptionalContentConfig();
  const page = await doc.getPage(1), vp = page.getViewport({ scale: 1 });
  const strokes = strokesFromOperatorList(pdfjs.OPS, await page.getOperatorList(), vp.transform,
    id => /bleed|safe|dimension|label/i.test(cfg.getGroup(id)?.name || ''));
  const segs = strokes.flatMap(s => s.polys.flatMap(p => p.slice(1).map((q, i) => ({ a: { x: p[i][0], y: -p[i][1] }, b: { x: q[0], y: -q[1] }, type: defaultRole(...s.rgb, s.dashed) }))));
  return { m: buildModel(segs), colours: new Set(strokes.map(s => s.rgb.join(','))), vp };
}

for (const style of Object.keys(STYLES)) {
  test(`${style}: PDF export reads back with the same panels and hinges (guides skipped)`, async () => {
    const g = generate(style, {});
    const direct = buildModel(toEngineSegments(g.dieline));
    const { m, colours, vp } = await pdfModel(toPDF(g, { dims: true, labels: true, bleed: true, safe: true }));
    assert.equal(m.stats.panels, direct.stats.panels);
    assert.equal(m.stats.hinges, direct.stats.hinges);
    assert.equal(colours.size, 2, 'only the two spot colours are read');
    // true size: page = dieline + bleed + dimension margin, in points
    assert.ok(vp.width * 25.4 / 72 > g.dieline.bbox.w && vp.width * 25.4 / 72 < g.dieline.bbox.w + 40);
  });

  test(`${style}: DXF has CUT and CREASE layers with every line`, () => {
    const g = generate(style, {});
    const dxf = toDXF(g, {});
    const lines = dxf.split('\n');
    const creaseLines = lines.filter((l, i) => l === 'LINE' && lines[i + 2] === 'CREASE').length;
    assert.equal(creaseLines, g.dieline.creases.length);
    assert.ok(lines.filter((l, i) => l === 'POLYLINE' && lines[i + 2] === 'CUT').length >= 1);
    assert.match(dxf, /\nEOF\n$/);
  });
}

test('SVG carries fold angles, lid role, root and floor hints', () => {
  const svg = toSVG(generate('mailer', {}), {});
  assert.match(svg, /data-fold="180"/); assert.match(svg, /data-hinge="lid"/);
  assert.match(svg, /data-rea-root="[\d.]+ [\d.]+"/); assert.match(svg, /data-rea-floor="1"/);
  assert.match(svg, /<g id="bleed" data-rea-ignore="1"/);
});

test('inch dimensions', () => {
  const svg = toSVG(generate('rte', { L: 50.8, W: 38.1, H: 107.95, t: 0 }), { units: 'in' });
  assert.match(svg, />2"</); assert.match(svg, />1\.5"</); assert.match(svg, />4\.25"</);
});

test('labels sit inside their pieces', () => {
  for (const style of Object.keys(STYLES)) {
    const g = generate(style, {}), b = g.dieline.bbox;
    for (const l of g.labels) assert.ok(l.at[0] >= b.minx && l.at[0] <= b.maxx && l.at[1] >= b.miny && l.at[1] <= b.maxy, `${style} ${l.text}`);
  }
});

import { nest, sheetLayout, SHEETS } from '../src/generator/nesting.js';

test('nesting: counts, no overlaps, inside the sheet', () => {
  const g = generate('rte', {});
  const { w, h } = g.dieline.bbox;
  for (const key of ['20x30', '28x40', 'SRA3']) {
    const sheet = SHEETS[key], L = nest(w, h, sheet, { gutter: 5, margin: 10 });
    assert.ok(L.count >= 1, key);
    const boxes = L.placements.map(p => ({ x: p.x, y: p.y, w: p.rot ? h : w, h: p.rot ? w : h }));
    for (const b of boxes) assert.ok(b.x >= 10 - 1e-9 && b.y >= 10 - 1e-9 && b.x + b.w <= sheet.w - 10 + 1e-9 && b.y + b.h <= sheet.h - 10 + 1e-9, key);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a.x + a.w + 5 - 1e-6 <= b.x || b.x + b.w + 5 - 1e-6 <= a.x || a.y + a.h + 5 - 1e-6 <= b.y || b.y + b.h + 5 - 1e-6 <= a.y, `${key} overlap ${i} ${j}`);
    }
  }
  // 20 x 30 in sheet, 217 x 231 mm dieline: 2 x 3 = 6 upright or rotated 3 x 2
  assert.equal(nest(w, h, SHEETS['20x30'], { gutter: 5, margin: 10 }).count, 6);
});

test('sheet layout exports every copy and keeps them inside the sheet', async () => {
  const g = generate('rte', {}), sheet = SHEETS['20x30'];
  const L = nest(g.dieline.bbox.w, g.dieline.bbox.h, sheet, { gutter: 5, margin: 10 });
  const sg = sheetLayout(g, sheet, L);
  assert.equal(sg.dieline.creases.length, g.dieline.creases.length * L.count);
  for (const e of [...sg.dieline.cuts, ...sg.dieline.creases]) for (const q of [e.a, e.b]) assert.ok(q[0] >= 0 && q[1] >= 0 && q[0] <= sheet.w && q[1] <= sheet.h);
  const pdf = toPDF(sg, { dims: false, labels: false, bleed: false, safe: false, page: { x: 0, y: 0, w: sheet.w, h: sheet.h }, frames: [{ pts: [[0, 0], [sheet.w, 0], [sheet.w, sheet.h], [0, sheet.h]] }] });
  const doc = await pdfjs.getDocument({ data: pdf, verbosity: 0 }).promise;
  const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
  assert.ok(Math.abs(vp.width * 25.4 / 72 - 508) < 0.1 && Math.abs(vp.height * 25.4 / 72 - 762) < 0.1);
});
