// Dieline core (pure JS, mm, y down).
// A dieline is described by PIECES (closed polygons: panels and flaps) and explicit CREASES.
//  - Every piece edge is split at all piece corners / crease ends lying on it.
//  - A piece-edge part covered by a crease is a crease (written once).
//  - Every other piece-edge part is a cut (written once). Two flaps that merely touch get a
//    cut between them (a slit), never an accidental fold.
//  - Creases inside a piece (e.g. glue-assist diagonals) are written as given.
// Creases carry the angle they have when the box is closed (fold, default 90) and an optional
// role ('lid', 'tuck') so the 3D view knows how to close and open the box.

const EPS = 1e-6;
const r3 = v => Math.round(v * 1000) / 1000;
const pkey = p => `${r3(p[0])},${r3(p[1])}`;
const skey = (a, b) => { const A = pkey(a), B = pkey(b); return A < B ? A + '|' + B : B + '|' + A; };

function onSegment(p, a, b, tol = 1e-4) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  if (L2 < EPS) return null;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
  if (t < -EPS || t > 1 + EPS) return null;
  const qx = a[0] + t * dx, qy = a[1] + t * dy;
  return Math.hypot(p[0] - qx, p[1] - qy) <= tol ? t : null;
}

/**
 * pieces: [{ pts: [[x,y],...], label?, kind? ('panel'|'flap'|'glue'|...) }]
 * creases: [{ a: [x,y], b: [x,y], fold?: degrees when closed (default 90), role?: 'lid'|'tuck' }]
 * Returns { cuts: [{a,b}], creases: [{a,b,fold,role}], pieces, bbox }
 */
