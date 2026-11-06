// Fold presets and lid detection (pure, no DOM).

/**
 * Find the top lid: a hinge with a roughly horizontal axis whose panel has its own
 * flap (the tuck), choosing the highest one on the sheet. Returns { lid, tucks } or null.
 */
export function findLid(m) {
  const hasKids = new Set(m.hinges.map(h => h.parent));
  const cands = m.hinges.filter(h => hasKids.has(h.child) && Math.abs(h.dir.x) > 0.9);
  if (!cands.length) return null;
  const lid = cands.reduce((a, b) => (Math.max(b.a.y, b.b.y) > Math.max(a.a.y, a.b.y) ? b : a));
  return { lid, tucks: m.hinges.filter(h => h.parent === lid.child) };
}

export const PRESETS = ['flat', 'half', 'closed', 'lidOpen'];

/** Angles (degrees, indexed by hinge id) for a named preset. */
export function presetAngles(m, name) {
  const all = a => m.hinges.map(() => a);
  if (name === 'flat') return all(0);
  if (name === 'half') return all(45);
  const out = all(90);
  if (name === 'lidOpen') {
    const l = findLid(m);
    if (l) { out[l.lid.id] = -20; l.tucks.forEach(t => (out[t.id] = 20)); }
  }
  return out;
}

/** Lid angles while the lid opens and closes once over t = 0..1 (open at t = 0.5). */
export function lidSwing(t) {
  const k = Math.sin(Math.PI * t) ** 2;
  return { lid: 90 - 110 * k, tuck: 90 - 70 * k };
}
