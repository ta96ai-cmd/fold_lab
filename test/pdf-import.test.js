import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { strokesFromOperatorList, strokesToSVG } from '../src/svg/parse-pdf.js';
import { buildModel, defaultRole } from '../src/engine/fold-engine.js';

async function strokesOf(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(new URL(`./fixtures/${file}`, import.meta.url))), disableFontFace: true, verbosity: 0 }).promise;
  const page = await doc.getPage(1), vp = page.getViewport({ scale: 1 });
  return { strokes: strokesFromOperatorList(pdfjs.OPS, await page.getOperatorList(), vp.transform), vp };
}
const toSegs = (strokes, roleOf) => strokes.flatMap(s => {
  const role = roleOf(s); if (role === 'ignore') return [];
  return s.polys.flatMap(p => p.slice(1).map((q, i) => ({ a: { x: p[i][0], y: -p[i][1] }, b: { x: q[0], y: -q[1] }, type: role })));
});

test('PDF with CMYK spot colours (CutContour / Crease), dashes, transforms and artwork', async () => {
  const { strokes } = await strokesOf('spot_cmyk.pdf');
  const roles = strokes.map(s => defaultRole(...s.rgb, s.dashed));
  assert.ok(roles.includes('cut') && roles.includes('crease'));
  assert.ok(strokes.some(s => s.dashed), 'dashed creases detected');
  // the black decoration square is a separate colour the user can set to Ignore
  const segs = toSegs(strokes, s => (Math.max(...s.rgb) < 30 ? 'ignore' : defaultRole(...s.rgb, s.dashed)));
  const m = buildModel(segs);
  assert.equal(m.stats.panels, 13); assert.equal(m.stats.hinges, 12);
  // drawn in mm inside a 1 mm = 2.8346 pt transform: front panel is 60 x 120 mm
  const mm = 25.4 / 72, root = m.faces[m.root];
  const xs = root.poly.map(p => p.x), ys = root.poly.map(p => p.y);
  assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) * mm - 60) < 0.05);
  assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) * mm - 120) < 0.05);
});

test('PDF printed from a browser (RGB, curves)', async () => {
  const { strokes, vp } = await strokesOf('chrome_rgb.pdf');
  const m = buildModel(toSegs(strokes, s => defaultRole(...s.rgb, s.dashed)));
  assert.equal(m.stats.panels, 13); assert.equal(m.stats.hinges, 12);
  const svg = strokesToSVG(strokes, vp.width, vp.height, 'test');
  assert.match(svg, /width="[\d.]+mm"/); assert.match(svg, /#FF00FF/); assert.match(svg, /#00FFFF/);
});
