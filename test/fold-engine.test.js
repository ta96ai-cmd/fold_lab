import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, defaultRole } from '../src/engine/fold-engine.js';
import { anglesAt } from '../src/engine/fold-animation.js';

// Straight-line reverse tuck end box (same layout as the sample, curves replaced by corners).
// SVG coordinates (y down) are flipped to y-up for the engine.
const P = (x, y) => ({ x, y: -y });
const outline = [[15,175],[3,168],[3,62],[15,55],[15,15],[17,4],[22,0],[68,0],[73,4],[75,15],[75,55],[78,34],[86,30],[112,30],[115,40],[115,55],[175,55],[178,34],[186,30],[212,30],[215,40],[215,175],[215,190],[212,200],[186,200],[178,196],[175,175],[175,215],[173,226],[168,230],[122,230],[117,226],[115,215],[115,175],[112,196],[104,200],[78,200],[75,190],[75,175]];
const creases = [[15,55,15,175],[75,55,75,175],[115,55,115,175],[175,55,175,175],[15,55,75,55],[15,15,75,15],[75,55,115,55],[175,55,215,55],[115,175,175,175],[115,215,175,215],[75,175,115,175],[175,175,215,175]];
const segs = [
  ...outline.map((p, i) => ({ a: P(...p), b: P(...outline[(i + 1) % outline.length]), type: 'cut' })),
  ...creases.map(([x1, y1, x2, y2]) => ({ a: P(x1, y1), b: P(x2, y2), type: 'crease' })),
];

// Pure-math fold: world position of every panel corner at a given angle.
function foldedPoints(m, deg) {
  const rot = (v, k, t) => { // Rodrigues rotation of v around unit axis k (z=0 axis)
    const c = Math.cos(t), s = Math.sin(t), d = k.x * v.x + k.y * v.y;
    const cr = { x: k.y * v.z, y: -k.x * v.z, z: k.x * v.y - k.y * v.x };
    return { x: v.x * c + cr.x * s + k.x * d * (1 - c), y: v.y * c + cr.y * s + k.y * d * (1 - c), z: v.z * c + cr.z * s };
  };
  const chain = new Map(); // face -> list of hinges from root
  chain.set(m.root, []);
  for (const h of m.hinges) chain.set(h.child, [...chain.get(h.parent), h]);
  const pts = [];
  for (const [fid, hs] of chain) for (const p of m.faces[fid].poly) {
    let v = { x: p.x, y: p.y, z: 0 };
    for (let i = hs.length - 1; i >= 0; i--) {
      const h = hs[i];
      const r = rot({ x: v.x - h.a.x, y: v.y - h.a.y, z: v.z }, h.dir, deg * Math.PI / 180 * h.sign);
      v = { x: r.x + h.a.x, y: r.y + h.a.y, z: r.z };
    }
    pts.push(v);
  }
  return pts;
}

test('finds every panel and hinge of a tuck end box', () => {
  const m = buildModel(segs);
  assert.equal(m.stats.panels, 13);
  assert.equal(m.stats.hinges, 12);
  assert.equal(m.stats.loosePanels, 0);
  assert.equal(m.faces[m.root].area, 7200); // a 60 x 120 main panel is the root
});

test('folds into a closed 60 x 120 x 40 box at 90°', () => {
  const m = buildModel(segs);
  const pts = foldedPoints(m, 90);
  const span = k => Math.max(...pts.map(p => p[k])) - Math.min(...pts.map(p => p[k]));
  assert.ok(Math.abs(span('x') - 60) < 0.01, `width ${span('x')}`);
  assert.ok(Math.abs(span('y') - 120) < 0.01, `height ${span('y')}`);
  assert.ok(Math.abs(span('z') - 40) < 0.01, `depth ${span('z')}`);
  assert.ok(pts.every(p => p.z <= 1e-9), 'everything folds behind the root panel');
});

test('tolerates crease lines that stop short of the outline', () => {
  const short = segs.map(s => s.type !== 'crease' ? s : { ...s, a: { x: s.a.x + (s.b.x - s.a.x) * 0.0005, y: s.a.y + (s.b.y - s.a.y) * 0.0005 } });
  assert.equal(buildModel(short).stats.hinges, 12);
});

test('no creases -> one panel, no hinges', () => {
  const m = buildModel(segs.filter(s => s.type === 'cut'));
  assert.equal(m.stats.panels, 1);
  assert.equal(m.stats.hinges, 0);
});

test('default colour roles', () => {
  assert.equal(defaultRole(255, 0, 255, false), 'cut');     // magenta
  assert.equal(defaultRole(0, 255, 255, false), 'crease');  // cyan
  assert.equal(defaultRole(0, 0, 0, false), 'cut');         // black
  assert.equal(defaultRole(255, 0, 0, true), 'crease');     // dashed red
});

test('animation reaches the target on every hinge', () => {
  const m = buildModel(segs);
  const end = anglesAt(m.hinges, m.hinges.map(() => 0), 90, 1, true);
  assert.ok(end.every(a => Math.abs(a - 90) < 1e-9));
  const mid = anglesAt(m.hinges, m.hinges.map(() => 0), 90, 0.2, true);
  const byDepth = d => m.hinges.filter(h => h.depth === d).map(h => mid[h.id]);
  assert.ok(Math.min(...byDepth(1)) > Math.max(...byDepth(4)), 'inner hinges lead');
});

