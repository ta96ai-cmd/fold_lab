// ===== Fold engine: segments -> panels (faces) + hinge tree =====
// Input segments are in y-up coordinates: {a:{x,y}, b:{x,y}, type:'cut'|'crease'}

export function buildModel(segsIn, opt = {}) {
  const segs = segsIn.filter(s => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 1e-9);
  if (!segs.length) throw new Error('No cut or crease lines found.');
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const s of segs) for (const p of [s.a, s.b]) {
    minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
    maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
  }
  const diag = Math.hypot(maxx - minx, maxy - miny);
  const tol = opt.tol ?? diag * 1e-3;

  // 1. split params per segment (intersections, T-junctions, near misses)
  const params = segs.map(() => [0, 1]);
  const bbs = segs.map(s => [Math.min(s.a.x, s.b.x) - tol, Math.min(s.a.y, s.b.y) - tol,
                              Math.max(s.a.x, s.b.x) + tol, Math.max(s.a.y, s.b.y) + tol]);
  // grid acceleration
  const cell = diag / 40;
  const grid = new Map();
  segs.forEach((s, i) => {
    const b = bbs[i];
    for (let gx = Math.floor(b[0] / cell); gx <= Math.floor(b[2] / cell); gx++)
      for (let gy = Math.floor(b[1] / cell); gy <= Math.floor(b[3] / cell); gy++) {
        const k = gx + ',' + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });
  const tested = new Set();
  for (const list of grid.values()) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = list[x], j = list[y];
      const key = i < j ? i * 1e6 + j : j * 1e6 + i;
      if (tested.has(key)) continue;
      tested.add(key);
      const A = bbs[i], B = bbs[j];
      if (A[0] > B[2] || B[0] > A[2] || A[1] > B[3] || B[1] > A[3]) continue;
      intersect(segs[i], segs[j], tol, params[i], params[j]);
    }
  }

  // 2. vertices (snapped) and edges
  const verts = [], vgrid = new Map();
  const vid = p => {
    const gx = Math.floor(p.x / tol), gy = Math.floor(p.y / tol);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = vgrid.get((gx + dx) + ',' + (gy + dy));
      if (l) for (const id of l) if (Math.hypot(verts[id].x - p.x, verts[id].y - p.y) <= tol) return id;
    }
    const id = verts.length; verts.push({ x: p.x, y: p.y });
    const k = gx + ',' + gy; if (!vgrid.has(k)) vgrid.set(k, []); vgrid.get(k).push(id);
    return id;
  };
  const edgeMap = new Map(), edges = [];
  segs.forEach((s, i) => {
    const ts = [...new Set(params[i].map(t => Math.min(1, Math.max(0, t))))].sort((a, b) => a - b);
    let prev = null;
    for (const t of ts) {
      const id = vid({ x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) });
      if (prev !== null && prev !== id) {
        const k = prev < id ? prev + '_' + id : id + '_' + prev;
        if (!edgeMap.has(k)) { edgeMap.set(k, edges.length); edges.push({ u: prev, v: id, type: s.type }); }
        else if (s.type === 'crease') edges[edgeMap.get(k)].type = 'crease'; // a crease drawn over a cut line wins (many dielines outline every panel)
      }
      prev = id;
    }
  });

  // 3. remove dangling edges
  const alive = edges.map(() => true);
  const deg = verts.map(() => 0);
  edges.forEach(e => { deg[e.u]++; deg[e.v]++; });
  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach((e, i) => {
      if (alive[i] && (deg[e.u] === 1 || deg[e.v] === 1)) {
        alive[i] = false; deg[e.u]--; deg[e.v]--; changed = true;
      }
    });
  }

  // 4. half-edges and faces
  const out = verts.map(() => []);
  edges.forEach((e, i) => {
    if (!alive[i]) return;
    out[e.u].push(2 * i); out[e.v].push(2 * i + 1);
  });
  const from = h => (h & 1) ? edges[h >> 1].v : edges[h >> 1].u;
  const to = h => (h & 1) ? edges[h >> 1].u : edges[h >> 1].v;
  const ang = h => { const a = verts[from(h)], b = verts[to(h)]; return Math.atan2(b.y - a.y, b.x - a.x); };
  out.forEach(l => l.sort((p, q) => ang(p) - ang(q)));
  const pos = new Map();
  out.forEach(l => l.forEach((h, i) => pos.set(h, i)));
  const next = h => { const v = to(h), l = out[v], i = pos.get(h ^ 1); return l[(i - 1 + l.length) % l.length]; };

  const faceOf = new Int32Array(edges.length * 2).fill(-2);
  const faces = [];
  const minArea = diag * diag * 1e-6;
  for (let i = 0; i < edges.length; i++) {
    if (!alive[i]) continue;
    for (const h0 of [2 * i, 2 * i + 1]) {
      if (faceOf[h0] !== -2) continue;
      const cyc = []; let h = h0, guard = 0;
      do { cyc.push(h); faceOf[h] = -3; h = next(h); } while (h !== h0 && ++guard < 1e6);
      const poly = cyc.map(h => verts[from(h)]);
      const area = signedArea(poly);
      const fid = area > minArea ? faces.length : -1;
      if (fid >= 0) faces.push({ id: fid, poly: simplify(poly, tol * 0.5), area, centroid: centroid(poly, area) });
      cyc.forEach(h => faceOf[h] = fid);
    }
  }

  // 5. hinges between faces across crease edges
  const pairMap = new Map();
  edges.forEach((e, i) => {
    if (!alive[i] || e.type !== 'crease') return;
    const f1 = faceOf[2 * i], f2 = faceOf[2 * i + 1];
    if (f1 < 0 || f2 < 0 || f1 === f2) return;
    const k = Math.min(f1, f2) + '_' + Math.max(f1, f2);
    if (!pairMap.has(k)) pairMap.set(k, { f1: Math.min(f1, f2), f2: Math.max(f1, f2), pts: [] });
    pairMap.get(k).pts.push(verts[e.u], verts[e.v]);
  });
  const adj = faces.map(() => []);
  for (const p of pairMap.values()) {
    const d0 = { x: p.pts[1].x - p.pts[0].x, y: p.pts[1].y - p.pts[0].y };
    const L = Math.hypot(d0.x, d0.y); const d = { x: d0.x / L, y: d0.y / L };
    let lo = Infinity, hi = -Infinity, lp, hp;
    for (const q of p.pts) {
      const t = (q.x - p.pts[0].x) * d.x + (q.y - p.pts[0].y) * d.y;
      if (t < lo) { lo = t; lp = q; } if (t > hi) { hi = t; hp = q; }
    }
    adj[p.f1].push({ other: p.f2, a: lp, b: hp });
    adj[p.f2].push({ other: p.f1, a: lp, b: hp });
  }

  // 6. spanning tree from largest panel
  if (!faces.length) throw new Error('No closed panels found. Check that cut lines form a closed outline.');
  let root = 0;
  faces.forEach(f => { if (f.area > faces[root].area) root = f.id; });
  const parent = faces.map(() => -1), depth = faces.map(() => -1);
  const hinges = [];
  depth[root] = 0;
  const queue = [root];
  while (queue.length) {
    const f = queue.shift();
    for (const n of adj[f]) {
      if (depth[n.other] >= 0) continue;
      depth[n.other] = depth[f] + 1; parent[n.other] = f;
      const dir = { x: n.b.x - n.a.x, y: n.b.y - n.a.y };
      const L = Math.hypot(dir.x, dir.y); dir.x /= L; dir.y /= L;
      const c = faces[n.other].centroid;
      const cross = dir.x * (c.y - n.a.y) - dir.y * (c.x - n.a.x);
      hinges.push({ id: hinges.length, parent: f, child: n.other, a: n.a, b: n.b, dir, sign: cross > 0 ? -1 : 1, depth: depth[n.other] });
      queue.push(n.other);
    }
  }
  const connected = faces.filter(f => depth[f.id] >= 0);
  return {
    faces, hinges, root, depth, diag, tol,
    bbox: { minx, miny, maxx, maxy },
    stats: {
      panels: connected.length, hinges: hinges.length,
      cutEdges: edges.filter((e, i) => alive[i] && e.type === 'cut').length,
      creaseEdges: edges.filter((e, i) => alive[i] && e.type === 'crease').length,
      loosePanels: faces.length - connected.length,
    },
  };
}

