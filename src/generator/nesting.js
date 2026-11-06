// Sheet layout: how many dielines fit on a printing sheet (rectangular nesting by bounding box).
// Tries upright and rotated grids, then fills the leftover strip with the other orientation.

export const SHEETS = {
  '18x23': { w: 457.2, h: 584.2, label: '18 × 23 in' },
  '20x30': { w: 508, h: 762, label: '20 × 30 in' },
  '23x36': { w: 584.2, h: 914.4, label: '23 × 36 in' },
  '25x36': { w: 635, h: 914.4, label: '25 × 36 in' },
  '28x40': { w: 711.2, h: 1016, label: '28 × 40 in' },
  SRA3: { w: 320, h: 450, label: 'SRA3 (320 × 450 mm)' },
  A2: { w: 420, h: 594, label: 'A2 (420 × 594 mm)' },
  B1: { w: 707, h: 1000, label: 'B1 (707 × 1000 mm)' },
  custom: { w: 700, h: 1000, label: 'Custom…' },
};

const grid = (W, H, w, h, g) => {
  if (w > W || h > H) return { cols: 0, rows: 0 };
  return { cols: Math.floor((W + g) / (w + g)), rows: Math.floor((H + g) / (h + g)) };
};

/**
 * dw, dh: dieline size (mm, including bleed if wanted). sheet: { w, h }.
 * opts: gutter between dielines, margin around the sheet edge (gripper).
 * Returns { count, placements: [{ x, y, rot }], used: { w, h }, area }.
 */
export function nest(dw, dh, sheet, { gutter = 5, margin = 10 } = {}) {
  const W = sheet.w - 2 * margin, H = sheet.h - 2 * margin;
  let best = { count: 0, placements: [] };
  for (const rot of [false, true]) {
    const w = rot ? dh : dw, h = rot ? dw : dh;
    const main = grid(W, H, w, h, gutter);
    const placements = [];
    for (let r = 0; r < main.rows; r++) for (let c = 0; c < main.cols; c++)
      placements.push({ x: margin + c * (w + gutter), y: margin + r * (h + gutter), rot });
    // leftover strips with the other orientation (try right strip, then bottom strip; keep the better)
    const ow = rot ? dw : dh, oh = rot ? dh : dw;
    const usedW = main.cols ? main.cols * (w + gutter) : 0, usedH = main.rows ? main.rows * (h + gutter) : 0;
    const right = grid(W - usedW, H, ow, oh, gutter), bottom = grid(W, H - usedH, ow, oh, gutter);
    const extra = [];
    if (right.cols * right.rows >= bottom.cols * bottom.rows) {
      for (let r = 0; r < right.rows; r++) for (let c = 0; c < right.cols; c++)
        extra.push({ x: margin + usedW + c * (ow + gutter), y: margin + r * (oh + gutter), rot: !rot });
    } else {
      for (let r = 0; r < bottom.rows; r++) for (let c = 0; c < bottom.cols; c++)
        extra.push({ x: margin + c * (ow + gutter), y: margin + usedH + r * (oh + gutter), rot: !rot });
    }
    const all = [...placements, ...extra];
    if (all.length > best.count) best = { count: all.length, placements: all };
  }
  return best;
}

export function polyArea(pts) {
  let a = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; });
  return Math.abs(a) / 2;
}

/** Place copies of a generated dieline on a sheet: returns a "gen"-like object for the writers. */
export function sheetLayout(gen, sheet, layout, pad = 0) {
  const d = gen.dieline, ox = d.bbox.minx - pad, oy = d.bbox.miny - pad, dh = d.bbox.h + 2 * pad;
  // upright: shift into the placement box; rotated 90° clockwise: (u, v) -> (dh - v, u)
  const T = (pl, q) => {
    const u = q[0] - ox, v = q[1] - oy;
    return pl.rot ? [pl.x + (dh - v), pl.y + u] : [pl.x + u, pl.y + v];
  };
  const pieces = [], cuts = [], creases = [];
  for (const pl of layout.placements) {
    d.pieces.forEach(pc => pieces.push({ ...pc, pts: pc.pts.map(q => T(pl, q)) }));
    d.cuts.forEach(e => cuts.push({ a: T(pl, e.a), b: T(pl, e.b) }));
    d.creases.forEach(e => creases.push({ ...e, a: T(pl, e.a), b: T(pl, e.b) }));
  }
  return {
    ...gen,
    dieline: { pieces, cuts, creases, bbox: { minx: 0, miny: 0, maxx: sheet.w, maxy: sheet.h, w: sheet.w, h: sheet.h } },
    labels: [], dims: [],
    hints: { root: [0, 0], floor: false },
  };
}
