// Print-ready PDF for a personalised template (pdf-lib, pure JS: browser and Node).
//
// Pages (all the same size, so they register):
//   1. Artwork: the template cropped to the design area, client logo placed in the logo zone
//   2… Finish plates (as per order): the logo shape in 100 % of a named spot colour
//   n-1. KLD: the template's line drawing in the CutContour spot colour
//   n. Print instructions
// Every page has a slug strip at the bottom with the file name and page role.
import { PDFDocument, PDFName, PDFNumber, PDFOperator, StandardFonts, rgb } from 'pdf-lib';
import { fitInZone } from './logo-core.js';

const MM = 72 / 25.4, SLUG = 12 * MM;

export const FINISHES = {
  foilGold: { name: 'Gold foil', spot: 'Foil_Gold', alt: [0, 0.2, 0.6, 0.2] },
  foilSilver: { name: 'Silver foil', spot: 'Foil_Silver', alt: [0, 0, 0, 0.3] },
  foilRose: { name: 'Rose gold foil', spot: 'Foil_RoseGold', alt: [0, 0.35, 0.35, 0.1] },
  spotUV: { name: 'Spot UV', spot: 'Spot_UV', alt: [0.3, 0, 0, 0] },
  emboss: { name: 'Emboss', spot: 'Emboss', alt: [0, 0.5, 0, 0] },
  deboss: { name: 'Deboss', spot: 'Deboss', alt: [0.5, 0, 0.5, 0] },
};

// pdf-lib only serialises operator arguments that are its own objects (numbers must be PDFNumber)
const op = (name, args = []) => PDFOperator.of(name, args.map(a => (typeof a === 'number' ? PDFNumber.of(a) : a)));
const n = v => Math.round(v * 1000) / 1000;
const ascii = s => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '');

function addResource(page, category, key, ref) {
  const { Resources } = page.node.normalizedEntries();
  let dict = Resources.lookup(PDFName.of(category));
  if (!dict) { dict = page.doc.context.obj({}); Resources.set(PDFName.of(category), dict); }
  dict.set(PDFName.of(key), ref);
}

function separation(doc, spot, alt) {
  const ctx = doc.context;
  const fn = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: alt, N: 1 }));
  return ctx.register(ctx.obj([PDFName.of('Separation'), PDFName.of(spot), PDFName.of('DeviceCMYK'), fn]));
}

function maskXObject(doc, mask) {
  const ctx = doc.context;
  return ctx.register(ctx.flateStream(mask.bits, {
    Type: 'XObject', Subtype: 'Image', Width: mask.w, Height: mask.h,
    ImageMask: true, BitsPerComponent: 1, Decode: [1, 0], Interpolate: true,
  }));
}

/** Fill the logo mask at box (PDF coords) with the current fill colour space setup. */
function paintMask(page, maskName, box, colourOps) {
  page.pushOperators(op('q'), ...colourOps, op('cm', [n(box.w), 0, 0, n(box.h), n(box.x), n(box.y)]), op('Do', [PDFName.of(maskName)]), op('Q'));
}

/**
 * opts:
 *  templateBytes, pageIndex
 *  area, zone: { x, y, w, h } in points, measured from the template page's top-left (y down)
 *  logo: { kind: 'pdf' | 'image', pdfBytes?, pngBytes?, aspect, mask: { w, h, bits } }
 *  sizePct, colour: { mode: 'keep' | 'single', cmyk: [c, m, y, k] (0..1), label }
 *  finishes: keys of FINISHES
 *  kld: polylines [[ [x, y], … ]] in template page points (y down)
 *  meta: { fileName, client, campaign, template, design, version, date, quantity, notes, logoReport: [[label, value]] }
 */
