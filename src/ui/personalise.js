// Personalise tab: template (designs + logo zones) -> client logo check -> print-ready PDF.
import { loadPdfjs, strokesFromOperatorList } from '../svg/parse-pdf.js';
import { loadLogo } from '../personalise/logo.js';
import { fitInZone, effectiveDpi, logoWarnings } from '../personalise/logo-core.js';
import { buildPrintPdf, printFileName, FINISHES } from '../personalise/compose.js';
import { putItem, getItem, listItems, deleteItem } from '../storage/library.js';
import { download } from '../export/download.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const PT_MM = 25.4 / 72;
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PRESETS = [
  ['Gold', [0, 20, 60, 20]], ['Black', [0, 0, 0, 100]], ['Rich black', [60, 40, 40, 100]],
  ['Maroon', [0, 100, 80, 40]], ['Navy', [100, 80, 0, 30]], ['Silver grey', [0, 0, 0, 40]],
];
const cmykToRgb = ([c, m, y, k]) => [c, m, y].map(v => Math.round(255 * (1 - v / 100) * (1 - k / 100)));

export function initPersonalise() {
  const st = { tpl: null, doc: null, page: null, pageSize: null, strokes: [], designId: null, logo: null,
    colour: 'keep', size: 100, finishes: new Set(), drawing: null, zoom: 'design', renderScale: 1 };

  // ---------- template ----------
  async function openTemplate(tpl) {
    const pdfjs = await loadPdfjs();
    st.tpl = tpl;
    st.doc = await pdfjs.getDocument({ data: tpl.bytes.slice(), isEvalSupported: false, verbosity: 0 }).promise;
    $('psPageRow').hidden = st.doc.numPages < 2;
    $('psPage').innerHTML = '';
    for (let i = 0; i < st.doc.numPages; i++) $('psPage').add(new Option(`Page ${i + 1}`, i));
    $('psPage').value = tpl.pageIndex || 0;
    $('psTplName').textContent = `${tpl.name}${tpl.id ? '' : ' (not saved yet)'}`;
    st.designId = tpl.designs.find(d => d.area && d.zone)?.id || null;
    await renderPage();
    renderDesigns();
  }
  async function renderPage() {
    const pdfjs = await loadPdfjs();
    st.page = await st.doc.getPage((+st.tpl.pageIndex || 0) + 1);
    const vp = st.page.getViewport({ scale: 1 });
    st.pageSize = { w: vp.width, h: vp.height };
    st.strokes = strokesFromOperatorList(pdfjs.OPS, await st.page.getOperatorList(), vp.transform).flatMap(s => s.polys);
    st.renderScale = Math.min(2.5, 4200 / vp.width);
    const v = st.page.getViewport({ scale: st.renderScale }), c = $('psCanvas');
    c.width = Math.round(v.width); c.height = Math.round(v.height);
    await st.page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
    $('psOverlay').setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`);
    $('psOverlay').setAttribute('preserveAspectRatio', 'none');
    $('psEmpty').hidden = true; $('psStage').hidden = false;
    layout(); draw();
  }

  function layout() {
    if (!st.pageSize) return;
    const wrap = $('psCanvasWrap').getBoundingClientRect(), { w, h } = st.pageSize;
    const d = current();
    const target = st.zoom === 'design' && d?.area ? d.area : { x: 0, y: 0, w, h };
    const s = Math.min((wrap.width - 48) / target.w, (wrap.height - 48) / target.h);
    $('psStage').style.width = `${w * s}px`; $('psStage').style.height = `${h * s}px`;
    requestAnimationFrame(() => {
      $('psCanvasWrap').scrollLeft = target.x * s + 24 - (wrap.width - target.w * s) / 2;
      $('psCanvasWrap').scrollTop = target.y * s + 24 - (wrap.height - target.h * s) / 2;
    });
  }

  const current = () => st.tpl?.designs.find(d => d.id === st.designId) || null;

  function logoBox(d = current()) {
    if (!d?.zone || !st.logo) return null;
    return fitInZone(d.zone, st.logo.aspect, st.size);
  }

  let tinted = null, tintKey = '';
  function previewHref() {
    if (!st.logo) return '';
    if (st.colour !== 'single') return st.logo.preview.toDataURL();
    const cmyk = cmykNow(), key = cmyk.join(',');
    if (tinted && tintKey === key) return tinted;
    const src = st.logo.preview, c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'), data = src.getContext('2d').getImageData(0, 0, src.width, src.height), [r, gg, b] = cmykToRgb(cmyk);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const white = !st.logo.transparent && d[i] > 242 && d[i + 1] > 242 && d[i + 2] > 242;
      if (d[i + 3] >= 128 && !white) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; } else d[i + 3] = 0;
    }
    g.putImageData(data, 0, 0); tinted = c.toDataURL(); tintKey = key;
    return tinted;
  }

  function draw() {
    const svg = $('psOverlay'); svg.innerHTML = '';
    if (!st.tpl) return;
    const sw = st.pageSize.w / 600;
    const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };
    for (const d of st.tpl.designs) {
      const sel = d.id === st.designId;
      if (d.area) {
        el('rect', { x: d.area.x, y: d.area.y, width: d.area.w, height: d.area.h, fill: sel ? 'none' : '#00000010', stroke: sel ? '#9fd400' : '#888', 'stroke-width': sw * (sel ? 1.6 : 1), 'stroke-dasharray': `${sw * 6} ${sw * 4}` });
        const t = el('text', { x: d.area.x + sw * 4, y: d.area.y - sw * 4, 'font-size': sw * 13, fill: sel ? '#5d7d00' : '#666', 'font-family': 'system-ui, sans-serif', 'font-weight': 600 });
        t.textContent = d.name;
      }
      if (d.zone) el('rect', { x: d.zone.x, y: d.zone.y, width: d.zone.w, height: d.zone.h, fill: '#2ee6ff18', stroke: '#00a3c4', 'stroke-width': sw, 'stroke-dasharray': `${sw * 3} ${sw * 2}` });
      if (sel && st.logo) {
        const b = logoBox(d);
        if (b) el('image', { href: previewHref(), x: b.x, y: b.y, width: b.w, height: b.h, preserveAspectRatio: 'none' });
      }
    }
    if (st.drag) el('rect', { x: st.drag.x, y: st.drag.y, width: st.drag.w, height: st.drag.h, fill: '#c8f43c22', stroke: '#c8f43c', 'stroke-width': sw * 1.5 });
    const m = $('psMode');
    m.textContent = st.drawing ? (st.drawing.what === 'area' ? `Drag a box around the pieces of “${designById(st.drawing.id).name}” (Esc to cancel)` : `Now drag the logo zone inside “${designById(st.drawing.id).name}” (Esc to cancel)`) : '';
  }
  const designById = id => st.tpl.designs.find(d => d.id === id);

  // drawing rectangles on the page
  const toPt = e => { const p = $('psOverlay').createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform($('psOverlay').getScreenCTM().inverse()); };
  $('psOverlay').addEventListener('pointerdown', e => {
    if (!st.drawing) { // click a design to select it
      const p = toPt(e), hit = st.tpl?.designs.find(d => d.area && p.x >= d.area.x && p.x <= d.area.x + d.area.w && p.y >= d.area.y && p.y <= d.area.y + d.area.h);
      if (hit) { st.designId = hit.id; renderDesigns(); draw(); updateReport(); }
      return;
    }
    const p0 = toPt(e); st.drag = { x: p0.x, y: p0.y, w: 0, h: 0, x0: p0.x, y0: p0.y };
    $('psOverlay').setPointerCapture(e.pointerId);
  });
  $('psOverlay').addEventListener('pointermove', e => {
    if (!st.drag) return;
    const p = toPt(e), d = st.drag;
    Object.assign(d, { x: Math.min(d.x0, p.x), y: Math.min(d.y0, p.y), w: Math.abs(p.x - d.x0), h: Math.abs(p.y - d.y0) });
    draw();
  });
  $('psOverlay').addEventListener('pointerup', () => {
    if (!st.drag || !st.drawing) return;
    const r = { x: st.drag.x, y: st.drag.y, w: st.drag.w, h: st.drag.h }; st.drag = null;
    if (r.w < 5 || r.h < 5) { draw(); return; }
    const d = designById(st.drawing.id);
    d[st.drawing.what] = r;
    st.drawing = st.drawing.what === 'area' && !d.zone ? { id: d.id, what: 'zone' } : null;
    st.designId = d.id; markDirty(); renderDesigns(); draw(); updateReport();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.drawing) { st.drawing = null; st.drag = null; draw(); } });

  function markDirty() { $('psTplName').textContent = `${st.tpl.name} (unsaved changes)`; }

  function renderDesigns() {
    const box = $('psDesigns'); box.innerHTML = '';
    for (const d of st.tpl?.designs || []) {
      const row = document.createElement('div'); row.className = 'ps-design';
      row.innerHTML = `<input value="${esc(d.name)}"><button class="btn">Area</button><button class="btn">Zone</button><button class="btn">✕</button><small>${d.area ? `${(d.area.w * PT_MM).toFixed(0)} × ${(d.area.h * PT_MM).toFixed(0)} mm` : 'no area yet'} · ${d.zone ? `logo zone ${(d.zone.w * PT_MM).toFixed(1)} × ${(d.zone.h * PT_MM).toFixed(1)} mm` : 'no logo zone yet'}</small>`;
      const [name, a, z, x] = row.querySelectorAll('input, button');
      name.oninput = () => { d.name = name.value; markDirty(); fillDesignSelect(); draw(); };
      a.onclick = () => { st.drawing = { id: d.id, what: 'area' }; st.designId = d.id; st.zoom = 'page'; setZoomUI(); layout(); draw(); };
      z.onclick = () => { st.drawing = { id: d.id, what: 'zone' }; st.designId = d.id; draw(); };
      x.onclick = () => { st.tpl.designs = st.tpl.designs.filter(q => q !== d); markDirty(); renderDesigns(); draw(); };
      box.appendChild(row);
    }
    fillDesignSelect();
  }
  function fillDesignSelect() {
    const sel = $('psDesign'); sel.innerHTML = '';
    for (const d of st.tpl?.designs || []) if (d.area && d.zone) sel.add(new Option(d.name, d.id));
    if (!sel.options.length) sel.add(new Option('— draw a design area and logo zone first —', ''));
    if (st.designId && [...sel.options].some(o => o.value === st.designId)) sel.value = st.designId;
  }

  $('psTplDrop').onclick = () => $('psTplFile').click();
  $('psTplFile').onchange = async () => {
    const f = $('psTplFile').files[0]; if (!f) return;
    try {
      await openTemplate({ id: null, name: f.name.replace(/\.pdf$/i, ''), fileName: f.name, bytes: new Uint8Array(await f.arrayBuffer()), pageIndex: 0, designs: [] });
      msg('Template loaded. Click “+ Add design” and drag around the pieces of the first colourway.', 'warn');
    } catch (e) { msg(`Couldn't open ${f.name} as a PDF: ${e.message}`, 'err'); }
  };
  $('psPage').onchange = async () => { st.tpl.pageIndex = +$('psPage').value; markDirty(); await renderPage(); };
  $('psAddDesign').onclick = () => {
    if (!st.tpl) return msg('Upload a template PDF first.', 'err');
    const d = { id: uid(), name: `Design ${st.tpl.designs.length + 1}`, area: null, zone: null };
    st.tpl.designs.push(d); st.designId = d.id; st.drawing = { id: d.id, what: 'area' }; st.zoom = 'page'; setZoomUI();
    renderDesigns(); layout(); draw();
  };
  $('psSaveTpl').onclick = async () => {
    if (!st.tpl) return;
    st.tpl.id ||= uid();
    await putItem('templates', { ...st.tpl, savedAt: Date.now() });
    $('psTplName').textContent = `${st.tpl.name} (saved)`; await refreshTplList(); $('psTplList').value = st.tpl.id;
  };
  $('psDelTpl').onclick = async () => {
    const id = $('psTplList').value; if (!id) return;
    await deleteItem('templates', id); await refreshTplList();
  };
  $('psTplList').onchange = async () => { const id = $('psTplList').value; if (!id) return; const t = await getItem('templates', id); if (t) await openTemplate(t); };
  async function refreshTplList() {
    const sel = $('psTplList'), keep = sel.value; sel.innerHTML = '<option value="">— Saved templates —</option>';
    try { for (const t of (await listItems('templates')).sort((a, b) => b.savedAt - a.savedAt)) sel.add(new Option(`${t.name} (${t.designs.length} design${t.designs.length === 1 ? '' : 's'})`, t.id)); } catch { /* storage off */ }
    sel.value = keep;
  }

  // ---------- job + logo ----------
  $('psDesign').onchange = () => { st.designId = $('psDesign').value; layout(); draw(); updateReport(); };
  $('psLogoDrop').onclick = () => $('psLogoFile').click();
  $('psLogoFile').onchange = async () => {
    const f = $('psLogoFile').files[0]; if (!f) return;
    try { st.logo = await loadLogo(f); tinted = null; msg(''); updateReport(); draw(); }
    catch (e) { msg(`Couldn't read the logo: ${e.message}`, 'err'); }
  };
  function updateReport() {
    const box = $('psReport'), L = st.logo;
    if (!L) { box.hidden = true; return; }
    const b = logoBox(), printMm = b ? b.w * PT_MM : 0, dpi = L.vector ? 0 : effectiveDpi(L.px.w, printMm);
    const src = L.vector ? `${L.srcMm.w.toFixed(1)} × ${L.srcMm.h.toFixed(1)} mm` : `${L.px.w} × ${L.px.h} px`;
    const rows = [['Type', L.type], ['Source size', src], ['Will print at', b ? `${(b.w * PT_MM).toFixed(1)} × ${(b.h * PT_MM).toFixed(1)} mm` : 'choose a design'],
      ...(L.vector ? [] : [['Resolution', b ? `${Math.round(dpi)} dpi at that size` : '–']]), ['Transparent background', L.transparent ? 'Yes' : 'No']];
    const warn = logoWarnings({ vector: L.vector, dpi: b ? dpi : 9999, transparent: L.transparent, colours: L.colours });
    box.innerHTML = `<div class="lg"><img alt="logo"></div><b>${esc(L.name)}</b><div class="stat">${rows.map(([k, v]) => `<span>${k}</span><span>${esc(v)}</span>`).join('')}</div>
      <div style="margin-top:6px">Colours found: ${L.colours.length ? L.colours.map(c => `<span class="sw2"><i style="background:${c.hex}"></i>${c.hex} ${Math.round(c.share * 100)}%</span>`).join('') : 'none'}</div>
      ${warn.map(w => `<div class="w ${w.level}">${esc(w.text)}</div>`).join('')}`;
    box.querySelector('img').src = L.preview.toDataURL();
    box.hidden = false;
  }

  // ---------- colour, size, finishes ----------
  document.querySelectorAll('#psColour button').forEach(b => (b.onclick = () => {
    st.colour = b.dataset.c; document.querySelectorAll('#psColour button').forEach(x => x.classList.toggle('on', x === b));
    $('psSingle').hidden = st.colour !== 'single'; draw();
  }));
  const cmykNow = () => ['psC', 'psM', 'psY', 'psK'].map(id => Math.max(0, Math.min(100, +$(id).value || 0)));
  for (const [name, v] of PRESETS) {
    const b = document.createElement('button'); b.innerHTML = `<i style="background:rgb(${cmykToRgb(v).join(',')})"></i>${name}`;
    b.onclick = () => { ['psC', 'psM', 'psY', 'psK'].forEach((id, i) => ($(id).value = v[i])); st.preset = name; draw(); };
    $('psPresets').appendChild(b);
  }
  ['psC', 'psM', 'psY', 'psK'].forEach(id => ($(id).oninput = () => { st.preset = 'Custom'; draw(); }));
  $('psSize').oninput = () => { st.size = +$('psSize').value; $('psSizeV').textContent = `${st.size}%`; draw(); updateReport(); };
  for (const [k, f] of Object.entries(FINISHES)) {
    const l = document.createElement('label'); l.className = 'chk';
    l.innerHTML = `<input type="checkbox" value="${k}"> ${f.name} <small style="color:var(--muted)">spot “${f.spot}”</small>`;
    l.querySelector('input').onchange = e => { e.target.checked ? st.finishes.add(k) : st.finishes.delete(k); };
    $('psFinishes').appendChild(l);
  }
  const setZoomUI = () => document.querySelectorAll('#psZoom button').forEach(x => x.classList.toggle('on', x.dataset.z === st.zoom));
  document.querySelectorAll('#psZoom button').forEach(b => (b.onclick = () => { st.zoom = b.dataset.z; setZoomUI(); layout(); }));
  new ResizeObserver(() => layout()).observe($('psCanvasWrap'));

  // ---------- generate ----------
  function msg(t, cls = 'err') { const m = $('psMsg'); m.textContent = t; m.className = 'msg' + (t ? ' ' + cls : ''); }
  $('psGenerate').onclick = async () => {
    const d = current();
    if (!st.tpl) return msg('Upload a template PDF first.');
    if (!d?.area || !d?.zone) return msg('Choose a design that has a design area and a logo zone.');
    if (!st.logo) return msg('Upload the client logo.');
    const client = $('psClient').value.trim(); if (!client) return msg('Enter the client name (it goes into the file name).');
    msg('Building the print file…', 'warn');
    $('psGenerate').disabled = true;
    try {
      const b = logoBox(d), printMm = b.w * PT_MM;
      const assets = await st.logo.printAssets(printMm);
      const naming = { prefix: $('psPrefix').value || 'NO', date: new Date(), campaign: $('psCampaign').value, client, template: st.tpl.name, design: d.name };
      const base = printFileName({ ...naming, version: 0 }).replace(/_V0\.pdf$/, '');
      let prev = null; try { prev = await getItem('jobs', base); } catch { /* storage off */ }
      const version = (prev?.version || 0) + 1, fileName = printFileName({ ...naming, version });
      const inside = pl => pl.some(([x, y]) => x >= d.area.x && x <= d.area.x + d.area.w && y >= d.area.y && y <= d.area.y + d.area.h);
      const cmyk = cmykNow();
      const dpi = st.logo.vector ? null : Math.round(effectiveDpi(st.logo.px.w, printMm));
      const { bytes, pages } = await buildPrintPdf({
        templateBytes: st.tpl.bytes, pageIndex: +st.tpl.pageIndex || 0, area: d.area, zone: d.zone,
        logo: { kind: st.logo.kind, pdfBytes: st.logo.pdfBytes, pngBytes: assets.pngBytes, aspect: st.logo.aspect, mask: assets.mask },
        sizePct: st.size, colour: st.colour === 'single' ? { mode: 'single', cmyk: cmyk.map(v => v / 100), label: st.preset || 'Custom' } : { mode: 'keep' },
        finishes: [...st.finishes], kld: st.strokes.filter(inside),
        meta: { fileName, client, campaign: $('psCampaign').value, template: st.tpl.name, design: d.name, version, quantity: $('psQty').value,
          date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          logoReport: [['Logo file', `${st.logo.name} (${st.logo.type})`], ...(dpi ? [['Logo resolution', `${dpi} dpi at print size`]] : [])] },
      });
      try { await putItem('jobs', { id: base, version, fileName, client, design: d.name, template: st.tpl.name, at: Date.now() }); } catch { /* storage off */ }
      st.lastFile = { bytes, fileName };
      msg('');
      await showResult(bytes, fileName, version, pages);
    } catch (e) { console.error(e); msg(`Couldn't build the file: ${e.message}`); }
    finally { $('psGenerate').disabled = false; }
  };

  async function showResult(bytes, fileName, version, pages) {
    const box = $('psResult');
    box.innerHTML = `<b>Print-ready · V${version}</b><div class="fn">${esc(fileName)}</div><button class="btn primary full">Download print file</button><div class="thumbs"></div>`;
    box.querySelector('button').onclick = () => download(new Blob([bytes], { type: 'application/pdf' }), fileName);
    box.hidden = false;
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    const labels = ['Artwork', ...[...st.finishes].map(k => FINISHES[k].name), 'KLD', 'Instructions'];
    for (let i = 1; i <= Math.min(pages, doc.numPages); i++) {
      const page = await doc.getPage(i), v0 = page.getViewport({ scale: 1 }), v = page.getViewport({ scale: 360 / v0.width });
      const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
      const fig = document.createElement('figure'); fig.innerHTML = `<img alt=""><figcaption>${i}. ${labels[i - 1] || ''}</figcaption>`;
      fig.querySelector('img').src = c.toDataURL('image/jpeg', 0.85);
      box.querySelector('.thumbs').appendChild(fig);
    }
  }

  refreshTplList();
  return { state: st, openTemplate };
}
