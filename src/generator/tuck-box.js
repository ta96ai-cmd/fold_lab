// Parametric tuck-end carton dielines (pure JS, no DOM). All sizes in mm.
//
// Layout (left to right): glue flap | back (L) | side (W) | front (L) | side (W)
//  - Reverse tuck end (RTE): top closure on the back panel, bottom closure on the front panel.
//  - Straight tuck end (STE): top and bottom closures both on the back panel.
// Dimensions are INSIDE sizes. Each panel gets + board thickness (t) so the product still fits:
//   panel width = L + t (or W + t), panel height = H + t, lid depth = W + t.
// These are common starting allowances only: check the first sample with your die-maker.

export const BOX_STYLES = {
  rte: { label: 'Reverse tuck end' },
  ste: { label: 'Straight tuck end' },
};

export const DEFAULT_BOX = { style: 'rte', L: 60, W: 40, H: 120, t: 0.4, glue: 15, tuck: 15 };

export function validateBox(p) {
  const errs = [];
  for (const k of ['L', 'W', 'H']) if (!(p[k] >= 10 && p[k] <= 2000)) errs.push(`${k} must be between 10 and 2000 mm`);
  if (!(p.t >= 0 && p.t <= 5)) errs.push('Board thickness must be 0–5 mm');
  if (!(p.glue >= 5 && p.glue <= 50)) errs.push('Glue flap must be 5–50 mm');
  if (!(p.tuck >= 5 && p.tuck <= Math.max(5, p.W))) errs.push(`Tuck flap must be 5–${Math.round(p.W)} mm (no deeper than W)`);
  if (!BOX_STYLES[p.style]) errs.push('Unknown box style');
  return errs;
}

const r3 = v => Math.round(v * 1000) / 1000;

/** Rounded corner points from a to b around corner c (quarter-ish arc), excluding a and b. */
function roundCorner(a, c, b, n = 6) {
  const pts = [];
  for (let i = 1; i < n; i++) {
    const s = i / n, u = 1 - s; // quadratic bezier a -> c -> b
    pts.push([u * u * a[0] + 2 * u * s * c[0] + s * s * b[0], u * u * a[1] + 2 * u * s * c[1] + s * s * b[1]]);
  }
  return pts;
}

/** Tuck flap polygon on base (x, y) .. (x + w, y), growing in direction dir (-1 up, +1 down). */
function tuckFlap(x, y, w, depth, dir) {
  const s = Math.min(1.5, w * 0.03);           // shoulder so the tuck slides in
  const r = Math.min(depth * 0.7, w * 0.22);    // rounded corners
  const Y = d => y + dir * d;
  const A = [x + s, Y(depth - r)], C1 = [x + s, Y(depth)], B = [x + s + r, Y(depth)];
  const D = [x + w - s - r, Y(depth)], C2 = [x + w - s, Y(depth)], E = [x + w - s, Y(depth - r)];
  return [
    [x, y], [x, Y(1)], [x + s, Y(1)], A, ...roundCorner(A, C1, B), B,
    D, ...roundCorner(D, C2, E), E, [x + w - s, Y(1)], [x + w, Y(1)], [x + w, y],
  ];
}

/** Dust flap on base (x, y) .. (x + w, y). The side next to a lid tapers away from it. */
function dustFlap(x, y, w, depth, dir, lidOnRight) {
  const near = Math.min(w * 0.12, depth * 0.35), far = Math.min(w * 0.35, depth * 0.7);
  const Y = d => y + dir * d;
  const pts = [[0, 0], [near, depth], [w - far, depth], [w, depth * 0.35], [w, 0]];
  return pts.map(([u, d]) => [lidOnRight ? x + w - u : x + u, Y(d)]);
}

/** Glue flap on the left edge x, from y0 to y1. */
function glueFlap(x, y0, y1, g) {
  const tap = Math.min(g * 0.7, (y1 - y0) / 4);
  return [[x, y0], [x - g, y0 + tap], [x - g, y1 - tap], [x, y1]];
}

/**
 * Returns { segments (y-up, for the fold engine), svg (string, mm), width, height, panels }.
 * In the SVG, magenta #FF00FF = cut, cyan #00FFFF = crease.
 */
