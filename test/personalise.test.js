import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPrintPdf, printFileName, FINISHES } from '../src/personalise/compose.js';
import { maskFromRGBA, coloursFromRGBA, hasTransparency, effectiveDpi, fitInZone, logoWarnings } from '../src/personalise/logo-core.js';

// a 200 x 100 px logo: red disc on transparent background
function logoPng() {
  const png = new PNG({ width: 200, height: 100 });
  for (let y = 0; y < 100; y++) for (let x = 0; x < 200; x++) {
    const i = (y * 200 + x) * 4, inside = (x - 100) ** 2 + (y - 50) ** 2 < 45 ** 2;
    png.data.set(inside ? [200, 30, 40, 255] : [0, 0, 0, 0], i);
  }
  return { bytes: PNG.sync.write(png), rgba: png.data, w: 200, h: 100 };
}
async function templatePdf() {
  const d = await PDFDocument.create(), p = d.addPage([600, 400]);
  p.drawRectangle({ x: 50, y: 50, width: 500, height: 300, color: rgb(0.9, 0.7, 0.3) });
  p.drawRectangle({ x: 200, y: 150, width: 200, height: 100, color: rgb(1, 1, 0.9) }); // the "window"
  return d.save();
}

test('logo analysis: transparency, mask, colours, dpi, fit', () => {
  const L = logoPng();
  assert.ok(hasTransparency(L.rgba));
  const m = maskFromRGBA(L.rgba, L.w, L.h);
  assert.equal(m.bits.length, 25 * 100);
  assert.ok(Math.abs(m.ink - Math.PI * 45 * 45 / 20000) < 0.01);
  const c = coloursFromRGBA(L.rgba);
  assert.equal(c.length, 1); assert.equal(c[0].hex, '#C81E28');
  assert.equal(Math.round(effectiveDpi(1000, 25.4)), 1000);
  assert.deepEqual(fitInZone({ x: 0, y: 0, w: 100, h: 100 }, 2, 50), { x: 25, y: 37.5, w: 50, h: 25 });
  assert.ok(logoWarnings({ vector: false, dpi: 120, transparent: true, colours: c }).some(w => w.level === 'err'));
  assert.ok(!logoWarnings({ vector: true, dpi: 0, transparent: true, colours: [] }).some(w => w.level !== 'info'));
});

test('print PDF: artwork + one plate per finish + KLD + instructions, same size', async () => {
  const L = logoPng();
  const area = { x: 40, y: 40, w: 520, h: 320 }, zone = { x: 200, y: 150, w: 200, h: 100 };
  const { bytes, pages, logoBoxMm } = await buildPrintPdf({
    templateBytes: await templatePdf(), area, zone,
    logo: { kind: 'image', pngBytes: L.bytes, aspect: 2, mask: maskFromRGBA(L.rgba, L.w, L.h) },
    sizePct: 80, finishes: ['foilGold', 'spotUV'],
    kld: [[[50, 50], [550, 50], [550, 350], [50, 350], [50, 50]]],
    meta: { fileName: 'TEST.pdf', client: 'Acme', version: 2 },
  });
  assert.equal(pages, 5);
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  assert.equal(doc.numPages, 5);
  const sizes = [];
  for (let i = 1; i <= 5; i++) { const v = (await doc.getPage(i)).getViewport({ scale: 1 }); sizes.push(`${Math.round(v.width)}x${Math.round(v.height)}`); }
  assert.equal(new Set(sizes).size, 1, 'all pages register');
  // plate pages paint the logo as an image mask
  const opsPlate = await (await doc.getPage(2)).getOperatorList();
  assert.ok(opsPlate.fnArray.includes(pdfjs.OPS.paintImageMaskXObject));
  // logo box: 80% of a 200 x 100 pt zone, centred
  assert.ok(Math.abs(logoBoxMm.w - 160 / (72 / 25.4)) < 0.01 && Math.abs(logoBoxMm.h - 80 / (72 / 25.4)) < 0.01);
  const text = (await (await doc.getPage(5)).getTextContent()).items.map(i => i.str).join(' ');
  assert.match(text, /PRINT INSTRUCTIONS/); assert.match(text, /Gold foil/); assert.match(text, /Spot UV/); assert.match(text, /V2/);
});

test('single-colour logo uses CMYK', async () => {
  const L = logoPng();
  const { bytes } = await buildPrintPdf({
    templateBytes: await templatePdf(), area: { x: 0, y: 0, w: 600, h: 400 }, zone: { x: 200, y: 150, w: 200, h: 100 },
    logo: { kind: 'image', pngBytes: L.bytes, aspect: 2, mask: maskFromRGBA(L.rgba, L.w, L.h) },
    colour: { mode: 'single', cmyk: [0, 0.2, 0.6, 0.2], label: 'Gold' },
  });
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  const ol = await (await doc.getPage(1)).getOperatorList();
  assert.ok(ol.fnArray.includes(pdfjs.OPS.paintImageMaskXObject));
  assert.equal(doc.numPages, 3); // artwork, KLD, instructions
});

test('file names', () => {
  assert.equal(printFileName({ prefix: 'NO', date: new Date(2026, 9, 22), campaign: 'Diwali 2026', client: 'Kotak Mahindra', template: 'Gift box 5x5', design: 'Purple', version: 3 }),
    'NO_20261022_DIWALI-2026_KOTAK-MAHINDRA_GIFT-BOX-5X5-PURPLE_ARTWORK_V3.pdf');
  assert.ok(Object.values(FINISHES).every(f => f.spot && f.alt.length === 4));
});
