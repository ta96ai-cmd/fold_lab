// Artwork layers on a dieline: pure maths, no DOM (shared by the editor, the 3D handoff and the print PDF).
//
// A layer is an image placed on the dieline page, in mm, y down (the same frame as the dieline):
//   { w, h }     natural size in mm (before scale)
//   { x, y }     centre in mm
//   s            scale (1 = natural size)
//   rot          rotation in degrees, clockwise on screen
//   fx, fy       mirror left-right / top-bottom
//   op           opacity 0..1
//   visible      false = hidden
// The image itself is a unit square (0..1, y down) that layerAffine maps onto the page.

export const MM2PT = 72 / 25.4;

/** 2D affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f (SVG / canvas convention). */
export const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** The affine that takes points (0,0), (1,0), (0,1) to p0, p1, p2. */
export function from3(p0, p1, p2) {
  return [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]];
}

/** Unit square of the image (y down) -> page mm (y down). */
export function layerAffine(L) {
  const r = (L.rot || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
  const W = L.w * L.s * (L.fx ? -1 : 1), H = L.h * L.s * (L.fy ? -1 : 1);
  const f = ([u, v]) => {                  // centre the square, scale/flip, rotate, move
    const px = (u - 0.5) * W, py = (v - 0.5) * H;
    return [L.x + px * cs - py * sn, L.y + px * sn + py * cs];
  };
  return from3(f([0, 0]), f([1, 0]), f([0, 1]));
}

/** Corners of a placed layer in page mm (for hit tests and bounds). */
export function layerCorners(L) {
  const m = layerAffine(L);
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(p => apply(m, p));
}

/**
 * The same placement for a PDF page: the image is drawn into the unit square with y up (image top at y = 1),
 * the page is in points with y up. page = { x, y, w, h } in mm (the dieline page box).
 */
export function pdfAffine(L, page) {
  const m = layerAffine(L), k = MM2PT;
  const toPt = ([x, y]) => [(x - page.x) * k, (page.y + page.h - y) * k];
  const f = ([u, v]) => toPt(apply(m, [u, 1 - v]));     // PDF image space (y up) -> image square (y down)
  return from3(f([0, 0]), f([1, 0]), f([0, 1]));
}

/**
 * Fit a layer to a box (mm): 'cover' fills the box (may crop), 'contain' fits inside it,
 * 'width' matches the box width. Keeps rotation (90° / 270° swap width and height).
 */
export function fitLayer(L, box, mode = 'cover') {
  const quarter = Math.round(((L.rot || 0) % 360 + 360) % 360 / 90) % 2 === 1;
  const w = quarter ? L.h : L.w, h = quarter ? L.w : L.h;
  const sx = box.w / w, sy = box.h / h;
  const s = mode === 'contain' ? Math.min(sx, sy) : mode === 'width' ? sx : Math.max(sx, sy);
  return { ...L, s, x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** Effective print resolution of a raster layer (pixels per inch at its placed size). */
export const layerDpi = (L, pxW) => (pxW && L.w && L.s ? pxW / (L.w * L.s / 25.4) : Infinity);

/** Natural size in mm of a raster image: 300 dpi unless the file says otherwise. */
export const rasterMm = (pxW, pxH, dpi = 300) => ({ w: pxW / dpi * 25.4, h: pxH / dpi * 25.4 });

// ---------- undo / redo of layer placements ----------
const KEYS = ['id', 'x', 'y', 's', 'rot', 'fx', 'fy', 'op', 'visible'];
export const snapshot = sides => JSON.stringify(Object.fromEntries(
  Object.entries(sides).map(([k, list]) => [k, list.map(L => Object.fromEntries(KEYS.map(q => [q, L[q]])))])));
/** Restore placements and order from a snapshot; byId holds every layer ever added. */
export function restore(snap, byId) {
  const o = JSON.parse(snap);
  return Object.fromEntries(Object.entries(o).map(([k, list]) => [k, list.map(p => Object.assign(byId.get(p.id), p))]));
}
export function history(limit = 60) {
  const past = [], future = [];
  return {
    push(s) { if (past.at(-1) !== s) past.push(s); if (past.length > limit) past.shift(); future.length = 0; },
    undo(cur) { if (!past.length) return null; future.push(cur); return past.pop(); },
    redo(cur) { if (!future.length) return null; past.push(cur); return future.pop(); },
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
  };
}

/** Mirror a page x coordinate (inside view = the dieline seen from the back). */
export const mirrorX = (x, page) => 2 * page.x + page.w - x;
