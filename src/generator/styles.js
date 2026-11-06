// Parametric box styles (pure JS, mm). Every style returns a dieline built by core.buildDieline,
// plus labels, dimension lines and 3D hints (which panel faces the camera, which is the floor).
//
// Allowance rule used everywhere: panel = inside size + board thickness (t).
// These are standard starting values for proofs, not a die-maker's specification.

import { buildDieline, rect, flapOnBase, flapOnSide, tuckLocal, dustLocal, glueLocal } from './core.js';

const num = (label, def, min, max, step = 0.5, hint = '') => ({ label, def, min, max, step, hint });
const COMMON = {
  L: num('Length (L)', 60, 10, 1500, 0.5, 'inside, front width'),
  W: num('Width (W)', 40, 10, 1500, 0.5, 'inside, side width'),
  H: num('Height (H)', 120, 10, 1500, 0.5, 'inside'),
  t: num('Board', 0.4, 0, 5, 0.05, 'thickness mm'),
};

export const STYLES = {
  rte: { label: 'Reverse tuck end', group: 'Cartons', params: { ...COMMON, glue: num('Glue flap', 15, 5, 50), tuck: num('Tuck flap', 15, 5, 200) }, build: p => tuckEnd(p, 'rte') },
  ste: { label: 'Straight tuck end', group: 'Cartons', params: { ...COMMON, glue: num('Glue flap', 15, 5, 50), tuck: num('Tuck flap', 15, 5, 200) }, build: p => tuckEnd(p, 'ste') },
  autolock: { label: 'Auto-lock (crash-lock) bottom', group: 'Cartons', params: { ...COMMON, glue: num('Glue flap', 15, 5, 50), tuck: num('Tuck flap', 15, 5, 200) }, build: autoLock },
  sealend: { label: 'Seal end (glued both ends)', group: 'Cartons', params: { ...COMMON, glue: num('Glue flap', 15, 5, 50), overlap: num('Flap overlap', 12, 0, 200, 0.5, 'major flaps past centre') }, build: sealEnd },
  sleeve: { label: 'Sleeve (open both ends)', group: 'Sleeves & trays', params: { ...COMMON, glue: num('Glue flap', 15, 5, 50) }, build: sleeve },
  tray: { label: 'Tray with lid (2 pieces)', group: 'Sleeves & trays', params: { L: num('Length (L)', 120, 20, 1500), W: num('Width (W)', 80, 20, 1500), H: num('Tray height', 40, 5, 500), lidH: num('Lid height', 25, 5, 500), t: COMMON.t, clear: num('Lid clearance', 1, 0, 10, 0.25, 'extra room') }, build: trayWithLid },
  mailer: { label: 'Mailer (roll end, front tuck)', group: 'Mailers', params: { L: num('Length (L)', 200, 40, 1500), W: num('Width (W)', 150, 40, 1500), H: num('Height (H)', 60, 15, 500), t: num('Board', 1.5, 0, 6, 0.05, 'thickness mm'), tuck: num('Front tuck', 40, 10, 400) }, build: mailer },
};

export function defaults(style) {
  return Object.fromEntries(Object.entries(STYLES[style].params).map(([k, v]) => [k, v.def]));
}

export function validate(style, p) {
  const s = STYLES[style]; if (!s) return ['Unknown box style'];
  const errs = [];
  for (const [k, d] of Object.entries(s.params)) {
    if (!(Number.isFinite(p[k]) && p[k] >= d.min && p[k] <= d.max)) errs.push(`${d.label} must be ${d.min}–${d.max} mm`);
  }
  if ((style === 'rte' || style === 'ste' || style === 'autolock') && p.tuck > p.W + p.t) errs.push('Tuck flap must not be deeper than W');
  if (style === 'mailer' && p.tuck > p.H * 1.2) errs.push('Front tuck should not be much deeper than H');
  return errs;
}

/** Build a style. Returns { dieline, labels, dims, hints, style, params }. */
export function generate(style, params) {
  const p = { ...defaults(style), ...params };
  const errs = validate(style, p);
  if (errs.length) throw new Error(errs.join('. '));
  const out = STYLES[style].build(p);
  // shift so the dieline starts at 0,0
  const { minx, miny } = out.dieline.bbox;
  const mv = q => [q[0] - minx, q[1] - miny];
  out.dieline.pieces.forEach(pc => (pc.pts = pc.pts.map(mv)));
  out.dieline.cuts.forEach(e => { e.a = mv(e.a); e.b = mv(e.b); });
  out.dieline.creases.forEach(e => { e.a = mv(e.a); e.b = mv(e.b); });
  out.dims.forEach(d => { d.a = mv(d.a); d.b = mv(d.b); });
  out.labels.forEach(l => (l.at = mv(l.at)));
  out.dims.forEach(d => { if (d.at !== undefined) d.at -= d.side === 'right' || d.side === 'left' ? minx : miny; });
  out.hints.root = mv(out.hints.root);
  const b = out.dieline.bbox; out.dieline.bbox = { minx: 0, miny: 0, maxx: b.w, maxy: b.h, w: b.w, h: b.h };
  return { ...out, style, styleLabel: STYLES[style].label, params: p };
}

