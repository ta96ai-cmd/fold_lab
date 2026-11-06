// Output sizes for still images and video.
export const IMAGE_SIZES = {
  '1080p': { w: 1920, h: 1080, label: '1080p (1920×1080)' },
  '4k': { w: 3840, h: 2160, label: '4K (3840×2160)' },
  square: { w: 2048, h: 2048, label: 'Square (2048×2048)' },
  vertical: { w: 1080, h: 1920, label: 'Vertical (1080×1920)' },
};
export const VIDEO_SIZES = {
  landscape: { w: 1920, h: 1080, label: 'Landscape 1080p' },
  vertical: { w: 1080, h: 1920, label: 'Vertical 1080×1920 (Reels)' },
  square: { w: 1080, h: 1080, label: 'Square 1080' },
};
/** Frame timestamps in microseconds for a clip. */
export function frameTimes(seconds, fps) {
  const n = Math.round(seconds * fps);
  return Array.from({ length: n }, (_, i) => ({ i, t: n > 1 ? i / (n - 1) : 0, us: Math.round(i * 1e6 / fps) }));
}
