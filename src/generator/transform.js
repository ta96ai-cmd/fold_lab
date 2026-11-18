// Turn and mirror a generated dieline (Packmage-style "Transformation"): turn left / right 90°,
// mirror left-right / top-bottom. Works on a copy; the result starts at 0,0 again.
//
// The transform is a 2x2 integer matrix [a, b, c, d] (x' = a x + b y, y' = c x + d y) in screen
// coordinates (y down), built up step by step so each button acts on what is on screen now.
export const IDENTITY = [1, 0, 0, 1];
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3]].map(v => v + 0);   // + 0 turns -0 into 0
export const STEPS = {
  right: [0, -1, 1, 0],     // turn right (clockwise on screen): (1,0) -> (0,1)
  left: [0, 1, -1, 0],      // turn left
  mirrorX: [-1, 0, 0, 1],   // mirror left-right
  mirrorY: [1, 0, 0, -1],   // mirror top-bottom
};
/** Apply one more step to the current transform. */
export const step = (m, name) => mul(STEPS[name], m);
export const isIdentity = m => m.every((v, i) => v === IDENTITY[i]);
/** Describe a transform for people: "turned right, mirrored". */
export function describe(m) {
  if (isIdentity(m)) return 'as drawn';
  const det = m[0] * m[3] - m[1] * m[2], mirrored = det < 0;
  const n = mirrored ? mul(STEPS.mirrorX, m) : m;          // remove the mirror to read the turn
  const turn = { '1,0,0,1': '', '0,-1,1,0': 'turned right', '0,1,-1,0': 'turned left', '-1,0,0,-1': 'turned 180°' }[n.join(',')] || '';
  return [turn, mirrored ? 'mirrored' : ''].filter(Boolean).join(', ');
}

const SIDES = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const sideOf = ([x, y]) => Object.keys(SIDES).find(k => SIDES[k][0] === x && SIDES[k][1] === y);

export function transformGen(gen, m) {
  if (!gen || isIdentity(m)) return gen;
  const T = ([x, y]) => [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
  const pieces = gen.dieline.pieces.map(pc => ({ ...pc, pts: pc.pts.map(T) }));
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const pc of pieces) for (const [x, y] of pc.pts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
  const S = q => { const [x, y] = T(q); return [x - minx, y - miny]; };
  pieces.forEach(pc => (pc.pts = pc.pts.map(([x, y]) => [x - minx, y - miny])));
  const w = maxx - minx, h = maxy - miny;
  return {
    ...gen,
    dieline: {
      ...gen.dieline, pieces,
      cuts: gen.dieline.cuts.map(e => ({ ...e, a: S(e.a), b: S(e.b) })),
      creases: gen.dieline.creases.map(e => ({ ...e, a: S(e.a), b: S(e.b) })),
      bbox: { minx: 0, miny: 0, maxx: w, maxy: h, w, h },
    },
    dims: gen.dims.map(d => { const { at, ...rest } = d; return { ...rest, a: S(d.a), b: S(d.b), side: sideOf(T(SIDES[d.side] || SIDES.top)) }; }),
    labels: gen.labels.map(l => ({ ...l, at: S(l.at) })),
    hints: { ...gen.hints, root: S(gen.hints.root) },
    transform: m,
  };
}
