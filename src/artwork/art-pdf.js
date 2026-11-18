// Print PDF for a dieline with artwork (pdf-lib; runs in the browser and in node for tests).
//   page 1  Outside print: artwork clipped to the bleed, die line on top (CutContour / Crease spot colours)
//   page 2  Inside print (only if there is inside art): as seen from the back of the sheet, die line mirrored
//   last    Die line only (for the die-maker)
// Vector PDF artwork stays vector; PNG / JPG are embedded as they are.
import { PDFDocument, PDFNumber, PDFOperator } from 'pdf-lib';
import { MM2PT, pdfAffine } from './art-core.js';

const op = (name, args = []) => PDFOperator.of(name, args.map(a => (typeof a === 'number' ? PDFNumber.of(a) : a)));
const n = v => +v.toFixed(4);

/**
 * opts: {
 *   page: { x, y, w, h }      dieline page box in mm (same as the dieline PDF's page)
 *   bleed: [[x, y], ...][]    clip polygons in mm (dieline coords); empty = no clipping
 *   dielinePdf: Uint8Array    the plain dieline PDF (same page box)
 *   sides: { out: [layer], in: [layer] }   layers in drawing order (first = bottom)
 *   asset: async layer => { kind: 'pdf' | 'png' | 'jpg', bytes }
 *   title: string
 * }
 */
export async function buildArtPdf({ page, bleed = [], dielinePdf, sides, asset, title = 'REA Fold Lab artwork' }) {
  const doc = await PDFDocument.create();
  doc.setTitle(title); doc.setCreator('REA Fold Lab'); doc.setProducer('REA Fold Lab');
  const W = page.w * MM2PT, H = page.h * MM2PT;
  const [die] = await doc.embedPdf(dielinePdf, [0]);
  const toPt = ([x, y]) => [(x - page.x) * MM2PT, (page.y + page.h - y) * MM2PT];
  const cache = new Map();
  const embed = async L => {
    if (cache.has(L.id)) return cache.get(L.id);
    const a = await asset(L);
    const e = a.kind === 'pdf' ? { pdf: (await doc.embedPdf(a.bytes, [0]))[0] } : { img: a.kind === 'jpg' ? await doc.embedJpg(a.bytes) : await doc.embedPng(a.bytes) };
    cache.set(L.id, e); return e;
  };
  const clip = (pg, polys, mirror) => {
    if (!polys.length) return;
    const ops = [];
    for (const poly of polys) poly.forEach((q, i) => {
      let [x, y] = toPt(q); if (mirror) x = W - x;
      ops.push(op(i ? 'l' : 'm', [n(x), n(y)]));
    }), ops.push(op('h'));
    pg.pushOperators(...ops, op('W'), op('n'));
  };
  async function artPage(layers, mirror) {
    const pg = doc.addPage([W, H]);
    pg.pushOperators(op('q')); clip(pg, bleed, mirror);
    for (const L of layers) {
      if (L.visible === false || !(L.op > 0)) continue;
      const e = await embed(L), m = pdfAffine(L, page);
      pg.pushOperators(op('q'), op('cm', m.map(n)));
      if (e.pdf) pg.drawPage(e.pdf, { x: 0, y: 0, width: 1, height: 1, opacity: L.op });
      else pg.drawImage(e.img, { x: 0, y: 0, width: 1, height: 1, opacity: L.op });
      pg.pushOperators(op('Q'));
    }
    pg.pushOperators(op('Q'));
    if (mirror) { pg.pushOperators(op('q'), op('cm', [-1, 0, 0, 1, n(W), 0])); pg.drawPage(die, { x: 0, y: 0 }); pg.pushOperators(op('Q')); }
    else pg.drawPage(die, { x: 0, y: 0 });
    return pg;
  }
  await artPage(sides.out || [], false);
  if ((sides.in || []).some(L => L.visible !== false)) await artPage(sides.in, true);
  doc.addPage([W, H]).drawPage(die, { x: 0, y: 0 });
  return doc.save();
}
