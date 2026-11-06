import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, toInside, fromInside, STYLES } from '../src/generator/styles.js';
import { dielineStats } from '../src/generator/core.js';
import { formatLength } from '../src/generator/writers.js';

test('size modes: inside, die-cut and outside convert both ways', () => {
  const p = { L: 60, W: 40, H: 120, t: 0.5, glue: 15 };
  assert.deepEqual(toInside({ ...p, L: 61, W: 41, H: 121 }, 'outside'), { ...p, L: 60, W: 40, H: 120 });
  assert.deepEqual(toInside({ ...p, L: 60.5, W: 40.5, H: 120.5 }, 'diecut'), p);
  assert.deepEqual(fromInside(p, 'inside'), p);
  assert.equal(fromInside(p, 'outside').L, 61);
  assert.equal(toInside(p, 'outside').glue, 15, 'only L, W, H change');
  // die-cut size equals the panel the dieline is drawn with
  const g = generate('rte', toInside({ ...p, L: 80, W: 50, H: 150 }, 'diecut'));
  const front = g.dieline.pieces.find(pc => pc.label === 'Front').pts, xs = front.map(q => q[0]), ys = front.map(q => q[1]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 80) < 1e-9 && Math.abs(Math.max(...ys) - Math.min(...ys) - 150) < 1e-9);
});

test('statistics: cut and crease length, areas, utilisation', () => {
  const s = dielineStats(generate('sleeve', { L: 60, W: 40, H: 100, t: 0, glue: 15 }).dieline);
  assert.ok(Math.abs(s.creaseLength - 4 * 100) < 1e-6);            // 4 vertical creases of panel height
  assert.ok(Math.abs(s.usedArea - (200 * 100 + (100 + (100 - 2 * Math.min(10.5, 25))) / 2 * 15)) < 1e-6);
  assert.ok(s.cutLength > 2 * 200 && s.utilisation > 0.9 && s.utilisation <= 1);
});

test('length labels in every unit', () => {
  assert.equal(formatLength(60.4, 'mm'), '60.4');
  assert.equal(formatLength(60.4, 'cm'), '6.04');
  assert.equal(formatLength(50.8, 'in'), '2"');
  assert.equal(formatLength(107.95, 'in64'), '4 1/4"');
  assert.equal(formatLength(25.4 * (2 + 13 / 64), 'in64'), '2 13/64"');
  assert.equal(formatLength(25.4 * 0.5, 'in64'), '1/2"');
});

test('every style has a code, group and tags for the gallery', () => {
  for (const [k, s] of Object.entries(STYLES)) assert.ok(s.code && s.group && s.tags, k);
});