export function generateTuckBox(params) {
  const p = { ...DEFAULT_BOX, ...params };
  const errs = validateBox(p);
  if (errs.length) throw new Error(errs.join('. '));
  const { L, W, H, t, glue: g, tuck: k, style } = p;
  const Lp = L + t, Wp = W + t, Hp = H + t, D = W + t;
  const dust = Math.min(D * 0.8, Lp * 0.9);
  const widths = [Lp, Wp, Lp, Wp];
  const xs = [g]; widths.forEach(w => xs.push(xs.at(-1) + w));
  const y0 = D + k, y1 = y0 + Hp;

  const pieces = [];
  pieces.push(glueFlap(g, y0, y1, g));
  widths.forEach((w, i) => pieces.push([[xs[i], y0], [xs[i] + w, y0], [xs[i] + w, y1], [xs[i], y1]]));
  const lids = { top: new Set(), bottom: new Set() };
  const closure = (i, top) => {
    lids[top ? 'top' : 'bottom'].add(i);
    const x = xs[i], w = widths[i], dir = top ? -1 : 1, yb = top ? y0 : y1;
    pieces.push([[x, yb], [x + w, yb], [x + w, yb + dir * D], [x, yb + dir * D]]);   // lid
    pieces.push(tuckFlap(x, yb + dir * D, w, k, dir));                                // tuck
  };
  const dusts = (i, top) => pieces.push(dustFlap(xs[i], top ? y0 : y1, widths[i], dust, top ? -1 : 1, lids[top ? 'top' : 'bottom'].has(i + 1)));
  closure(0, true);
  if (style === 'rte') closure(2, false); else closure(0, false);
  dusts(1, true); dusts(3, true); dusts(1, false); dusts(3, false);

  // Edges used by two pieces are creases; edges used once are cuts.
  const key = (a, b) => { const A = `${r3(a[0])},${r3(a[1])}`, B = `${r3(b[0])},${r3(b[1])}`; return A < B ? A + '|' + B : B + '|' + A; };
  const edges = new Map();
  for (const poly of pieces) poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) return;
    const kk = key(a, b);
    if (!edges.has(kk)) edges.set(kk, { a, b, n: 0 });
    edges.get(kk).n++;
  });
  const cuts = [], creases = [];
  for (const e of edges.values()) (e.n > 1 ? creases : cuts).push(e);

  const minX = -0, maxX = xs.at(-1), minY = 0, maxY = y1 + D + k;
  const pad = 5, W0 = maxX - minX + 2 * pad, H0 = maxY - minY + 2 * pad;
  const f = v => r3(v);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W0)}mm" height="${f(H0)}mm" viewBox="${f(minX - pad)} ${f(minY - pad)} ${f(W0)} ${f(H0)}">`,
    `<!-- ${BOX_STYLES[style].label} ${L} x ${W} x ${H} mm (inside), board ${t} mm. Magenta = cut, cyan = crease. Made with REA Fold Lab. -->`,
    `<g fill="none" stroke="#FF00FF" stroke-width="0.25">`,
    ...chain(cuts).map(pl => `<polyline points="${pl.map(q => `${f(q[0])},${f(q[1])}`).join(' ')}"/>`),
    `</g><g fill="none" stroke="#00FFFF" stroke-width="0.25">`,
    ...creases.map(e => `<line x1="${f(e.a[0])}" y1="${f(e.a[1])}" x2="${f(e.b[0])}" y2="${f(e.b[1])}"/>`),
    `</g></svg>`,
  ].join('\n');

  const seg = (e, type) => ({ a: { x: e.a[0], y: -e.a[1] }, b: { x: e.b[0], y: -e.b[1] }, type });
  return {
    svg, width: W0, height: H0,
    segments: [...cuts.map(e => seg(e, 'cut')), ...creases.map(e => seg(e, 'crease'))],
    outside: { L: Lp, W: Wp, H: Hp },
  };
}

/** Join edges into as few polylines as possible (cleaner files for cutting tables). */
function chain(edges) {
  const k = q => `${r3(q[0])},${r3(q[1])}`;
  const byPt = new Map();
  edges.forEach((e, i) => [e.a, e.b].forEach(q => { const kk = k(q); if (!byPt.has(kk)) byPt.set(kk, []); byPt.get(kk).push(i); }));
  const used = new Set(), lines = [];
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const line = [edges[i].a, edges[i].b];
    for (const end of [1, 0]) { // extend forward, then backward
      while (true) {
        const tip = end ? line.at(-1) : line[0];
        const nx = (byPt.get(k(tip)) || []).find(j => !used.has(j));
        if (nx === undefined) break;
        used.add(nx);
        const e = edges[nx], other = k(e.a) === k(tip) ? e.b : e.a;
        end ? line.push(other) : line.unshift(other);
      }
    }
    lines.push(line);
  }
  return lines;
}
