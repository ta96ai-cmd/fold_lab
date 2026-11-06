// Dieline Maker tab: parametric box styles -> live dieline preview, exports, sheet layout, fold in 3D.
import { STYLES, generate, defaults } from '../generator/styles.js';
import { toSVG, toPDF, toDXF } from '../generator/writers.js';
import { SHEETS, nest, sheetLayout, polyArea } from '../generator/nesting.js';
import { download } from '../export/download.js';

const $ = id => document.getElementById(id);
const IN = 25.4;

export function initMaker({ onFold }) {
  const st = { style: 'rte', units: 'mm', params: defaults('rte'), view: 'dieline', zoom: null, gen: null };

  // style list grouped
  const groups = {};
  for (const [k, v] of Object.entries(STYLES)) (groups[v.group] ||= []).push([k, v]);
  for (const [g, list] of Object.entries(groups)) {
    const og = document.createElement('optgroup'); og.label = g;
    list.forEach(([k, v]) => og.appendChild(new Option(v.label, k)));
    $('mkStyle').appendChild(og);
  }
  for (const [k, v] of Object.entries(SHEETS)) $('mkSheet').add(new Option(v.label, k));
  $('mkSheet').value = '20x30';

  const isLength = k => k !== 't';
  const show = (k, mm) => (st.units === 'in' && isLength(k) ? +(mm / IN).toFixed(4) : mm);
  function renderParams() {
    const box = $('mkParams'); box.innerHTML = '';
    for (const [k, d] of Object.entries(STYLES[st.style].params)) {
      const unit = isLength(k) ? st.units : 'mm';
      const lab = document.createElement('label');
      lab.innerHTML = `${d.label.replace(/ \(.*\)/, '')} <small>${unit}${d.hint ? ' · ' + d.hint : ''}</small><input type="number" step="${unit === 'in' ? 0.0625 : d.step}">`;
      const inp = lab.querySelector('input'); inp.value = show(k, st.params[k]);
      inp.oninput = () => { const v = parseFloat(inp.value); st.params[k] = unit === 'in' ? v * IN : v; update(); };
      box.appendChild(lab);
    }
  }

  const opts = () => ({
    dims: $('mkDims').checked, labels: $('mkLabels').checked,
    bleed: $('mkBleed').checked, safe: $('mkSafe').checked,
    bleedMm: +$('mkBleedMm').value || 0, safeMm: +$('mkSafeMm').value || 0, units: st.units,
  });
  const fmtLen = mm => (st.units === 'in' ? `${(mm / IN).toFixed(3)} in` : `${mm.toFixed(1)} mm`);
  const fileBase = () => {
    const p = st.params, f = v => (st.units === 'in' ? +(v / IN).toFixed(3) : +v.toFixed(1));
    return `${st.style}_${['L', 'W', 'H'].map(k => f(p[k])).join('x')}${st.units === 'in' ? 'in' : 'mm'}`;
  };

  function sheet() {
    const k = $('mkSheet').value;
    $('mkSheetCustom').hidden = k !== 'custom';
    return k === 'custom' ? { w: +$('mkSheetW').value || 700, h: +$('mkSheetH').value || 1000, label: 'Custom' } : SHEETS[k];
  }
  function nesting() {
    const g = st.gen, o = opts(), pad = $('mkNestBleed').value === '1' && o.bleed ? o.bleedMm : 0;
    const sh = sheet(), dw = g.dieline.bbox.w + 2 * pad, dh = g.dieline.bbox.h + 2 * pad;
    const L = nest(dw, dh, sh, { gutter: +$('mkGutter').value || 0, margin: +$('mkMargin').value || 0 });
    const area = g.dieline.pieces.reduce((s, pc) => s + polyArea(pc.pts), 0);
    return { L, sh, pad, area, used: L.count * area / (sh.w * sh.h) };
  }

  function update() {
    try {
      st.gen = generate(st.style, st.params);
      showMsg('');
    } catch (e) { showMsg(e.message); return; }
    const g = st.gen, p = st.params, b = g.dieline.bbox;
    const area = g.dieline.pieces.reduce((s, pc) => s + polyArea(pc.pts), 0);
    const outside = st.style === 'tray' ? `${fmtLen(p.L + p.t)} × ${fmtLen(p.W + p.t)} × ${fmtLen(p.H + p.t)} (tray)` : `${fmtLen(p.L + p.t)} × ${fmtLen(p.W + p.t)} × ${fmtLen(p.H + p.t)}`;
    $('mkInfo').innerHTML = `Flat size <b>${fmtLen(b.w)} × ${fmtLen(b.h)}</b><br>Outside box ≈ ${outside}<br>Board per box ${(area / 1e6).toFixed(4)} m² · ${g.dieline.cuts.length} cut / ${g.dieline.creases.length} crease segments`;
    const n = nesting();
    $('mkNest').innerHTML = n.L.count
      ? `<b>${n.L.count}</b> per sheet on ${n.sh.label}${n.L.placements.some(q => q.rot) ? ' (some rotated)' : ''}<br>${(n.used * 100).toFixed(1)}% of the sheet is box board`
      : `Doesn't fit on ${n.sh.label}. Try a bigger sheet or a smaller margin.`;
    render();
  }

  function showMsg(t) { const m = $('mkMsg'); m.textContent = t; m.className = 'msg' + (t ? ' err' : ''); }

  function currentSVG() {
    if (st.view === 'sheet') {
      const n = nesting(), sh = n.sh, mg = +$('mkMargin').value || 0;
      const sg = sheetLayout(st.gen, sh, n.L, n.pad);
      return toSVG(sg, { dims: false, labels: false, bleed: opts().bleed && n.pad > 0, bleedMm: n.pad, safe: false, page: { x: 0, y: 0, w: sh.w, h: sh.h },
        frames: [{ pts: [[0, 0], [sh.w, 0], [sh.w, sh.h], [0, sh.h]] }, { pts: [[mg, mg], [sh.w - mg, mg], [sh.w - mg, sh.h - mg], [mg, sh.h - mg]], dashed: true }] });
    }
    return toSVG(st.gen, opts());
  }

  function render() {
    if (!st.gen) return;
    const svg = currentSVG(), paper = $('mkPaper');
    paper.innerHTML = svg;
    const vb = paper.querySelector('svg').viewBox.baseVal;
    const area = $('mkCanvas').getBoundingClientRect();
    const fit = Math.min((area.width - 48) / vb.width, (area.height - 48) / vb.height);
    const z = st.zoom ?? fit;
    paper.style.width = `${vb.width * z}px`; paper.style.height = `${vb.height * z}px`;
  }

  // events
  $('mkStyle').onchange = () => {
    const keep = ['L', 'W', 'H', 't'].filter(k => k in st.params && k in STYLES[$('mkStyle').value].params);
    const old = st.params; st.style = $('mkStyle').value; st.params = defaults(st.style);
    keep.forEach(k => (st.params[k] = old[k]));
    renderParams(); update();
  };
  document.querySelectorAll('#mkUnits button').forEach(b => (b.onclick = () => {
    st.units = b.dataset.u; document.querySelectorAll('#mkUnits button').forEach(x => x.classList.toggle('on', x === b));
    renderParams(); update();
  }));
  document.querySelectorAll('#mkView button').forEach(b => (b.onclick = () => {
    st.view = b.dataset.v; st.zoom = null; document.querySelectorAll('#mkView button').forEach(x => x.classList.toggle('on', x === b)); render();
  }));
  document.querySelectorAll('#mkZoom button').forEach(b => (b.onclick = () => {
    const paper = $('mkPaper').querySelector('svg'); if (!paper) return;
    const vb = paper.viewBox.baseVal, cur = parseFloat($('mkPaper').style.width) / vb.width;
    st.zoom = b.dataset.z === '0' ? null : cur * (b.dataset.z === '1' ? 1.3 : 1 / 1.3);
    render();
  }));
  ['mkDims', 'mkLabels', 'mkBleed', 'mkSafe', 'mkBleedMm', 'mkSafeMm', 'mkSheet', 'mkSheetW', 'mkSheetH', 'mkGutter', 'mkMargin', 'mkNestBleed']
    .forEach(id => ($(id).oninput = $(id).onchange = update));
  new ResizeObserver(() => st.zoom === null && render()).observe($('mkCanvas'));

  $('mkSvg').onclick = () => st.gen && download(new Blob([toSVG(st.gen, opts())], { type: 'image/svg+xml' }), `${fileBase()}.svg`);
  $('mkPdf').onclick = () => st.gen && download(new Blob([toPDF(st.gen, opts())], { type: 'application/pdf' }), `${fileBase()}.pdf`);
  $('mkDxf').onclick = () => st.gen && download(new Blob([toDXF(st.gen, { ...opts(), units: 'mm' })], { type: 'application/dxf' }), `${fileBase()}.dxf`);
  const sheetGen = () => {
    const n = nesting(), sh = n.sh, mg = +$('mkMargin').value || 0;
    return { n, sh, sg: sheetLayout(st.gen, sh, n.L, n.pad), frames: [{ pts: [[0, 0], [sh.w, 0], [sh.w, sh.h], [0, sh.h]] }, { pts: [[mg, mg], [sh.w - mg, mg], [sh.w - mg, sh.h - mg], [mg, sh.h - mg]], dashed: true }] };
  };
  $('mkSheetPdf').onclick = () => {
    if (!st.gen) return; const { n, sh, sg, frames } = sheetGen(); if (!n.L.count) return showMsg(`The dieline doesn't fit on ${n.sh.label}. Pick a bigger sheet or a smaller margin.`);
    download(new Blob([toPDF(sg, { dims: false, labels: false, bleed: false, safe: false, page: { x: 0, y: 0, w: sh.w, h: sh.h }, frames })], { type: 'application/pdf' }), `${fileBase()}_sheet_${n.L.count}up.pdf`);
  };
  $('mkSheetDxf').onclick = () => {
    if (!st.gen) return; const { n, sg, frames } = sheetGen(); if (!n.L.count) return showMsg(`The dieline doesn't fit on ${n.sh.label}. Pick a bigger sheet or a smaller margin.`);
    download(new Blob([toDXF(sg, { dims: false, labels: false, bleed: false, safe: false, frames })], { type: 'application/dxf' }), `${fileBase()}_sheet_${n.L.count}up.dxf`);
  };
  $('mkFold').onclick = () => st.gen && onFold(toSVG(st.gen, opts()), `${STYLES[st.style].label} ${fileBase()}.svg`);

  renderParams(); update();
  return { refresh: () => { st.zoom = null; render(); } };
}