// ---------- shared: 4 panels + glue flap ----------
function body(p, labels = ['Back', 'Side', 'Front', 'Side']) {
  const { L, W, H, t, glue: g } = p;
  const Lp = L + t, Wp = W + t, Hp = H + t;
  const widths = [Lp, Wp, Lp, Wp], xs = [0];
  widths.forEach(w => xs.push(xs.at(-1) + w));
  const pieces = [], creases = [];
  pieces.push({ pts: flapOnSide(0, 0, Hp, -1, glueLocal(Hp, g)), label: 'Glue', kind: 'glue' });
  creases.push({ a: [0, 0], b: [0, Hp] });
  widths.forEach((w, i) => {
    pieces.push({ pts: rect(xs[i], 0, w, Hp), label: labels[i], kind: 'panel' });
    if (i > 0) creases.push({ a: [xs[i], 0], b: [xs[i], Hp] });
  });
  const dims = [
    ...widths.map((w, i) => ({ a: [xs[i], 0], b: [xs[i] + w, 0], side: 'top', text: w })),
    { a: [xs[4], 0], b: [xs[4], Hp], side: 'right', text: Hp },
  ];
  return { Lp, Wp, Hp, widths, xs, pieces, creases, dims };
}

function tuckClosure(B, i, top, k, roleLid) {
  const x = B.xs[i], w = B.widths[i], D = B.Wp, dir = top ? -1 : 1, yb = top ? 0 : B.Hp;
  B.pieces.push({ pts: rect(x, top ? yb - D : yb, w, D), label: 'Lid', kind: 'lid' });
  B.creases.push({ a: [x, yb], b: [x + w, yb], role: roleLid ? 'lid' : undefined });
  B.pieces.push({ pts: flapOnBase(x, yb + dir * D, w, dir, tuckLocal(w, k)), label: 'Tuck', kind: 'tuck' });
  B.creases.push({ a: [x, yb + dir * D], b: [x + w, yb + dir * D], role: roleLid ? 'tuck' : undefined });
  B.dims.push({ a: [x + w, yb], b: [x + w, yb + dir * D], side: 'right', text: D });
}

function dust(B, i, top, lidOnRight) {
  const x = B.xs[i], w = B.widths[i], dir = top ? -1 : 1, yb = top ? 0 : B.Hp;
  const d = Math.min(B.Wp * 0.8, B.Lp * 0.9);
  B.pieces.push({ pts: flapOnBase(x, yb, w, dir, dustLocal(w, d), lidOnRight), label: 'Dust flap', kind: 'flap' });
  B.creases.push({ a: [x, yb], b: [x + w, yb] });
}

function finish(B, rootPanel = 2, extra = {}) {
  const x = B.xs[rootPanel], w = B.widths[rootPanel];
  return {
    dieline: buildDieline(B.pieces, B.creases),
    labels: B.pieces.map(pc => ({ text: pc.label, at: centroid(pc.pts), kind: pc.kind })),
    dims: B.dims,
    hints: { root: [x + w / 2, B.Hp / 2], floor: false, ...extra },
  };
}

// ---------- styles ----------
function tuckEnd(p, style) {
  const B = body(p);
  tuckClosure(B, 0, true, p.tuck, true);
  if (style === 'rte') tuckClosure(B, 2, false, p.tuck, false); else tuckClosure(B, 0, false, p.tuck, false);
  dust(B, 1, true, false); dust(B, 3, true, false);
  dust(B, 1, false, style === 'rte'); dust(B, 3, false, false);
  return finish(B);
}

function autoLock(p) {
  const B = body(p);
  tuckClosure(B, 0, true, p.tuck, true);
  dust(B, 1, true, false); dust(B, 3, true, false);
  // crash-lock bottom: L panels get a deep flap with a 45° glue-assist crease (flat when closed),
  // W panels get flaps that taper 45° on the far side.
  const y = B.Hp;
  [0, 2].forEach(i => {
    const x = B.xs[i], w = B.widths[i], d = Math.min(B.Wp * 0.65, w);
    B.pieces.push({ pts: rect(x, y, w, d), label: 'Lock flap', kind: 'flap' });
    B.creases.push({ a: [x, y], b: [x + w, y] });
    B.creases.push({ a: [x + w, y], b: [x + w - d, y + d], fold: 0 });   // glue-assist diagonal
    B.labels2 = (B.labels2 || []).concat({ text: 'Glue', at: [x + w - d * 0.28, y + d * 0.72], kind: 'glue' });
  });
  [1, 3].forEach(i => {
    const x = B.xs[i], w = B.widths[i], d = Math.min(B.Lp * 0.5, w * 0.8);
    B.pieces.push({ pts: [[x, y], [x, y + d], [x + w - d, y + d], [x + w, y]], label: 'Lock flap', kind: 'flap' });
    B.creases.push({ a: [x, y], b: [x + w, y] });
  });
  const out = finish(B);
  out.labels.push(...(B.labels2 || []));
  return out;
}

