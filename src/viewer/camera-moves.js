// Camera moves: pure functions of progress t (0..1) and box radius R.
// The box front faces +z and its top faces +y.

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

export const CAMERA_MOVES = {
  orbit: {
    label: 'Showcase orbit',
    at(t, R) {
      const a = 0.6 + 2 * Math.PI * t;
      return [Math.sin(a) * R * 2.7, R * 0.9, Math.cos(a) * R * 2.7];
    },
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
    at(t, R) {
      const k = ease(t);
      return lerp([R * 0.02, R * 3.1, R * 0.25], [R * 1.5, R * 0.9, R * 2.4], k);
    },
  },
};
