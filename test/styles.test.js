import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../src/engine/fold-engine.js';
import { presetAngles, findLid } from '../src/engine/presets.js';
import { STYLES, generate, toInside } from '../src/generator/styles.js';
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

test('osc (0202): outer flaps overlap by the set amount, not full width', () => {
  const p = { L: 305, W: 229, H: 152, t: 3, joint: 35, overlap: 40 };
  const { g } = model('osc', p);
  const outer = g.dieline.pieces.filter(pc => pc.label === 'Outer flap');
  const depth = pc => Math.max(...pc.pts.map(q => q[1])) - Math.min(...pc.pts.map(q => q[1]));
  outer.forEach(pc => assert.ok(Math.abs(depth(pc) - (p.W + p.t + 40) / 2) < 0.01));
});

test('fliptop: finger notch, lock tabs and base slots; slots are not panels', () => {
  const p = { L: 300, W: 200, H: 50, t: 3, tuck: 40, notch: 12, locks: 2 };
  const { m, g } = model('fliptop', p);
  assert.equal(m.roots.length, 1); assert.equal(m.stats.loosePanels, 0);
  assert.equal(m.stats.holes, 4);                                   // 2 slots per side
  assert.equal(g.dieline.cuts.filter(e => e.hole).length, 16);      // 4 rectangles x 4 edges
  const plain = model('fliptop', { ...p, notch: 0, locks: 0 });
  assert.equal(plain.m.stats.holes, 0);
  assert.equal(g.dieline.pieces.length, plain.g.dieline.pieces.length);
  const [pts] = fold(m, presetAngles(m, 'closed'));
  const sz = size(pts);
  assert.ok(Math.max(...sz) < p.L + 20 && Math.min(...sz) < p.H + 20, 'closed box near its size');
  assert.ok(findLid(m));
});



test('counts (lock tabs) are marked as counts and their error has no unit', () => {
  assert.equal(STYLES.fliptop.params.locks.count, true);
  assert.throws(() => generate('fliptop', { locks: 5 }), /Lock tabs per side must be 0–3(?! mm)/);
});
test('fliptop options: tuck wings, single front wall, double-crease rim; folds closed at box height', () => {
  const p = { L: 300, W: 200, H: 50, t: 3 };
  const { m, g } = model('fliptop', p);
  const n = l => g.dieline.pieces.filter(pc => pc.label === l).length;
  assert.equal(n('Tuck wing'), 2); assert.equal(n('Rim'), 2); assert.equal(n('Front inner'), 0);
  assert.equal(m.roots.length, 1); assert.equal(m.stats.loosePanels, 0); assert.equal(m.stats.holes, 4);
  const [pts] = fold(m, presetAngles(m, 'closed'));
  const z = sorted(size(pts));
  assert.ok(z[0] < p.H + p.t + 12, `closed height ${z[0].toFixed(1)} (inner walls fold down, not up)`);
  const plain = model('fliptop', { ...p, tuckStyle: 1, dblCrease: 0, frontDouble: 1 });
  const m2 = l => plain.g.dieline.pieces.filter(pc => pc.label === l).length;
  assert.equal(m2('Tuck wing'), 0); assert.equal(m2('Rim'), 0); assert.equal(m2('Front inner'), 1);
  assert.equal(plain.m.stats.loosePanels, 0);
});

test('fliptop chamfer: rounds ear and inner-wall corners, still one closed part', () => {
  const p = { L: 300, W: 200, H: 50, t: 3 };
  const sq = model('fliptop', p), rd = model('fliptop', { ...p, chamfer: 1 });
  const pts = (g, l) => g.dieline.pieces.filter(pc => pc.label === l).reduce((n, pc) => n + pc.pts.length, 0);
  assert.ok(pts(rd.g, 'Ear') > pts(sq.g, 'Ear'));
  assert.ok(pts(rd.g, 'Side inner') > pts(sq.g, 'Side inner'));
  assert.equal(rd.m.roots.length, 1); assert.equal(rd.m.stats.loosePanels, 0); assert.equal(rd.m.stats.holes, 4);
});

test('fliptop die-cut size: L = base crease to crease; tabs at quarter points', () => {
  const g = generate('fliptop', toInside({ L: 300, W: 200, H: 50, t: 3 }, 'diecut'));
  const base = g.dieline.pieces.find(pc => pc.label === 'Base');
  const xs = base.pts.map(q => q[0]), ys = base.pts.map(q => q[1]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 300) < 1e-6);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 200) < 1e-6);
  const slots = g.dieline.cuts.filter(e => e.hole), y0 = Math.min(...ys);
  const centres = [...new Set(slots.map(e => Math.round(((e.a[1] + e.b[1]) / 2 - y0) * 10) / 10))];
  assert.ok(centres.some(c => Math.abs(c - 50) < 1) && centres.some(c => Math.abs(c - 150) < 1), centres.join(','));
});