export function buildDieline(pieces, creases) {
  const anchors = [];
  pieces.forEach(pc => pc.pts.forEach(p => anchors.push(p)));
  creases.forEach(c => anchors.push(c.a, c.b));

  // creases may also be split by anchors (so partial overlaps match exactly)
  const creaseParts = new Map();
  for (const c of creases) {
    const ts = [0, 1];
    for (const p of anchors) { const t = onSegment(p, c.a, c.b); if (t !== null) ts.push(t); }
    const uniq = [...new Set(ts.map(t => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y);
    for (let i = 0; i < uniq.length - 1; i++) {
      const a = [c.a[0] + (c.b[0] - c.a[0]) * uniq[i], c.a[1] + (c.b[1] - c.a[1]) * uniq[i]];
      const b = [c.a[0] + (c.b[0] - c.a[0]) * uniq[i + 1], c.a[1] + (c.b[1] - c.a[1]) * uniq[i + 1]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) continue;
      creaseParts.set(skey(a, b), { a, b, fold: c.fold ?? 90, role: c.role });
    }
  }

  const cuts = new Map();
  for (const pc of pieces) {
    pc.pts.forEach((a, i) => {
      const b = pc.pts[(i + 1) % pc.pts.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) return;
      const ts = [0, 1];
      for (const p of anchors) { const t = onSegment(p, a, b); if (t !== null) ts.push(t); }
      const uniq = [...new Set(ts.map(t => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y);
      for (let k = 0; k < uniq.length - 1; k++) {
        const p = [a[0] + (b[0] - a[0]) * uniq[k], a[1] + (b[1] - a[1]) * uniq[k]];
        const q = [a[0] + (b[0] - a[0]) * uniq[k + 1], a[1] + (b[1] - a[1]) * uniq[k + 1]];
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3) continue;
        const key = skey(p, q);
        if (!creaseParts.has(key)) cuts.set(key, { a: p, b: q });
      }
    });
  }

  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const pc of pieces) for (const [x, y] of pc.pts) {
    minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y);
  }
  return {
    pieces, cuts: [...cuts.values()], creases: [...creaseParts.values()],
    bbox: { minx, miny, maxx, maxy, w: maxx - minx, h: maxy - miny },
  };
}

/** Join edges into as few polylines as possible (clean files for cutting tables). */
export function chain(edges) {
  const byPt = new Map();
  edges.forEach((e, i) => [e.a, e.b].forEach(q => { const k = pkey(q); if (!byPt.has(k)) byPt.set(k, []); byPt.get(k).push(i); }));
  const used = new Set(), lines = [];
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const line = [edges[i].a, edges[i].b];
    for (const end of [1, 0]) {
      while (true) {
        const tip = end ? line.at(-1) : line[0];
        const nx = (byPt.get(pkey(tip)) || []).find(j => !used.has(j));
        if (nx === undefined) break;
        used.add(nx);
        const e = edges[nx], other = pkey(e.a) === pkey(tip) ? e.b : e.a;
        end ? line.push(other) : line.unshift(other);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Segments for the fold engine (y flipped up). */
export function toEngineSegments(d) {
  const P = q => ({ x: q[0], y: -q[1] });
  return [
    ...d.cuts.map(e => ({ a: P(e.a), b: P(e.b), type: 'cut' })),
    ...d.creases.map(e => ({ a: P(e.a), b: P(e.b), type: 'crease', fold: e.fold, role: e.role })),
  ];
}

// ---------- shape helpers ----------
export const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Rounded corner points from a to b around corner c (quadratic), excluding a and b. */
export function roundCorner(a, c, b, n = 6) {
  const pts = [];
  for (let i = 1; i < n; i++) {
    const s = i / n, u = 1 - s;
    pts.push([u * u * a[0] + 2 * u * s * c[0] + s * s * b[0], u * u * a[1] + 2 * u * s * c[1] + s * s * b[1]]);
  }
  return pts;
}

/**
 * Generic flap on base (x, y)..(x + w, y), growing in direction dir (-1 up, +1 down).
 * Local outline given as [u, d] pairs (u along the base, d away from it), mirrored if flip.
 */
export function flapOnBase(x, y, w, dir, local, flip = false) {
  return local.map(([u, d]) => [flip ? x + w - u : x + u, y + dir * d]);
}

/** Same, on a vertical base (x, y)..(x, y + h), growing in direction dir (-1 left, +1 right). */
export function flapOnSide(x, y, h, dir, local, flip = false) {
  return local.map(([u, d]) => [x + dir * d, flip ? y + h - u : y + u]);
}

/** Tuck flap outline (local coords) with shoulders and rounded corners. */
export function tuckLocal(w, depth) {
  const s = Math.min(1.5, w * 0.03), r = Math.min(depth * 0.7, w * 0.22);
  const A = [s, depth - r], C1 = [s, depth], B = [s + r, depth];
  const D = [w - s - r, depth], C2 = [w - s, depth], E = [w - s, depth - r];
  return [[0, 0], [0, 1], [s, 1], A, ...roundCorner(A, C1, B), B, D, ...roundCorner(D, C2, E), E, [w - s, 1], [w, 1], [w, 0]];
}

/** Dust flap outline (local); the side at u = 0 tapers gently, the far side steeply. */
export function dustLocal(w, depth) {
  const near = Math.min(w * 0.12, depth * 0.35), far = Math.min(w * 0.35, depth * 0.7);
  return [[0, 0], [near, depth], [w - far, depth], [w, depth * 0.35], [w, 0]];
}

/** Glue flap outline (local), tapered both ends. */
export function glueLocal(h, g) {
  const tap = Math.min(g * 0.7, h / 4);
  return [[0, 0], [tap, g], [h - tap, g], [h, 0]];
}

/** Die-maker statistics: line lengths (mm), used board area and utilisation of the bounding rectangle. */
export function dielineStats(d) {
  const len = e => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
  const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const used = d.pieces.reduce((s, pc) => s + area(pc.pts), 0), rect = d.bbox.w * d.bbox.h;
  return {
    cutLength: d.cuts.reduce((s, e) => s + len(e), 0),
    creaseLength: d.creases.reduce((s, e) => s + len(e), 0),
    usedArea: used, rectArea: rect, utilisation: rect ? used / rect : 0,
  };
}
