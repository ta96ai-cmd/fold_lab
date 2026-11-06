// Reads stroked vector lines from page 1 of a PDF (or a PDF-compatible .ai file) with pdf.js,
// and converts them to a clean dieline SVG (stroke colours kept, so cut/crease mapping works).
// Fills, text and images are ignored: only stroked paths become lines.

let pdfjsPromise = null;
async function loadPdfjs() {
  // Loaded only when a PDF is opened. Running the worker on the main thread keeps
  // everything inside one HTML file (no separate worker file to host).
  if (!pdfjsPromise) pdfjsPromise = (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs')]);
    globalThis.pdfjsWorker = worker;
    return pdfjs;
  })();
  return pdfjsPromise;
}

// m2 applied first, then m1 (PDF matrices [a b c d e f])
const mul = (m1, m2) => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function toRGB(args) {
  const a = args && args[0];
  if (typeof a === 'string') { const h = a.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  const v = Array.from(args || [0, 0, 0]).slice(0, 3).map(Number);
  return v.every(x => x <= 1) && v.some(x => x > 0 && x < 1) ? v.map(x => Math.round(x * 255)) : v.map(x => Math.round(x));
}

/**
 * Walk a pdf.js operator list. Returns stroked polylines in page coordinates (points, y down)
 * as [{ rgb, dashed, polys: [[[x, y], ...]] }].
 */
export function strokesFromOperatorList(OPS, ol, viewTransform) {
  const out = [];
  let st = { ctm: [1, 0, 0, 1, 0, 0], rgb: [0, 0, 0], dashed: false };
  const stack = [];
  let subs = [], sub = null, cur = [0, 0], start = [0, 0];
  const pt = (x, y) => apply(viewTransform, ...apply(st.ctm, x, y));
  const cubic = (p0, p1, p2, p3, n = 16) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      sub.push(pt(u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                  u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]));
    }
  };
  const ensure = () => { if (!sub) { sub = [pt(...cur)]; subs.push(sub); } };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], args = ol.argsArray[i];
    switch (fn) {
      case OPS.save: stack.push({ ...st }); break;
      case OPS.restore: if (stack.length) st = stack.pop(); break;
      case OPS.transform: st = { ...st, ctm: mul(st.ctm, args) }; break;
      case OPS.paintFormXObjectBegin: stack.push({ ...st }); if (args[0]) st = { ...st, ctm: mul(st.ctm, args[0]) }; break;
      case OPS.paintFormXObjectEnd: if (stack.length) st = stack.pop(); break;
      case OPS.setStrokeRGBColor: st = { ...st, rgb: toRGB(args) }; break;
      case OPS.setStrokeGray: { const g = Math.round(Number(args[0]) * (Number(args[0]) <= 1 ? 255 : 1)); st = { ...st, rgb: [g, g, g] }; break; }
      case OPS.setDash: st = { ...st, dashed: !!(args[0] && args[0].length && args[0].some(v => v > 0)) }; break;
      case OPS.setGState:
        for (const [k, v] of args[0] || []) if (k === 'D' && v) st = { ...st, dashed: !!(v[0] && v[0].length) };
        break;
      case OPS.constructPath: {
        const [ops, c] = args; let j = 0;
        for (const op of ops) {
          if (op === OPS.moveTo) { cur = [c[j], c[j + 1]]; start = cur.slice(); j += 2; sub = [pt(...cur)]; subs.push(sub); }
          else if (op === OPS.lineTo) { ensure(); cur = [c[j], c[j + 1]]; j += 2; sub.push(pt(...cur)); }
          else if (op === OPS.curveTo) { ensure(); const p1 = [c[j], c[j + 1]], p2 = [c[j + 2], c[j + 3]], p3 = [c[j + 4], c[j + 5]]; j += 6; cubic(cur, p1, p2, p3); cur = p3; }
          else if (op === OPS.curveTo2) { ensure(); const p2 = [c[j], c[j + 1]], p3 = [c[j + 2], c[j + 3]]; j += 4; cubic(cur, cur, p2, p3); cur = p3; }
          else if (op === OPS.curveTo3) { ensure(); const p1 = [c[j], c[j + 1]], p3 = [c[j + 2], c[j + 3]]; j += 4; cubic(cur, p1, p3, p3); cur = p3; }
          else if (op === OPS.closePath) { if (sub) { sub.push(pt(...start)); } cur = start.slice(); sub = null; }
          else if (op === OPS.rectangle) {
            const [x, y, w, h] = [c[j], c[j + 1], c[j + 2], c[j + 3]]; j += 4;
            subs.push([pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h), pt(x, y)]);
            cur = [x, y]; start = cur.slice(); sub = null;
          }
        }
        break;
      }
      case OPS.stroke: case OPS.closeStroke:
      case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke: {
        const closing = fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
        const polys = subs.filter(p => p.length > 1 || closing).map(p => (closing && p.length > 1 ? [...p, p[0]] : p)).filter(p => p.length > 1);
        if (polys.length) out.push({ rgb: st.rgb, dashed: st.dashed, polys });
        subs = []; sub = null;
        break;
      }
      case OPS.fill: case OPS.eoFill: case OPS.endPath: case OPS.clip: case OPS.eoClip:
        if (fn !== OPS.clip && fn !== OPS.eoClip) { subs = []; sub = null; }
        break;
      default: break;
    }
  }
  return out;
}

const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Convert stroke items (points, y down) to an SVG string in mm. */
export function strokesToSVG(strokes, w, h, note = '') {
  const f = v => Math.round(v * 1000) / 1000;
  const mm = 25.4 / 72;
  const lines = strokes.flatMap(s => s.polys.map(p =>
    `<polyline fill="none" stroke="${hex(s.rgb)}" stroke-width="0.5"${s.dashed ? ' stroke-dasharray="3 2"' : ''} points="${p.map(q => `${f(q[0])},${f(q[1])}`).join(' ')}"/>`));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w * mm)}mm" height="${f(h * mm)}mm" viewBox="0 0 ${f(w)} ${f(h)}">`,
    note ? `<!-- ${note.replace(/--/g, '-')} -->` : '',
    ...lines, '</svg>',
  ].join('\n');
}

/** PDF / AI file bytes -> { svg, strokes, pages } (page 1 only). */
export async function pdfToDielineSVG(bytes, name = 'file.pdf') {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  } catch (e) {
    throw new Error(`${name} couldn't be read as a PDF. If it's an Illustrator file, save it with "Create PDF Compatible File" on, or export as PDF or SVG.`);
  }
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const ol = await page.getOperatorList();
  const strokes = strokesFromOperatorList(pdfjs.OPS, ol, vp.transform);
  if (!strokes.length) throw new Error(`No stroked lines found on page 1 of ${name}. The dieline may be a filled shape or an image; export it with the cut and crease lines as strokes.`);
  return { svg: strokesToSVG(strokes, vp.width, vp.height, `Converted from ${name} (page 1 of ${doc.numPages}) by REA Fold Lab`), strokes, pages: doc.numPages };
}
