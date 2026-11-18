import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, toInside } from '../src/generator/styles.js';
import { transformGen, step, IDENTITY, describe } from '../src/generator/transform.js';
import { prepare, toSVG, dimValue } from '../src/generator/writers.js';
import { MATERIALS, ALL_MATERIALS, materialFor } from '../src/generator/materials.js';
import { buildModel } from '../src/engine/fold-engine.js';
import { toEngineSegments } from '../src/generator/core.js';

const near = (a, b) => Math.abs(a - b) < 1e-6;

test('turn and mirror: size swaps on a turn, same panels, back to start after 4 turns', () => {
  const g = generate('rte', { L: 60, W: 40, H: 120, t: 0.4 });
  const r = transformGen(g, step(IDENTITY, 'right'));
  assert.ok(near(r.dieline.bbox.w, g.dieline.bbox.h) && near(r.dieline.bbox.h, g.dieline.bbox.w));
  assert.equal(r.dieline.cuts.length, g.dieline.cuts.length);
  let m = IDENTITY; for (let i = 0; i < 4; i++) m = step(m, 'right');
  assert.deepEqual(m, IDENTITY);
  assert.deepEqual(step(step(IDENTITY, 'mirrorX'), 'mirrorX'), IDENTITY);
  assert.equal(describe(step(IDENTITY, 'right')), 'turned right');
  assert.equal(describe(step(IDENTITY, 'mirrorX')), 'mirrored');
  const mm = buildModel(toEngineSegments(r.dieline));                  // still one foldable part
  assert.equal(mm.roots.length, 1); assert.equal(mm.stats.loosePanels, 0);
  for (const d of r.dims) assert.ok(['top', 'right', 'bottom', 'left'].includes(d.side));
  for (const pc of r.dieline.pieces) for (const [x, y] of pc.pts) assert.ok(x > -1e-9 && y > -1e-9);
});

test('dimension codes and size modes', () => {
  const p = { L: 300, W: 200, H: 50, t: 3 };
  assert.deepEqual(dimValue(303, p, 'diecut'), { code: 'L', value: 303 });
  assert.deepEqual(dimValue(203, p, 'inside'), { code: 'W', value: 200 });
  assert.deepEqual(dimValue(53, p, 'outside'), { code: 'H', value: 56 });
  assert.deepEqual(dimValue(47, p), { code: '', value: 47 });
  const g = generate('rsc', p);
  const both = prepare(g, { sign: 'both' }).dimLines.map(l => l.text);
  assert.ok(both.some(t => t.startsWith('L ')) && both.some(t => t.startsWith('W ')) && both.some(t => t.startsWith('H ')), both.join('|'));
  assert.ok(prepare(g, { sign: 'none' }).dimLines.every(l => l.text === ''));
  const svg = toSVG(g, { fontScale: 2, colors: { cut: '#0000ff', crease: '#ff0000' } });
  assert.ok(svg.includes('stroke="#0000ff"') && svg.includes('stroke="#ff0000"') && svg.includes('font-size="5.2"'));
});

test('materials: every board has a thickness and can be found again', () => {
  assert.ok(MATERIALS.length >= 3 && ALL_MATERIALS.length >= 12);
  for (const m of ALL_MATERIALS) { assert.ok(m.t > 0 && m.label && m.id); assert.equal(materialFor(m.t)?.t, m.t); }
  assert.equal(materialFor(0.123), null);
});
