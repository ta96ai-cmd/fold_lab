// Dieline Maker tab: style gallery -> parametric dieline, live preview, statistics, exports,
// sheet layout, fold in 3D.
import { STYLES, generate, defaults, toInside, fromInside, isSizeKey, SIZE_MODES } from '../generator/styles.js';
import { dielineStats } from '../generator/core.js';
import { toSVG, toPDF, toDXF, formatLength } from '../generator/writers.js';
import { SHEETS, nest, sheetLayout } from '../generator/nesting.js';
import { download } from '../export/download.js';

const $ = id => document.getElementById(id);
const UNIT = { mm: { f: 1, label: 'mm', step: 0.5 }, cm: { f: 10, label: 'cm', step: 0.05 }, in: { f: 25.4, label: 'in', step: 0.0625 }, in64: { f: 25.4, label: 'in', step: 1 / 64 } };
const PT = 0.0254; // caliper point = 0.001 inch

export function initMaker({ onFold }) {
  const st = { style: 'rte', units: 'mm', mode: 'inside', boardUnit: 'mm', params: defaults('rte'), view: 'dieline', zoom: null, gen: null, cat: 'All' };

  // ---------- gallery ----------
  const thumbCache = new Map();
  const thumb = key => {
    if (!thumbCache.has(key)) {
      try { thumbCache.set(key, toSVG(generate(key, {}), { dims: false, labels: false, bleed: false, safe: false }).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" height="100%"').replace(/stroke-width="0.25"/g, 'stroke-width="1.2"')); }
      catch { thumbCache.set(key, ''); }
    }
    return thumbCache.get(key);
  };
  const cats = ['All', ...new Set(Object.values(STYLES).map(s => s.group))];
  function renderGallery() {
    $('mkCats').innerHTML = '';
    for (const c of cats) {
      const n = c === 'All' ? Object.keys(STYLES).length : Object.values(STYLES).filter(s => s.group === c).length;
      const b = document.createElement('button'); b.textContent = `${c} (${n})`; b.className = c === st.cat ? 'on' : '';
      b.onclick = () => { st.cat = c; renderGallery(); };
      $('mkCats').appendChild(b);
    }
    const q = $('mkSearch').value.trim().toLowerCase();
    $('mkGrid').innerHTML = '';
    const list = Object.entries(STYLES).filter(([k, s]) => (st.cat === 'All' || s.group === st.cat) && (!q || `${s.label} ${s.code} ${s.group} ${s.tags}`.toLowerCase().includes(q)));
    if (!list.length) $('mkGrid').innerHTML = '<div class="hint">No style matches that search.</div>';
    for (const [k, s] of list) {
      const card = document.createElement('button'); card.className = 'g-card' + (k === st.style ? ' cur' : '');
      card.innerHTML = `<div class="thumb">${thumb(k)}</div><span class="code">${s.code}</span><b></b><small></small>`;
      card.querySelector('b').textContent = s.label; card.querySelector('small').textContent = s.group;
      card.onclick = () => { selectStyle(k); $('mkGallery').hidden = true; };
      $('mkGrid').appendChild(card);
    }
  }
  $('mkStyleCard').onclick = () => { renderGallery(); $('mkGallery').hidden = false; $('mkSearch').focus(); };
  $('mkGalleryClose').onclick = () => ($('mkGallery').hidden = true);
  $('mkSearch').oninput = renderGallery;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('mkGallery').hidden = true; });

  function selectStyle(k) {
    const keep = ['L', 'W', 'H', 't'].filter(x => x in st.params && x in STYLES[k].params);
    const old = st.params; st.style = k; st.params = defaults(k);
    keep.forEach(x => (st.params[x] = old[x]));
    renderStyleCard(); renderParams(); update();
  }
  function renderStyleCard() {
    const s = STYLES[st.style];
    $('mkStyleThumb').innerHTML = thumb(st.style);
    $('mkStyleName').textContent = s.label; $('mkStyleMeta').textContent = `${s.code} · ${s.group}`;
  }

  // ---------- parameters (stored as inside mm; shown in the chosen unit and size mode) ----------
  const toShown = (k, mm) => (k === 't' ? (st.boardUnit === 'pt' ? mm / PT : mm) : mm / UNIT[st.units].f);
  const fromShown = (k, v) => (k === 't' ? (st.boardUnit === 'pt' ? v * PT : v) : v * UNIT[st.units].f);
  const round = v => +(+v).toFixed(4);
  function renderParams() {
    const box = $('mkParams'); box.innerHTML = '';
    const shown = fromInside(st.params, st.mode);
    for (const [k, d] of Object.entries(STYLES[st.style].params)) {
      const lab = document.createElement('label');
      const unit = k === 't' ? `<select class="bu"><option value="mm">mm</option><option value="pt">pt</option></select>` : UNIT[st.units].label;
      const hint = isSizeKey(k) ? SIZE_MODES[st.mode].toLowerCase() : k === 't' ? 'board caliper' : d.hint || '';
      lab.innerHTML = `${d.label.replace(/ \(.*\)/, '')} <small>${unit}${hint ? ' · ' + hint : ''}</small><input type="number">`;
      const inp = lab.querySelector('input');
      inp.step = k === 't' ? (st.boardUnit === 'pt' ? 1 : 0.05) : UNIT[st.units].step;
      inp.value = round(toShown(k, shown[k]));
      inp.oninput = () => {
        const v = parseFloat(inp.value); if (!Number.isFinite(v)) return;
        // keep the sizes as the user entered them (in the current size mode), then convert to inside
        const disp = fromInside(st.params, st.mode); disp[k] = fromShown(k, v);
        st.params = toInside(disp, st.mode);
        update();
      };
      const bu = lab.querySelector('select.bu');
      if (bu) { bu.value = st.boardUnit; bu.onchange = () => { st.boardUnit = bu.value; renderParams(); }; }
      box.appendChild(lab);
    }
  }

  const opts = () => ({
    dims: $('mkDims').checked, labels: $('mkLabels').checked,
    bleed: $('mkBleed').checked, safe: $('mkSafe').checked,
    bleedMm: +$('mkBleedMm').value || 0, safeMm: +$('mkSafeMm').value || 0, units: st.units,
  });
  const L = mm => (st.units === 'mm' ? `${formatLength(mm, 'mm')} mm` : st.units === 'cm' ? `${formatLength(mm, 'cm')} cm` : formatLength(mm, st.units));
  const fileBase = () => {
    const p = fromInside(st.params, st.mode), f = v => (st.units === 'mm' ? +v.toFixed(1) : st.units === 'cm' ? +(v / 10).toFixed(2) : +(v / 25.4).toFixed(3));
    return `${STYLES[st.style].code}_${['L', 'W', 'H'].filter(k => k in p).map(k => f(p[k])).join('x')}${st.units === 'in64' ? 'in' : st.units}_${st.mode}`;
  };

  function sheet() {
    const k = $('mkSheet').value;
    $('mkSheetCustom').hidden = k !== 'custom';
    return k === 'custom' ? { w: +$('mkSheetW').value || 700, h: +$('mkSheetH').value || 1000, label: 'Custom' } : SHEETS[k];
  }
  function nesting() {
    const g = st.gen, o = opts(), pad = $('mkNestBleed').value === '1' && o.bleed ? o.bleedMm : 0;
    const sh = sheet(), dw = g.dieline.bbox.w + 2 * pad, dh = g.dieline.bbox.h + 2 * pad;
    const Ly = nest(dw, dh, sh, { gutter: +$('mkGutter').value || 0, margin: +$('mkMargin').value || 0 });
    const area = dielineStats(g.dieline).usedArea;
    return { L: Ly, sh, pad, area, used: Ly.count * area / (sh.w * sh.h) };
  }

  function update() {
    try { st.gen = generate(st.style, st.params); showMsg(''); }
    catch (e) { showMsg(e.message); return; }
    const g = st.gen, p = st.params, b = g.dieline.bbox, s = dielineStats(g.dieline);
    const size = mode => { const q = fromInside(p, mode); return ['L', 'W', 'H'].filter(k => k in q).map(k => L(q[k])).join(' × '); };
    const row = (a, v) => `<span>${a}</span><span>${v}</span>`;
    $('mkInfo').innerHTML = `Flat size <b>${L(b.w)} × ${L(b.h)}</b><div class="stat">${[
      row('Inside', size('inside')), row('Die-cut', size('diecut')), row('Outside', size('outside')),
      row('Cut line length', `${(s.cutLength / 1000).toFixed(3)} m`), row('Crease line length', `${(s.creaseLength / 1000).toFixed(3)} m`),
      row('Board used', `${(s.usedArea / 1e6).toFixed(4)} m²`), row('Rectangle', `${(s.rectArea / 1e6).toFixed(4)} m²`),
      row('Utilisation', `${(s.utilisation * 100).toFixed(1)} %`),
    ].join('')}</div>`;
    const n = nesting();
    $('mkNest').innerHTML = n.L.count
      ? `<b>${n.L.count}</b> per sheet on ${n.sh.label}${n.L.placements.some(q => q.rot) ? ' (some rotated)' : ''}<br>${(n.used * 100).toFixed(1)}% of the sheet is box board · cut ${(n.L.count * s.cutLength / 1000).toFixed(2)} m / crease ${(n.L.count * s.creaseLength / 1000).toFixed(2)} m per sheet`
      : `Doesn't fit on ${n.sh.label}. Try a bigger sheet or a smaller margin.`;
    render();
  }

  function showMsg(t) { const m = $('mkMsg'); m.textContent = t; m.className = 'msg' + (t ? ' err' : ''); }

  const frames = (sh, mg) => [{ pts: [[0, 0], [sh.w, 0], [sh.w, sh.h], [0, sh.h]] }, { pts: [[mg, mg], [sh.w - mg, mg], [sh.w - mg, sh.h - mg], [mg, sh.h - mg]], dashed: true }];
  function currentSVG() {
    if (st.view === 'sheet') {
      const n = nesting(), sh = n.sh, mg = +$('mkMargin').value || 0;
      return toSVG(sheetLayout(st.gen, sh, n.L, n.pad), { dims: false, labels: false, bleed: opts().bleed && n.pad > 0, bleedMm: n.pad, safe: false, page: { x: 0, y: 0, w: sh.w, h: sh.h }, frames: frames(sh, mg) });
    }
    return toSVG(st.gen, opts());
  }

  function render() {
    if (!st.gen) return;
    const paper = $('mkPaper');
    paper.innerHTML = currentSVG();
    const vb = paper.querySelector('svg').viewBox.baseVal;
    const area = $('mkCanvas').getBoundingClientRect();
    const fit = Math.min((area.width - 48) / vb.width, (area.height - 48) / vb.height);
    const z = st.zoom ?? fit;
    paper.style.width = `${vb.width * z}px`; paper.style.height = `${vb.height * z}px`;
  }

  // ---------- events ----------
  const seg = (id, attr, fn) => document.querySelectorAll(`#${id} button`).forEach(b => (b.onclick = () => {
    document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset[attr]);
  }));
  seg('mkUnits', 'u', u => { st.units = u; renderParams(); update(); });
  seg('mkMode', 'm', m => { st.mode = m; renderParams(); update(); });
  seg('mkView', 'v', v => { st.view = v; st.zoom = null; render(); });
  document.querySelectorAll('#mkZoom button').forEach(b => (b.onclick = () => {
    const svg = $('mkPaper').querySelector('svg'); if (!svg) return;
    const cur = parseFloat($('mkPaper').style.width) / svg.viewBox.baseVal.width;
    st.zoom = b.dataset.z === '0' ? null : cur * (b.dataset.z === '1' ? 1.3 : 1 / 1.3);
    render();
  }));
  for (const [k, v] of Object.entries(SHEETS)) $('mkSheet').add(new Option(v.label, k));
  $('mkSheet').value = '20x30';
  ['mkDims', 'mkLabels', 'mkBleed', 'mkSafe', 'mkBleedMm', 'mkSafeMm', 'mkSheet', 'mkSheetW', 'mkSheetH', 'mkGutter', 'mkMargin', 'mkNestBleed']
    .forEach(id => ($(id).oninput = $(id).onchange = update));
  new ResizeObserver(() => st.zoom === null && render()).observe($('mkCanvas'));

  $('mkSvg').onclick = () => st.gen && download(new Blob([toSVG(st.gen, opts())], { type: 'image/svg+xml' }), `${fileBase()}.svg`);
  $('mkPdf').onclick = () => st.gen && download(new Blob([toPDF(st.gen, opts())], { type: 'application/pdf' }), `${fileBase()}.pdf`);
  $('mkDxf').onclick = () => st.gen && download(new Blob([toDXF(st.gen, { ...opts(), units: 'mm' })], { type: 'application/dxf' }), `${fileBase()}.dxf`);
  const sheetFiles = kind => {
    if (!st.gen) return;
    const n = nesting(), sh = n.sh, mg = +$('mkMargin').value || 0;
    if (!n.L.count) return showMsg(`The dieline doesn't fit on ${sh.label}. Pick a bigger sheet or a smaller margin.`);
    const sg = sheetLayout(st.gen, sh, n.L, n.pad), o = { dims: false, labels: false, bleed: false, safe: false, page: { x: 0, y: 0, w: sh.w, h: sh.h }, frames: frames(sh, mg) };
    if (kind === 'pdf') download(new Blob([toPDF(sg, o)], { type: 'application/pdf' }), `${fileBase()}_sheet_${n.L.count}up.pdf`);
    else download(new Blob([toDXF(sg, o)], { type: 'application/dxf' }), `${fileBase()}_sheet_${n.L.count}up.dxf`);
  };
  $('mkSheetPdf').onclick = () => sheetFiles('pdf');
  $('mkSheetDxf').onclick = () => sheetFiles('dxf');
  $('mkFold').onclick = () => st.gen && onFold(toSVG(st.gen, opts()), `${STYLES[st.style].label} ${fileBase()}.svg`);

  renderStyleCard(); renderParams(); update();
  return { refresh: () => { st.zoom = null; render(); }, selectStyle };
}
