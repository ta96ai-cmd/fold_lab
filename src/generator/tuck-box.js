// Backward-compatible wrapper: tuck-end boxes now come from the Dieline Maker styles.
import { STYLES, generate, validate } from './styles.js';
import { toEngineSegments } from './core.js';
import { toSVG } from './writers.js';

export const BOX_STYLES = { rte: { label: STYLES.rte.label }, ste: { label: STYLES.ste.label } };
export const DEFAULT_BOX = { style: 'rte', L: 60, W: 40, H: 120, t: 0.4, glue: 15, tuck: 15 };

export function validateBox(p) {
  return validate(p.style || 'rte', { ...DEFAULT_BOX, ...p });
}

/** Returns { segments (y-up, for the fold engine), svg (mm), width, height, outside }. */
export function generateTuckBox(params) {
  const p = { ...DEFAULT_BOX, ...params };
  const g = generate(p.style, p);
  return {
    svg: toSVG(g, { dims: false, labels: false, bleed: false, safe: false }),
    segments: toEngineSegments(g.dieline),
    width: g.dieline.bbox.w, height: g.dieline.bbox.h,
    outside: { L: p.L + p.t, W: p.W + p.t, H: p.H + p.t },
  };
}
