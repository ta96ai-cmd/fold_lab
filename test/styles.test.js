import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../src/engine/fold-engine.js';
import { presetAngles, findLid } from '../src/engine/presets.js';
import { STYLES, generate } from '../src/generator/styles.js';
import { toEngineSegments } from '../src/generator/core.js';

// Pure-math fold of every part; returns points per root.
function fold(m, angles) {
  const rot = (v, k, t) => {
    const c = Math.cos(t), s = Math.sin(t), d = k.x * v.x + k.y * v.y;
    const cr = { x: k.y * v.z, y: -k.x * v.z, z: k.x * v.y - k.y * v.x };
    return { x: v.x * c + cr.x * s + k.x * d * (1 - c), y: v.y * c + cr.y * s + k.y * d * (1 - c), z: v.z * c + cr.z * s };
  };
  const chain = new Map(), rootOf = new Map();
  for (const r of m.roots) { chain.set(r, []); rootOf.set(r, r); }
  for (const h of m.hinges) { chain.set(h.child, [...chain.get(h.parent), h]); rootOf.set(h.child, rootOf.get(h.parent)); }
  const parts = new Map(m.roots.map(r => [r, []]));
  for (const [fid, hs] of chain) for (const p of m.faces[fid].poly) {
    let v = { x: p.x, y: p.y, z: 0 };
    for (let i = hs.length - 1; i >= 0; i--) {
      const h = hs[i];
      const r = rot({ x: v.x - h.a.x, y: v.y - h.a.y, z: v.z }, h.dir, angles[h.id] * Math.PI / 180 * h.sign);
      v = { x: r.x + h.a.x, y: r.y + h.a.y, z: r.z };
    }
    parts.get(rootOf.get(fid)).push(v);
  }
  return [...parts.values()];
}
const size = pts => ['x', 'y', 'z'].map(k => Math.max(...pts.map(p => p[k])) - Math.min(...pts.map(p => p[k])));
const sorted = a => [...a].sort((x, y) => x - y);
const near = (a, b, tol, msg) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= tol), `${msg}: got ${a.map(v => v.toFixed(2))}, want ${b.map(v => v.toFixed(2))}`);

function model(style, params) {
  const g = generate(style, params);
  const root = g.hints.root;
  return { g, m: buildModel(toEngineSegments(g.dieline), { rootPoint: { x: root[0], y: -root[1] } }) };
}

const P = { L: 70, W: 45, H: 130, t: 0.5 };
for (const style of ['rte', 'ste', 'autolock', 'sealend']) {
  test(`${style}: one part, folds closed to inside size + board`, () => {
    const { m } = model(style, P);
    assert.equal(m.roots.length, 1); assert.equal(m.stats.loosePanels, 0);
    const [pts] = fold(m, presetAngles(m, 'closed'));
    near(sorted(size(pts)), sorted([P.L + P.t, P.H + P.t, P.W + P.t]), 0.01, style);
  });
}

test('auto-lock: glue-assist diagonals stay flat when closed', () => {
  const { m } = model('autolock', P);
  const diag = m.hinges.filter(h => Math.abs(h.dir.x) > 0.3 && Math.abs(h.dir.y) > 0.3);
  assert.equal(diag.length, 2);
  assert.ok(diag.every(h => h.closed === 0));
});

test('tuck styles: lid found by role, root is the front panel', () => {
  for (const style of ['rte', 'ste', 'autolock']) {
    const { m, g } = model(style, P);
    const l = findLid(m); assert.ok(l, style); assert.equal(l.tucks.length, 1, style);
    const r = m.faces[m.root].centroid, hint = g.hints.root;
    assert.ok(Math.abs(r.x - hint[0]) < 1 && Math.abs(-r.y - hint[1]) < 1, `${style} root`);
  }
});

test('sleeve: open tube', () => {
  const { m } = model('sleeve', P);
  const [pts] = fold(m, presetAngles(m, 'closed'));
  near(sorted(size(pts)), sorted([P.L + P.t, P.H + P.t, P.W + P.t]), 0.01, 'sleeve');
  assert.equal(findLid(m), null);
});

test('tray with lid: two parts, lid fits over the tray', () => {
  const p = { L: 120, W: 80, H: 40, lidH: 25, t: 0.5, clear: 1 };
  const { m } = model('tray', p);
  assert.equal(m.roots.length, 2);
  const [tray, lid] = fold(m, presetAngles(m, 'closed')).map(size).map(sorted);
  near(tray, sorted([p.L + p.t, p.W + p.t, p.H + p.t]), 0.01, 'tray');
  near(lid, sorted([p.L + p.t + 2 * p.t + p.clear, p.W + p.t + 2 * p.t + p.clear, p.lidH + p.t]), 0.01, 'lid');
});

test('mailer: double walls roll inside, lid closes to the box size', () => {
  const p = { L: 200, W: 150, H: 60, t: 1.5, tuck: 40 };
  const { m } = model('mailer', p);
  assert.equal(m.roots.length, 1); assert.equal(m.stats.loosePanels, 0);
  assert.equal(m.hinges.filter(h => h.closed === 180).length, 3);
  const [pts] = fold(m, presetAngles(m, 'closed'));
  const s = sorted(size(pts));
  near(s, sorted([p.L + p.t, p.W + p.t + 2 * p.t, p.H + p.t]), 2 * p.t + 0.01, 'mailer');
  assert.ok(findLid(m));
});

test('every style rejects out-of-range sizes', () => {
  for (const style of Object.keys(STYLES)) assert.throws(() => generate(style, { L: 1 }), /must be/);
});

test('rsc (0201): one part, all flaps = half width, folds to box size, lid found', () => {
  const p = { L: 305, W: 229, H: 152, t: 3, joint: 35 };
  const { m, g } = model('rsc', p);
  assert.equal(m.roots.length, 1);
  assert.equal(m.stats.loosePanels, 0);
  // 13 pieces (joint + 4 walls + 8 flaps), 12 hinges (a tree)
  assert.equal(g.dieline.pieces.length, 13);
  assert.equal(m.hinges.length, 12);
  const [pts] = fold(m, presetAngles(m, 'closed'));
  near(sorted(size(pts)), sorted([p.L + p.t, p.W + p.t, p.H + p.t]), 0.01, 'rsc');
  assert.ok(findLid(m), 'rsc lid');
});

test('slotted family (0202/0203/0204/0200): one closed part at box size', () => {
  const p = { L: 305, W: 229, H: 152, t: 3, joint: 35 };
  for (const s of ['osc', 'fol', 'cssc', 'hsc']) {
    const { m } = model(s, p);
    assert.equal(m.roots.length, 1, `${s} parts`);
    assert.equal(m.stats.loosePanels, 0, `${s} loose`);
    const [pts] = fold(m, presetAngles(m, 'closed'));
    near(sorted(size(pts)), sorted([p.L + p.t, p.W + p.t, p.H + p.t]), 0.01, s);
  }
});

test('postal 0471-style: mailer without lid side flaps, folds closed', () => {
  const p = { L: 200, W: 150, H: 60, t: 1.5, tuck: 40 };
  const a = model('mailer', p), b = model('postal', p);
  assert.equal(b.g.dieline.pieces.length, a.g.dieline.pieces.length - 2);
  assert.equal(b.m.roots.length, 1); assert.equal(b.m.stats.loosePanels, 0);
  const [pts] = fold(b.m, presetAngles(b.m, 'closed'));
  near(sorted(size(pts)), sorted([p.L + p.t, p.W + p.t + 2 * p.t, p.H + p.t]), 2 * p.t + 0.01, 'postal');
  assert.ok(findLid(b.m));
});
