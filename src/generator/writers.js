// Dieline file writers: SVG, PDF (spot colours + layers) and DXF (R12, layers). All in mm.
import { chain } from './core.js';
import { bleedOutline, safeAreas } from './guides.js';

export const COLORS = { cut: '#FF00FF', crease: '#00FFFF', bleed: '#00A651', safe: '#F7941D', dims: '#7A7A7A', labels: '#555555' };
const r3 = v => Math.round(v * 1000) / 1000;
const MM_PER_IN = 25.4;

/** Everything a writer needs: lines, guides, dims, labels and page box. */
export function prepare(gen, opts = {}) {
  const o = { dims: true, labels: true, bleed: true, safe: true, bleedMm: 3, safeMm: 3, units: 'mm', ...opts };
  const d = gen.dieline;
  const bleed = o.bleed ? bleedOutline(d.pieces, o.bleedMm) : [];
  const safe = o.safe ? safeAreas(d.pieces, o.safeMm) : [];
  const fmt = v => (o.units === 'in' ? `${(v / MM_PER_IN).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}"` : `${(Math.round(v * 10) / 10).toString()}`);
  // dimension lines placed just outside the dieline (or at an explicit position)
  const pad = (o.bleed ? o.bleedMm : 0) + 2;
  const dimLines = !o.dims ? [] : gen.dims.map(dm => {
    const vertical = dm.side === 'right' || dm.side === 'left';
    const pos = dm.at ?? (dm.side === 'top' ? d.bbox.miny - pad - 4 : dm.side === 'bottom' ? d.bbox.maxy + pad + 4 : dm.side === 'right' ? d.bbox.maxx + pad + 4 : d.bbox.minx - pad - 4);
    const a = vertical ? [pos, dm.a[1]] : [dm.a[0], pos], b = vertical ? [pos, dm.b[1]] : [dm.b[0], pos];
    return { a, b, from: [dm.a, dm.b], vertical, text: fmt(Math.abs(dm.text)) };
  });
  let minx = d.bbox.minx, miny = d.bbox.miny, maxx = d.bbox.maxx, maxy = d.bbox.maxy;
  const grow = ([x, y]) => { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); };
  bleed.forEach(p => p.forEach(grow));
  dimLines.forEach(l => { grow(l.a); grow(l.b); grow([l.a[0] + (l.vertical ? 5 : 0), l.a[1] - (l.vertical ? 0 : 5)]); });
  const m = 5;
  const frames = o.frames || [];
  return {
    o, d, bleed, safe, dimLines, frames,
    cutLines: chain(d.cuts),
    labels: o.labels ? gen.labels : [],
    page: o.page || { x: minx - m, y: miny - m, w: maxx - minx + 2 * m, h: maxy - miny + 2 * m },
    hints: gen.hints,
    title: `${gen.styleLabel || gen.style} ${['L', 'W', 'H'].filter(k => gen.params[k] !== undefined).map(k => fmt(gen.params[k])).join(' x ')}${o.units === 'in' ? '' : ' mm'} (inside), board ${gen.params.t} mm`,
  };
}