function intersect(s, r, tol, ps, pr) {
  const d1 = { x: s.b.x - s.a.x, y: s.b.y - s.a.y }, d2 = { x: r.b.x - r.a.x, y: r.b.y - r.a.y };
  const L1 = Math.hypot(d1.x, d1.y), L2 = Math.hypot(d2.x, d2.y);
  const den = d1.x * d2.y - d1.y * d2.x;
  // endpoint-on-segment checks (T-junctions, overlaps, near misses)
  const onSeg = (p, a, d, L, list) => {
    const t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / (L * L);
    if (t < -tol / L || t > 1 + tol / L) return;
    const cx = a.x + t * d.x, cy = a.y + t * d.y;
    if (Math.hypot(p.x - cx, p.y - cy) <= tol * 1.5) list.push(Math.min(1, Math.max(0, t)));
  };
  onSeg(r.a, s.a, d1, L1, ps); onSeg(r.b, s.a, d1, L1, ps);
  onSeg(s.a, r.a, d2, L2, pr); onSeg(s.b, r.a, d2, L2, pr);
  if (Math.abs(den) < 1e-12 * L1 * L2) return;
  const t = ((r.a.x - s.a.x) * d2.y - (r.a.y - s.a.y) * d2.x) / den;
  const u = ((r.a.x - s.a.x) * d1.y - (r.a.y - s.a.y) * d1.x) / den;
  const e1 = 2 * tol / L1, e2 = 2 * tol / L2;
  if (t >= -e1 && t <= 1 + e1 && u >= -e2 && u <= 1 + e2) {
    ps.push(Math.min(1, Math.max(0, t))); pr.push(Math.min(1, Math.max(0, u)));
  }
}

export function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y; }
  return a / 2;
}
function centroid(p, area) {
  let cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i], r = p[(i + 1) % p.length], f = q.x * r.y - r.x * q.y;
    cx += (q.x + r.x) * f; cy += (q.y + r.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}
function simplify(poly, eps) {
  // drop collinear / duplicate points
  let p = poly.slice(), changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length && p.length > 3; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const L = Math.hypot(c.x - a.x, c.y - a.y);
      const dist = L < 1e-12 ? 0 : Math.abs((c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y)) / L;
      const within = (b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y) >= 0 &&
                     (b.x - c.x) * (a.x - c.x) + (b.y - c.y) * (a.y - c.y) >= 0;
      if (dist < eps && within) { p.splice(i, 1); changed = true; i--; }
    }
  }
  return p;
}

// Default role for a stroke colour: cyan/blue/green or dashed -> crease, else cut
export function defaultRole(r, g, b, dashed) {
  if (dashed) return 'crease';
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 30) return 'cut';               // black / grey
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  return (h >= 80 && h <= 260) ? 'crease' : 'cut';
}
