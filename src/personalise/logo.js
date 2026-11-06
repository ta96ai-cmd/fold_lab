// Browser side of the logo check: read PDF / SVG / PNG / JPG, measure it, render it.
import { loadPdfjs } from '../svg/parse-pdf.js';
import { coloursFromRGBA, hasTransparency, maskFromRGBA } from './logo-core.js';
import { mmPerUnit } from '../svg/parse-svg.js';

const ANALYSE_PX = 1000;

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
const rgbaOf = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const pngBytes = c => new Promise(r => c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'));

/** Load a logo file. Returns an object with facts for the report and render helpers. */
export async function loadLogo(file) {
  const name = file.name, lower = name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  let L;
  if (lower.endsWith('.pdf') || file.type === 'application/pdf' || lower.endsWith('.ai')) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
    const page = await doc.getPage(1), vp = page.getViewport({ scale: 1 });
    const render = async pxW => {
      const s = pxW / vp.width, v = page.getViewport({ scale: s }), c = canvasOf(v.width, v.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: v, background: 'rgba(0,0,0,0)' }).promise;
      return c;
    };
    L = { kind: 'pdf', type: 'Vector PDF — scales to any size', vector: true, pdfBytes: bytes, srcMm: { w: vp.width * 25.4 / 72, h: vp.height * 25.4 / 72 }, aspect: vp.width / vp.height, render };
  } else if (lower.endsWith('.svg') || file.type === 'image/svg+xml') {
    const text = new TextDecoder().decode(bytes);
    const svgEl = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    const vb = (svgEl.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let w = parseFloat(svgEl.getAttribute('width')) || vb[2] || 1000, h = parseFloat(svgEl.getAttribute('height')) || vb[3] || 1000;
    const k = mmPerUnit(svgEl.getAttribute('width'), w);
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    const img = new Image(); img.src = url; await img.decode();
    const render = async pxW => { const c = canvasOf(pxW, pxW * h / w); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; };
    L = { kind: 'image', type: 'SVG (vector) — scales to any size', vector: true, srcMm: { w: w * k, h: h * k }, aspect: w / h, render };
  } else {
    const bmp = await createImageBitmap(new Blob([bytes], { type: file.type || 'image/png' }));
    const render = async pxW => { const c = canvasOf(pxW, pxW * bmp.height / bmp.width); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height); return c; };
    L = { kind: 'image', type: `${lower.endsWith('.png') ? 'PNG' : lower.match(/\.jpe?g$/) ? 'JPEG' : 'Image'} — ${bmp.width} × ${bmp.height} px (raster)`, vector: false, px: { w: bmp.width, h: bmp.height }, aspect: bmp.width / bmp.height, render };
  }
  const preview = await L.render(ANALYSE_PX);
  const data = rgbaOf(preview);
  Object.assign(L, { name, preview, transparent: hasTransparency(data), colours: coloursFromRGBA(data) });
  /** Print assets for a logo printed `printMm` wide: ink mask (1200 dpi) and, for non-PDF, a PNG (≥ 600 dpi). */
  L.printAssets = async printMm => {
    const inch = printMm / 25.4;
    const maskPx = Math.min(5000, Math.max(300, Math.round(inch * 1200)));
    const mc = await L.render(maskPx);
    const mask = maskFromRGBA(rgbaOf(mc), mc.width, mc.height, { whiteIsBackground: !L.transparent });
    if (L.kind === 'pdf') return { mask };
    const pngPx = L.vector ? Math.min(5000, Math.round(inch * 600)) : L.px.w;   // never upscale rasters
    return { mask, pngBytes: await pngBytes(await L.render(pngPx)) };
  };
  return L;
}