function sealEnd(p) {
  const B = body(p);
  for (const top of [true, false]) {
    const dir = top ? -1 : 1, yb = top ? 0 : B.Hp;
    const major = Math.min(B.Wp / 2 + p.overlap, B.Wp);
    [0, 2].forEach((i, n) => {
      const x = B.xs[i], w = B.widths[i], d = major - n, c = Math.min(2, w * 0.05);
      B.pieces.push({ pts: flapOnBase(x, yb, w, dir, [[0, 0], [c, d], [w - c, d], [w, 0]]), label: 'Major flap', kind: 'flap' });
      B.creases.push({ a: [x, yb], b: [x + w, yb] });
    });
    [1, 3].forEach(i => {
      const x = B.xs[i], w = B.widths[i], d = Math.max(5, B.Lp / 2 - 1);
      B.pieces.push({ pts: flapOnBase(x, yb, w, dir, dustLocal(w, Math.min(d, w * 1.2))), label: 'Minor flap', kind: 'flap' });
      B.creases.push({ a: [x, yb], b: [x + w, yb] });
    });
  }
  return finish(B);
}

function sleeve(p) {
  return finish(body(p));
}

function trayPiece(x0, y0, L, W, H, label) {
  // base at (x0, y0); walls fold up; corner flaps on the long walls tuck inside the end walls
  const pieces = [], creases = [], dims = [];
  const cf = Math.min(W * 0.45, H * 0.95);
  pieces.push({ pts: rect(x0, y0, L, W), label: `${label} base`, kind: 'panel' });
  pieces.push({ pts: rect(x0, y0 - H, L, H), label: 'Wall', kind: 'panel' });
  creases.push({ a: [x0, y0], b: [x0 + L, y0] });
  pieces.push({ pts: rect(x0, y0 + W, L, H), label: 'Wall', kind: 'panel' });
  creases.push({ a: [x0, y0 + W], b: [x0 + L, y0 + W] });
  pieces.push({ pts: rect(x0 - H, y0, H, W), label: 'End', kind: 'panel' });
  creases.push({ a: [x0, y0], b: [x0, y0 + W] });
  pieces.push({ pts: rect(x0 + L, y0, H, W), label: 'End', kind: 'panel' });
  creases.push({ a: [x0 + L, y0], b: [x0 + L, y0 + W] });
  const corner = (wy, towardBase, side) => { // flap on a long wall's side edge
    const x = side < 0 ? x0 : x0 + L, tap = Math.min(3, H * 0.15);
    const local = towardBase ? [[0, 0], [tap, cf], [H, cf], [H, 0]] : [[0, 0], [0, cf], [H - tap, cf], [H, 0]];
    pieces.push({ pts: flapOnSide(x, wy, H, side, local), label: 'Corner', kind: 'flap' });
    creases.push({ a: [x, wy], b: [x, wy + H] });
  };
  corner(y0 - H, false, -1); corner(y0 - H, false, 1);   // top wall: flap edge at the base side is flush (slit)
  corner(y0 + W, true, -1); corner(y0 + W, true, 1);
  dims.push({ a: [x0, y0 - H], b: [x0 + L, y0 - H], side: 'top', text: L });
  dims.push({ a: [x0 + L + H, y0], b: [x0 + L + H, y0 + W], side: 'right', text: W, at: x0 + L + H + 5 });
  dims.push({ a: [x0 + L, y0 + W], b: [x0 + L, y0 + W + H], side: 'right', text: H, at: x0 + L + H + 5 });
  return { pieces, creases, dims, width: L + 2 * H };
}

function trayWithLid(p) {
  const { t, clear } = p;
  const Lp = p.L + t, Wp = p.W + t, Hp = p.H + t;
  const tray = trayPiece(Hp, Hp, Lp, Wp, Hp, 'Tray');
  const LL = Lp + 2 * t + clear, LW = Wp + 2 * t + clear, LH = p.lidH + t;
  const gap = 10;
  const lx = Hp + Lp + Hp + gap + LH;
  const lid = trayPiece(lx, Hp, LL, LW, LH, 'Lid');
  return {
    dieline: buildDieline([...tray.pieces, ...lid.pieces], [...tray.creases, ...lid.creases]),
    labels: [...tray.pieces, ...lid.pieces].map(pc => ({ text: pc.label, at: centroid(pc.pts), kind: pc.kind })),
    dims: [...tray.dims, ...lid.dims],
    hints: { root: [Hp + Lp / 2, Hp + Wp / 2], floor: true, parts: 2 },
  };
}