// ---------- SVG ----------
export function toSVG(gen, opts) {
  const P = prepare(gen, opts), f = r3, { page } = P;
  const pts = pl => pl.map(q => `${f(q[0])},${f(q[1])}`).join(' ');
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(page.w)}mm" height="${f(page.h)}mm" viewBox="${f(page.x)} ${f(page.y)} ${f(page.w)} ${f(page.h)}" data-rea-root="${f(P.hints.root[0])} ${f(P.hints.root[1])}"${P.hints.floor ? ' data-rea-floor="1"' : ''}>`,
    `<title>${esc(P.title)}</title>`,
    `<!-- ${esc(P.title)}. Magenta = cut, cyan = crease, green = bleed, orange = safe area. Made with REA Fold Lab. Check the first sample with your die-maker. -->`,
  ];
  if (P.frames.length) out.push(`<g id="sheet" data-rea-ignore="1" fill="none" stroke="${COLORS.dims}" stroke-width="0.4">`, ...P.frames.map(fr => `<polygon points="${pts(fr.pts)}"${fr.dashed ? ' stroke-dasharray="4 3"' : ''}/>`), '</g>');
  if (P.bleed.length) out.push(`<g id="bleed" data-rea-ignore="1" fill="none" stroke="${COLORS.bleed}" stroke-width="0.2" stroke-dasharray="2 1">`, ...P.bleed.map(p => `<polygon points="${pts(p)}"/>`), '</g>');
  if (P.safe.length) out.push(`<g id="safe" data-rea-ignore="1" fill="none" stroke="${COLORS.safe}" stroke-width="0.2" stroke-dasharray="1 1">`, ...P.safe.map(p => `<polygon points="${pts(p)}"/>`), '</g>');
  out.push(`<g id="cut" fill="none" stroke="${COLORS.cut}" stroke-width="0.25">`, ...P.cutLines.map(pl => `<polyline points="${pts(pl)}"/>`), '</g>');
  out.push(`<g id="crease" fill="none" stroke="${COLORS.crease}" stroke-width="0.25">`,
    ...P.d.creases.map(c => `<line x1="${f(c.a[0])}" y1="${f(c.a[1])}" x2="${f(c.b[0])}" y2="${f(c.b[1])}"${c.fold !== 90 ? ` data-fold="${c.fold}"` : ''}${c.role ? ` data-hinge="${c.role}"` : ''}/>`), '</g>');
  if (P.dimLines.length) {
    out.push(`<g id="dimensions" data-rea-ignore="1" fill="none" stroke="${COLORS.dims}" stroke-width="0.15">`);
    for (const l of P.dimLines) {
      out.push(`<line x1="${f(l.from[0][0])}" y1="${f(l.from[0][1])}" x2="${f(l.a[0])}" y2="${f(l.a[1])}" stroke-dasharray="0.6 0.6"/>`,
        `<line x1="${f(l.from[1][0])}" y1="${f(l.from[1][1])}" x2="${f(l.b[0])}" y2="${f(l.b[1])}" stroke-dasharray="0.6 0.6"/>`,
        `<line x1="${f(l.a[0])}" y1="${f(l.a[1])}" x2="${f(l.b[0])}" y2="${f(l.b[1])}"/>`,
        ...[l.a, l.b].map(q => `<line x1="${f(q[0] - 1)}" y1="${f(q[1] + 1)}" x2="${f(q[0] + 1)}" y2="${f(q[1] - 1)}"/>`));
      const mx = (l.a[0] + l.b[0]) / 2, my = (l.a[1] + l.b[1]) / 2;
      out.push(l.vertical
        ? `<text x="${f(mx + 1.2)}" y="${f(my)}" transform="rotate(-90 ${f(mx + 1.2)} ${f(my)})" font-size="2.6" font-family="Helvetica, Arial, sans-serif" fill="${COLORS.dims}" stroke="none" text-anchor="middle" dominant-baseline="hanging">${l.text}</text>`
        : `<text x="${f(mx)}" y="${f(my - 1)}" font-size="2.6" font-family="Helvetica, Arial, sans-serif" fill="${COLORS.dims}" stroke="none" text-anchor="middle">${l.text}</text>`);
    }
    out.push('</g>');
  }
  if (P.labels.length) out.push(`<g id="labels" data-rea-ignore="1" font-family="Helvetica, Arial, sans-serif" fill="${COLORS.labels}" text-anchor="middle" dominant-baseline="middle">`,
    ...P.labels.map(lb => `<text x="${f(lb.at[0])}" y="${f(lb.at[1])}" font-size="${lb.kind === 'panel' ? 3.2 : 2.4}">${esc(lb.text)}</text>`), '</g>');
  out.push('</svg>');
  return out.join('\n');
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- PDF ----------
/** Vector PDF at true size. Cut and crease use spot colours "CutContour" and "Crease"; every kind is a layer. */
export function toPDF(gen, opts) {
  const P = prepare(gen, opts), { page } = P;
  const k = 72 / 25.4, W = page.w * k, H = page.h * k;
  const X = x => r3((x - page.x) * k), Y = y => r3((page.y + page.h - y) * k);
  const layers = [['Cut', 'cut'], ['Crease', 'crease'], ['Bleed', 'bleed'], ['Safe area', 'safe'], ['Dimensions', 'dims'], ['Labels', 'labels']];
  const s = [];
  const begin = id => s.push(`/OC /oc_${id} BDC`), end = () => s.push('EMC');
  const poly = (pl, close) => { s.push(`${X(pl[0][0])} ${Y(pl[0][1])} m`); pl.slice(1).forEach(q => s.push(`${X(q[0])} ${Y(q[1])} l`)); s.push(close ? 's' : 'S'); };
  const rgb = hex => [1, 3, 5].map(i => r3(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
  s.push('0.5 w 1 J 1 j');
  if (P.bleed.length) { begin('bleed'); s.push(`${rgb(COLORS.bleed)} RG [2 1] 0 d`); P.bleed.forEach(p => poly(p, true)); s.push('[] 0 d'); end(); }
  if (P.safe.length) { begin('safe'); s.push(`${rgb(COLORS.safe)} RG [1 1] 0 d`); P.safe.forEach(p => poly(p, true)); s.push('[] 0 d'); end(); }
  if (P.frames.length) { begin('dims'); s.push(`${rgb(COLORS.dims)} RG 0.6 w`); P.frames.forEach(fr => { s.push(fr.dashed ? '[4 3] 0 d' : '[] 0 d'); poly(fr.pts, true); }); s.push('[] 0 d 0.5 w'); end(); }
  begin('cut'); s.push('/CS1 CS 1 SCN'); P.cutLines.forEach(pl => poly(pl, false)); end();
  begin('crease'); s.push('/CS2 CS 1 SCN'); P.d.creases.forEach(c => poly([c.a, c.b], false)); end();
  const text = (str, x, y, size, rot = 0) => {
    const c = Math.cos(rot), sn = Math.sin(rot);
    s.push(`BT /F1 ${r3(size * k)} Tf ${r3(c)} ${r3(sn)} ${r3(-sn)} ${r3(c)} ${X(x)} ${Y(y)} Tm (${pdfStr(str)}) Tj ET`);
  };
  if (P.dimLines.length) {
    begin('dims'); s.push(`${rgb(COLORS.dims)} RG ${rgb(COLORS.dims)} rg 0.35 w`);
    for (const l of P.dimLines) {
      poly([l.from[0], l.a], false); poly([l.from[1], l.b], false); poly([l.a, l.b], false);
      [l.a, l.b].forEach(q => poly([[q[0] - 1, q[1] + 1], [q[0] + 1, q[1] - 1]], false));
      const mx = (l.a[0] + l.b[0]) / 2, my = (l.a[1] + l.b[1]) / 2, w = l.text.length * 1.3;
      if (l.vertical) text(l.text, mx - 0.6, my + w / 2, 2.6, Math.PI / 2); else text(l.text, mx - w / 2, my - 1, 2.6);
    }
    s.push('0.5 w'); end();
  }
  if (P.labels.length) {
    begin('labels'); s.push(`${rgb(COLORS.labels)} rg`);
    for (const lb of P.labels) { const sz = lb.kind === 'panel' ? 3.2 : 2.4; text(lb.text, lb.at[0] - lb.text.length * sz * 0.27, lb.at[1] + sz * 0.35, sz); }
    end();
  }
  const content = s.join('\n');

  // objects
  const objs = [];
  const ocgIds = layers.map((_, i) => 10 + i);
  objs[1] = `<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [${ocgIds.map(i => `${i} 0 R`).join(' ')}] /D << /Order [${ocgIds.map(i => `${i} 0 R`).join(' ')}] /ON [${ocgIds.map(i => `${i} 0 R`).join(' ')}] >> >> >>`;
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${r3(W)} ${r3(H)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /ColorSpace << /CS1 6 0 R /CS2 7 0 R >> /Properties << ${layers.map(([, id], i) => `/oc_${id} ${ocgIds[i]} 0 R`).join(' ')} >> >> >>`;
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[6] = '[/Separation /CutContour /DeviceCMYK 8 0 R]';
  objs[7] = '[/Separation /Crease /DeviceCMYK 9 0 R]';
  objs[8] = '<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>';
  objs[9] = '<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [1 0 0 0] /N 1 >>';
  layers.forEach(([name], i) => (objs[ocgIds[i]] = `<< /Type /OCG /Name (${pdfStr(name)}) >>`));
  objs[20] = `<< /Title (${pdfStr(P.title)}) /Producer (REA Fold Lab) /Creator (REA Fold Lab Dieline Maker) >>`;
  let pdf = '%PDF-1.5\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    if (!objs[i]) continue;
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length, n = objs.length;
  pdf += `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) pdf += offsets[i] !== undefined ? `${String(offsets[i]).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n';
  pdf += `trailer\n<< /Size ${n} /Root 1 0 R /Info 20 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
const pdfStr = s => String(s).replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');

// ---------- DXF ----------
/** AutoCAD R12 ASCII DXF in mm (y up), one layer per line kind. */
export function toDXF(gen, opts) {
  const P = prepare(gen, opts);
  const y = v => r3(-v), x = v => r3(v);
  const L = [];
  const g = (code, val) => L.push(String(code), String(val));
  const LAYERS = [['CUT', 6], ['CREASE', 4], ['BLEED', 3], ['SAFE', 30], ['DIMENSIONS', 8], ['LABELS', 8]];
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(9, '$MEASUREMENT'); g(70, 1); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0.0); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, LAYERS.length);
  for (const [name, color] of LAYERS) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  const line = (layer, a, b) => { g(0, 'LINE'); g(8, layer); g(10, x(a[0])); g(20, y(a[1])); g(30, 0); g(11, x(b[0])); g(21, y(b[1])); g(31, 0); };
  const pline = (layer, pts, closed) => {
    g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0);
    for (const q of pts) { g(0, 'VERTEX'); g(8, layer); g(10, x(q[0])); g(20, y(q[1])); g(30, 0); }
    g(0, 'SEQEND'); g(8, layer);
  };
  const text = (layer, str, at, h, rot = 0, center = true) => {
    g(0, 'TEXT'); g(8, layer); g(10, x(at[0])); g(20, y(at[1])); g(30, 0); g(40, h); g(1, String(str).replace(/[^\x20-\x7e]/g, '?')); if (rot) g(50, rot);
    if (center) { g(72, 1); g(11, x(at[0])); g(21, y(at[1])); g(31, 0); }
  };
  P.cutLines.forEach(pl => pline('CUT', pl, false));
  P.d.creases.forEach(c => line('CREASE', c.a, c.b));
  P.bleed.forEach(p => pline('BLEED', p, true));
  P.safe.forEach(p => pline('SAFE', p, true));
  for (const l of P.dimLines) {
    line('DIMENSIONS', l.from[0], l.a); line('DIMENSIONS', l.from[1], l.b); line('DIMENSIONS', l.a, l.b);
    const mx = (l.a[0] + l.b[0]) / 2, my = (l.a[1] + l.b[1]) / 2;
    text('DIMENSIONS', l.text, l.vertical ? [mx + 1.8, my] : [mx, my - 1.8], 2.6, l.vertical ? 90 : 0);
  }
  P.labels.forEach(lb => text('LABELS', lb.text, lb.at, lb.kind === 'panel' ? 3.2 : 2.4));
  P.frames.forEach(fr => pline('DIMENSIONS', fr.pts, true));
  g(0, 'ENDSEC'); g(0, 'EOF');
  return L.join('\n') + '\n';
}
