// Logo analysis helpers (pure JS: work on RGBA pixel arrays, so they run in the browser and in tests).

const isWhite = (r, g, b) => r > 242 && g > 242 && b > 242;

/** True if any pixel is noticeably transparent. */
export function hasTransparency(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true;
  return false;
}

/**
 * Ink mask: 1 where the logo prints. Transparent pixels never print; if the logo has no
 * transparency (e.g. a JPG on white), near-white pixels count as background too.
 * Returns { w, h, bits } with rows packed MSB-first (PDF 1-bit image layout), and the ink share.
 */
export function maskFromRGBA(rgba, w, h, { whiteIsBackground = !hasTransparency(rgba) } = {}) {
  const rowBytes = Math.ceil(w / 8), bits = new Uint8Array(rowBytes * h);
  let ink = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = rgba[i + 3];
    const on = a >= 128 && !(whiteIsBackground && isWhite(rgba[i], rgba[i + 1], rgba[i + 2]));
    if (on) { bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7); ink++; }
  }
  return { w, h, bits, ink: ink / (w * h) };
}

/** Main colours of the logo (ignoring background), largest share first. */
export function coloursFromRGBA(rgba, { max = 6, minShare = 0.02, whiteIsBackground = !hasTransparency(rgba) } = {}) {
  const counts = new Map(); let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (whiteIsBackground && isWhite(r, g, b)) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);   // 4096 buckets
    const c = counts.get(key) || [0, 0, 0, 0];
    c[0]++; c[1] += r; c[2] += g; c[3] += b; counts.set(key, c); total++;
  }
  if (!total) return [];
  const list = [...counts.values()].sort((a, b) => b[0] - a[0]);
  const out = [];
  for (const [n, r, g, b] of list) {
    const rgb = [r / n, g / n, b / n].map(Math.round);
    const near = out.find(o => Math.hypot(o.rgb[0] - rgb[0], o.rgb[1] - rgb[1], o.rgb[2] - rgb[2]) < 40);
    if (near) { near.share += n / total; continue; }
    out.push({ rgb, share: n / total });
  }
  return out.filter(c => c.share >= minShare).sort((a, b) => b.share - a.share).slice(0, max)
    .map(c => ({ ...c, hex: '#' + c.rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() }));
}

/** Effective print resolution of a raster logo of `px` pixels printed `mm` wide. */
export const effectiveDpi = (px, mm) => (mm > 0 ? px / (mm / 25.4) : 0);

/** Fit a logo of aspect (w/h) into a zone, scaled to pct %, centred. Units follow the zone. */
export function fitInZone(zone, aspect, pct = 100) {
  let w = Math.min(zone.w, zone.h * aspect) * pct / 100;
  let h = w / aspect;
  return { x: zone.x + (zone.w - w) / 2, y: zone.y + (zone.h - h) / 2, w, h };
}

/** Plain-language checks for the logo report. */
export function logoWarnings({ vector, dpi, transparent, colours }) {
  const w = [];
  if (!vector && dpi < 150) w.push({ level: 'err', text: `Only ${Math.round(dpi)} dpi at this size: it will print blurry. Ask the client for a vector PDF/SVG or a much larger image.` });
  else if (!vector && dpi < 300) w.push({ level: 'warn', text: `${Math.round(dpi)} dpi at this size. 300 dpi or more is recommended; a vector PDF/SVG is best.` });
  if (!vector && !transparent) w.push({ level: 'warn', text: 'No transparent background: near-white areas are treated as background for foil/UV plates and single-colour printing.' });
  if (colours && colours.length) w.push({ level: 'info', text: 'Screen colours are RGB; print is CMYK. Bright blues, greens and oranges can print duller. Use “Single colour” with a CMYK value for exact brand colours.' });
  return w;
}