function mailer(p) {
  const { t } = p;
  const Lp = p.L + t, Wp = p.W + t, Hp = p.H + t, Hi = Hp - t, Wl = Wp + 2 * t;
  const pieces = [], creases = [], dims = [];
  const add = (pts, label, kind = 'panel') => pieces.push({ pts, label, kind });
  const crease = (a, b, fold = 90, role) => creases.push({ a, b, fold, role });
  add(rect(0, 0, Lp, Wp), 'Base');
  // back wall, lid, front tuck, lid dust flaps
  add(rect(0, -Hp, Lp, Hp), 'Back'); crease([0, 0], [Lp, 0]);
  add(rect(0, -Hp - Wl, Lp, Wl), 'Lid', 'lid'); crease([0, -Hp], [Lp, -Hp], 90, 'lid');
  add(flapOnBase(0, -Hp - Wl, Lp, -1, tuckLocal(Lp, p.tuck)), 'Front tuck', 'tuck'); crease([0, -Hp - Wl], [Lp, -Hp - Wl], 90, 'tuck');
  const dd = Math.min(Hp * 0.85, Wl * 0.45);
  add(flapOnSide(0, -Hp - Wl, Wl, -1, dustLocal(Wl, dd)), 'Dust flap', 'flap'); crease([0, -Hp - Wl], [0, -Hp]);
  add(flapOnSide(Lp, -Hp - Wl, Wl, 1, dustLocal(Wl, dd)), 'Dust flap', 'flap'); crease([Lp, -Hp - Wl], [Lp, -Hp]);
  // front wall rolls over (double wall)
  add(rect(0, Wp, Lp, Hp), 'Front'); crease([0, Wp], [Lp, Wp]);
  add(rect(0, Wp + Hp, Lp, Hi), 'Front inner'); crease([0, Wp + Hp], [Lp, Wp + Hp], 180);
  // side walls roll over (double walls)
  add(rect(-Hp, 0, Hp, Wp), 'Side'); crease([0, 0], [0, Wp]);
  add(rect(-Hp - Hi, 0, Hi, Wp), 'Side inner'); crease([-Hp, 0], [-Hp, Wp], 180);
  add(rect(Lp, 0, Hp, Wp), 'Side'); crease([Lp, 0], [Lp, Wp]);
  add(rect(Lp + Hp, 0, Hi, Wp), 'Side inner'); crease([Lp + Hp, 0], [Lp + Hp, Wp], 180);
  // ears on back and front walls, locked inside the double side walls
  const e = Math.min(Wp * 0.42, Hp * 1.2), tap = Math.min(e * 0.35, Hp * 0.3);
  const earAway = [[0, 0], [0, e * 0.9], [Hp - tap, e], [Hp, 0]];      // touches the side wall only at a corner
  const earNear = [[0, 0], [tap, e], [Hp, e * 0.9], [Hp, 0]];
  add(flapOnSide(0, -Hp, Hp, -1, earAway), 'Ear', 'flap'); crease([0, -Hp], [0, 0]);
  add(flapOnSide(Lp, -Hp, Hp, 1, earAway), 'Ear', 'flap'); crease([Lp, -Hp], [Lp, 0]);
  add(flapOnSide(0, Wp, Hp, -1, earNear), 'Ear', 'flap'); crease([0, Wp], [0, Wp + Hp]);
  add(flapOnSide(Lp, Wp, Hp, 1, earNear), 'Ear', 'flap'); crease([Lp, Wp], [Lp, Wp + Hp]);
  dims.push({ a: [0, -Hp - Wl], b: [Lp, -Hp - Wl], side: 'top', text: Lp });
  dims.push({ a: [Lp + Hp + Hi, 0], b: [Lp + Hp + Hi, Wp], side: 'right', text: Wp });
  dims.push({ a: [Lp + Hp + Hi, -Hp], b: [Lp + Hp + Hi, 0], side: 'right', text: Hp });
  return {
    dieline: buildDieline(pieces, creases),
    labels: pieces.map(pc => ({ text: pc.label, at: centroid(pc.pts), kind: pc.kind })),
    dims,
    hints: { root: [Lp / 2, Wp / 2], floor: true },
  };
}

function centroid(pts) {
  let a = 0, cx = 0, cy = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  });
  if (Math.abs(a) < 1e-9) return pts[0];
  return [cx / (3 * a), cy / (3 * a)];
}