import { findLid, presetAngles, lidSwing } from '../src/engine/presets.js';
import { CAMERA_MOVES } from '../src/viewer/camera-moves.js';

test('finds the top lid and its tuck flap', () => {
  const m = buildModel(segs);
  const l = findLid(m);
  assert.ok(l, 'lid found');
  assert.equal(m.faces[l.lid.child].area, 2400);          // 60 x 40 lid
  assert.equal(Math.max(l.lid.a.y, l.lid.b.y), -55);      // top crease, not the bottom one
  assert.equal(l.tucks.length, 1);
});

test('presets', () => {
  const m = buildModel(segs), l = findLid(m);
  assert.ok(presetAngles(m, 'flat').every(a => a === 0));
  assert.ok(presetAngles(m, 'closed').every(a => a === 90));
  const open = presetAngles(m, 'lidOpen');
  assert.equal(open[l.lid.id], -20);
  assert.equal(open.filter(a => a === 90).length, m.hinges.length - 2);
  assert.deepEqual(lidSwing(0), { lid: 90, tuck: 90 });
  assert.ok(lidSwing(0.5).lid < 0);
});

test('camera moves give finite positions outside the box', () => {
  for (const [name, mv] of Object.entries(CAMERA_MOVES)) for (const t of [0, 0.25, 0.5, 1]) {
    const p = mv.at(t, 100);
    assert.ok(p.every(Number.isFinite), name);
    assert.ok(Math.hypot(...p) > 150, `${name} too close at t=${t}`);
  }
});

import { frameTimes, VIDEO_SIZES, IMAGE_SIZES } from '../src/export/sizes.js';

test('all 9 camera moves keep the camera at a safe distance', () => {
  assert.equal(Object.keys(CAMERA_MOVES).length, 9);
  for (const [name, mv] of Object.entries(CAMERA_MOVES)) for (let i = 0; i <= 40; i++) {
    const p = mv.at(i / 40, 100);
    assert.ok(p.every(Number.isFinite), name);
    assert.ok(Math.hypot(...p) > 150, `${name} too close at t=${i / 40}`);
  }
});

test('looping moves end where they start', () => {
  for (const name of ['orbit', 'fullInspection', 'turntable', 'pendulum', 'drift']) {
    const a = CAMERA_MOVES[name].at(0, 100), b = CAMERA_MOVES[name].at(1, 100);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6, name);
  }
});

test('video frame timing', () => {
  const f = frameTimes(6.5, 60);
  assert.equal(f.length, 390);
  assert.equal(f[0].t, 0); assert.equal(f.at(-1).t, 1);
  assert.equal(f[60].us, 1000000);
  for (const s of [...Object.values(VIDEO_SIZES), ...Object.values(IMAGE_SIZES)]) assert.ok(s.w % 2 === 0 && s.h % 2 === 0, 'even sizes for H.264');
});

import { generateTuckBox, validateBox } from '../src/generator/tuck-box.js';

test('generated tuck boxes fold to the right size', () => {
  for (const style of ['rte', 'ste']) for (const t of [0, 0.5]) {
    const g = generateTuckBox({ style, L: 80, W: 50, H: 150, t });
    const m = buildModel(g.segments);
    assert.equal(m.stats.panels, 13, style); assert.equal(m.stats.hinges, 12, style); assert.equal(m.stats.loosePanels, 0);
    const pts = foldedPoints(m, 90);
    const span = k => Math.max(...pts.map(p => p[k])) - Math.min(...pts.map(p => p[k]));
    assert.ok(Math.abs(span('x') - (80 + t)) < 0.01, `${style} t=${t} width ${span('x')}`);
    assert.ok(Math.abs(span('y') - (150 + t)) < 0.01, `${style} t=${t} height ${span('y')}`);
    assert.ok(Math.abs(span('z') - (50 + t)) < 0.01, `${style} t=${t} depth ${span('z')}`);
  }
});

test('reverse vs straight tuck: bottom lid on front vs back', () => {
  const lidPanels = style => {
    const m = buildModel(generateTuckBox({ style }).segments);
    return m.hinges.filter(h => Math.abs(h.dir.x) > 0.9 && m.hinges.some(k => k.parent === h.child)).map(h => h.parent).sort();
  };
  const rte = lidPanels('rte'), ste = lidPanels('ste');
  assert.equal(rte.length, 2); assert.notEqual(rte[0], rte[1]);   // different panels
  assert.equal(ste.length, 2); assert.equal(ste[0], ste[1]);      // same panel
});

test('generator rejects bad sizes and writes a mm SVG', () => {
  assert.ok(validateBox({ style: 'rte', L: 5, W: 40, H: 100, t: 0.4, glue: 15, tuck: 15 }).length > 0);
  assert.throws(() => generateTuckBox({ tuck: 80, W: 40 }));
  const g = generateTuckBox({});
  assert.match(g.svg, /width="[\d.]+mm"/);
  assert.match(g.svg, /#FF00FF/); assert.match(g.svg, /#00FFFF/);
});