export async function buildPrintPdf(opts) {
  const { templateBytes, pageIndex = 0, area, zone, logo, sizePct = 100, colour = { mode: 'keep' }, finishes = [], kld = [], meta = {} } = opts;
  const doc = await PDFDocument.create();
  doc.setTitle(ascii(meta.fileName || 'Print file')); doc.setProducer('REA Fold Lab'); doc.setCreator('REA Fold Lab Personalise');
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [tpl] = await doc.embedPdf(templateBytes, [pageIndex]);
  const W = area.w, H = area.h + SLUG;
  // area-relative (y down) -> page coords (y up, above the slug)
  const P = (u, v) => [u, SLUG + area.h - v];
  const zoneRel = { x: zone.x - area.x, y: zone.y - area.y, w: zone.w, h: zone.h };
  const box = fitInZone(zoneRel, logo.aspect, sizePct);
  const pdfBox = { x: box.x, y: SLUG + area.h - box.y - box.h, w: box.w, h: box.h };

  const roles = ['Artwork (CMYK)', ...finishes.map(k => `${FINISHES[k].name} plate`), 'KLD (key line / die)', 'Print instructions'];
  const total = roles.length;
  const slug = (page, i, extra = '') => {
    page.drawRectangle({ x: 0, y: 0, width: W, height: SLUG, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: 0, y: SLUG }, end: { x: W, y: SLUG }, thickness: 0.3, color: rgb(0.6, 0.6, 0.6) });
    page.drawText(ascii(`${meta.fileName || ''}   |   Page ${i + 1}/${total}: ${roles[i]}${extra ? '   |   ' + extra : ''}`), { x: 6 * MM, y: 4.5 * MM, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
  };
  const clipToArea = page => page.pushOperators(op('re', [0, n(SLUG), n(W), n(area.h)]), op('W'), op('n'));
  let mask = null;
  const maskRef = () => (mask ||= maskXObject(doc, logo.mask));

  // 1. artwork
  {
    const page = doc.addPage([W, H]);
    page.pushOperators(op('q')); clipToArea(page);
    page.drawPage(tpl, { x: -area.x, y: SLUG + area.h - (tpl.height - area.y) });
    if (colour.mode === 'single') {
      addResource(page, 'XObject', 'Logo', maskRef());
      const [c, m, y, k] = colour.cmyk;
      paintMask(page, 'Logo', pdfBox, [op('k', [c, m, y, k])]);
    } else if (logo.kind === 'pdf') {
      const [lp] = await doc.embedPdf(logo.pdfBytes, [0]);
      page.drawPage(lp, { x: pdfBox.x, y: pdfBox.y, width: pdfBox.w, height: pdfBox.h });
    } else {
      const img = await doc.embedPng(logo.pngBytes);
      page.drawImage(img, { x: pdfBox.x, y: pdfBox.y, width: pdfBox.w, height: pdfBox.h });
    }
    page.pushOperators(op('Q'));
    slug(page, 0, colour.mode === 'single' ? `Logo single colour ${colour.label || ''} CMYK ${colour.cmyk.map(v => Math.round(v * 100)).join('/')}` : 'Logo in its own colours');
  }

  // 2. finish plates
  finishes.forEach((key, i) => {
    const f = FINISHES[key];
    const page = doc.addPage([W, H]);
    addResource(page, 'XObject', 'Logo', maskRef());
    addResource(page, 'ColorSpace', 'Spot', separation(doc, f.spot, f.alt));
    paintMask(page, 'Logo', pdfBox, [op('cs', [PDFName.of('Spot')]), op('scn', [1])]);
    // registration: the piece outline in the same spot at hairline, so plates align with artwork
    page.pushOperators(op('q'), op('CS', [PDFName.of('Spot')]), op('SCN', [1]), op('w', [0.25]), op('re', [0, n(SLUG), n(W), n(area.h)]), op('S'), op('Q'));
    slug(page, 1 + i, `Spot colour "${f.spot}" 100%`);
  });

  // KLD
  {
    const page = doc.addPage([W, H]);
    addResource(page, 'ColorSpace', 'Kld', separation(doc, 'CutContour', [0, 1, 0, 0]));
    const ops = [op('q'), op('CS', [PDFName.of('Kld')]), op('SCN', [1]), op('w', [0.5]), op('J', [1]), op('j', [1])];
    for (const pl of kld) {
      if (pl.length < 2) continue;
      const pts = pl.map(([x, y]) => P(x - area.x, y - area.y));
      ops.push(op('m', pts[0].map(n)), ...pts.slice(1).map(q => op('l', q.map(n))), op('S'));
    }
    ops.push(op('Q'));
    page.pushOperators(...ops);
    slug(page, total - 2, `Spot colour "CutContour" · ${kld.length} line(s) from the template`);
  }

  // print instructions
  {
    const page = doc.addPage([W, H]);
    const size = Math.max(8, Math.min(14, H / 45)), lh = size * 1.55, x0 = 14 * MM;
    let y = H - 14 * MM;
    const line = (txt, f = font, s = size, c = rgb(0.1, 0.1, 0.1)) => { page.drawText(ascii(txt), { x: x0, y, size: s, font: f, color: c }); y -= lh * (s / size); };
    const kv = (k, v) => { page.drawText(ascii(k), { x: x0, y, size, font: bold, color: rgb(0.2, 0.2, 0.2) }); page.drawText(ascii(v), { x: x0 + 52 * MM, y, size, font }); y -= lh; };
    line('PRINT INSTRUCTIONS', bold, size * 1.5); y -= lh * 0.3;
    kv('File', meta.fileName || '');
    kv('Client', meta.client || ''); kv('Campaign', meta.campaign || ''); kv('Template / design', `${meta.template || ''} / ${meta.design || ''}`);
    kv('Piece size (this file)', `${(area.w / MM).toFixed(1)} x ${(area.h / MM).toFixed(1)} mm (artwork area, slug below not printed)`);
    kv('Logo printed at', `${(box.w / MM).toFixed(1)} x ${(box.h / MM).toFixed(1)} mm, ${sizePct}% of the logo zone`);
    for (const [k, v] of meta.logoReport || []) kv(k, v);
    kv('Logo colour', colour.mode === 'single' ? `Single colour ${colour.label || ''} CMYK ${colour.cmyk.map(v => Math.round(v * 100)).join(' / ')}` : 'Client logo colours (convert RGB to CMYK in RIP)');
    kv('Finishes', finishes.length ? finishes.map(k => `${FINISHES[k].name} (spot "${FINISHES[k].spot}")`).join(', ') : 'None');
    kv('Quantity', meta.quantity ? String(meta.quantity) : '-');
    kv('Version / date', `V${meta.version || 1}  ·  ${meta.date || ''}`);
    y -= lh * 0.4; line('Pages in this file', bold);
    roles.forEach((r, i) => line(`  ${i + 1}. ${r}`));
    y -= lh * 0.4; line('Notes', bold);
    line('  All pages share the same size and position: plates register with the artwork.');
    line('  Plates are 100% of their spot colour; set them to overprint / output as separate plates.');
    line('  The slug strip at the bottom of each page is for reference only, do not print.');
    if (meta.notes) line(`  ${meta.notes}`);
    slug(page, total - 1);
  }
  return { bytes: await doc.save(), logoBoxMm: { x: box.x / MM, y: box.y / MM, w: box.w / MM, h: box.h / MM }, pages: total };
}

/** BRAND_YYYYMMDD_CAMPAIGN_CLIENT_TEMPLATE-DESIGN_ARTWORK_Vn.pdf */
export function printFileName({ prefix = 'NO', date = new Date(), campaign = '', client = '', template = '', design = '', version = 1 }) {
  const clean = s => ascii(s).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  const d = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return [clean(prefix), d, clean(campaign), clean(client), `${clean(template)}-${clean(design)}`, 'ARTWORK', `V${version}`].filter(Boolean).join('_') + '.pdf';
}
