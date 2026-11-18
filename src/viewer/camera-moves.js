// Camera moves: pure functions of progress t (0..1) and framing radius R.
// The box front faces +z and its top faces +y. All moves start and end on a good angle.

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const around = (a, y, r) => [Math.sin(a) * r, y, Math.cos(a) * r];

export const CAMERA_MOVES = {
  orbit: {
    label: 'Showcase orbit',
    at: (t, R) => around(0.6 + 2 * Math.PI * t, R * 0.9, R * 2.7),
  },
  cornerTour: {
    label: 'Corner tour',
    // glide corner to corner with a short pause on each
    at(t, R) {
      const seg = Math.min(3.999, t * 4), i = Math.floor(seg), f = seg - i;
      const k = ease(Math.min(1, Math.max(0, (f - 0.15) / 0.7)));
      return around(Math.PI / 4 + (i + k) * Math.PI / 2, R * 0.75, R * 2.6);
    },
  },
  fullInspection: {
    label: 'Full inspection',
    // one turn while sweeping from above to below and back
    at: (t, R) => around(0.5 + 2 * Math.PI * t, R * 1.5 * Math.cos(2 * Math.PI * t), R * 2.6),
  },
  turntable: {
    label: 'Turntable',
    at: (t, R) => around(2 * Math.PI * t, R * 0.3, R * 2.8),
  },
  hero: {
    label: 'Hero reveal',
    at(t, R) {
      const k = ease(t);
      const p = lerp([R * 0.3, -R * 0.55, R * 1.7], [R * 1.7, R * 0.95, R * 2.2], k);
      const a = (1 - k) * 0.35;
      return [p[0] * Math.cos(a) - p[2] * Math.sin(a), p[1], p[0] * Math.sin(a) + p[2] * Math.cos(a)];
    },
  },
  topDown: {
    label: 'Top-down reveal',
    at: (t, R) => lerp([R * 0.02, R * 3.1, R * 0.25], [R * 1.5, R * 0.9, R * 2.4], ease(t)),
  },
  lowArc: {
    label: 'Low-angle arc',
    at: (t, R) => around(-0.95 + 1.9 * ease(t), -R * 0.5, R * 2.5),
  },
  pendulum: {
    label: 'Pendulum sway',
    at: (t, R) => around(0.6 * Math.sin(2 * Math.PI * t), R * 0.7, R * 2.7),
  },
  drift: {
    label: 'Floating drift',
    at: (t, R) => around(0.5 + 0.3 * Math.sin(2 * Math.PI * t), R * (0.6 + 0.3 * Math.sin(4 * Math.PI * t)), R * (2.6 + 0.2 * Math.cos(2 * Math.PI * t))),
  },
  reverseOrbit: {
    label: 'Reverse orbit',
    at: (t, R) => around(0.6 - 2 * Math.PI * t, R * 0.9, R * 2.7),
  },
  quickSpin: {
    label: 'Quick double spin',
    // two fast turns that ease in and out (good for short social clips)
    at: (t, R) => around(0.6 + 4 * Math.PI * ease(t), R * 0.8, R * 2.7),
  },
  spiralRise: {
    label: 'Spiral rise',
    // one turn, climbing from below the box to above it
    at: (t, R) => around(0.3 + 2 * Math.PI * t, R * (-0.5 + 2 * ease(t)), R * 2.7),
  },
  figure8: {
    label: 'Figure eight',
    at: (t, R) => around(0.5 + 0.7 * Math.sin(2 * Math.PI * t), R * (0.7 + 0.5 * Math.sin(4 * Math.PI * t)), R * 2.7),
  },
  pushIn: {
    label: 'Slow push-in',
    // straight dolly toward the front corner
    at(t, R) { const d = 3.6 - 1.7 * ease(t); return around(0.55, R * 0.35 * d, R * d); },
  },
  pullOut: {
    label: 'Pull-out reveal',
    at(t, R) { const d = 1.9 + 1.7 * ease(t); return around(0.55, R * 0.35 * d, R * d); },
  },
  craneDown: {
    label: 'Crane down',
    // from high above the front down to eye level
    at: (t, R) => lerp([R * 0.8, R * 3.0, R * 1.6], [R * 0.8, R * 0.3, R * 2.6], ease(t)),
  },
  slide: {
    label: 'Side to side',
    // camera slides along the front, like a slider rig
    at: (t, R) => [R * (-1.4 + 2.8 * ease(t)), R * 0.6, R * 2.5],
  },
  unboxing: {
    label: 'Unboxing view',
    // from the front up over the lid, to look into the open box
    at: (t, R) => lerp([0, R * 0.2, R * 2.8], [R * 0.5, R * 2.2, R * 1.6], ease(t)),
  },
  cornerCloseUp: {
    label: 'Corner close-up',
    // move in on the front corner and back out again
    at: (t, R) => around(Math.PI / 4, R * 0.8, R * (2.6 - 1.0 * Math.sin(Math.PI * t))),
  },
};
