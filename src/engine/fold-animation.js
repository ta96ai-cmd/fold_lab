// Staggered fold animation: inner hinges move first when folding, outer first when unfolding.

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Angles for every hinge at progress t (0..1). */
export function anglesAt(hinges, from, target, t, folding) {
  const maxD = Math.max(1, ...hinges.map(h => h.depth));
  const out = from.slice();
  for (const h of hinges) {
    const lvl = folding ? h.depth - 1 : maxD - h.depth;
    const start = maxD > 1 ? (lvl / (maxD - 1)) * 0.45 : 0;
    const k = ease(Math.min(1, Math.max(0, (t - start) / 0.55)));
    const tg = Array.isArray(target) ? target[h.id] : target;
    out[h.id] = from[h.id] + (tg - from[h.id]) * k;
  }
  return out;
}
