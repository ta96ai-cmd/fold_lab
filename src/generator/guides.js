// Bleed and safe-area guides via polygon offsetting (Clipper).
import ClipperLib from 'clipper-lib';

const S = 1000; // mm -> integer units
const toPath = pts => pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
const fromPath = p => p.map(q => [q.X / S, q.Y / S]);

function offset(paths, delta) {
  const co = new ClipperLib.ClipperOffset(2, 0.05 * S);
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out = new ClipperLib.Paths();
  co.Execute(out, delta * S);
  return out;
}

/** Outline of the whole dieline grown by `bleed` mm (one or more closed polygons). */
export function bleedOutline(pieces, bleed = 3) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(pieces.map(pc => toPath(pc.pts)), ClipperLib.PolyType.ptSubject, true);
  const union = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, union, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return offset(union, bleed).map(fromPath);
}

/** Safe area: each panel shrunk by `margin` mm (tiny flaps that vanish are skipped). */
export function safeAreas(pieces, margin = 3) {
  const out = [];
  for (const pc of pieces) {
    if (pc.kind === 'glue') continue;
    for (const p of offset([toPath(pc.pts)], -margin)) if (p.length >= 3) out.push(fromPath(p));
  }
  return out;
}
