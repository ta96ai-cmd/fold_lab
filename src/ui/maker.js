// Dieline Maker tab: style gallery -> parametric dieline, live preview, statistics, exports,
// sheet layout, fold in 3D.
import { STYLES, generate, defaults, toInside, fromInside, isSizeKey, SIZE_MODES } from '../generator/styles.js';
import { dielineStats } from '../generator/core.js';
import { toSVG, toPDF, toDXF, formatLength } from '../generator/writers.js';
import { SHEETS, nest, sheetLayout } from '../generator/nesting.js';
import { download } from '../export/download.js';
import { initArtwork } from './artwork.js';
import { putItem, listItems, deleteItem } from '../storage/library.js';
import { transformGen, step, IDENTITY, describe } from '../generator/transform.js';
import { MATERIALS, materialFor } from '../generator/materials.js';

const $ = id => document.getElementById(id);
const UNIT = { mm: { f: 1, label: 'mm', step: 0.5 }, cm: { f: 10, label: 'cm', step: 0.05 }, in: { f: 25.4, label: 'in', step: 0.0625 }, in64: { f: 25.4, label: 'in', step: 1 / 64 } };
const PT = 0.0254; // caliper point = 0.001 inch

export function initMaker({ onFold }) {
  let art = null;   // artwork editor (Artwork view)
  const st = { style: 'rte', units: 'mm', mode: 'inside', boardUnit: 'mm', params: defaults('rte'), view: 'dieline', zoom: null, gen: null, cat: 'All', typed: false, xf: IDENTITY, adv: false };   // typed: the user has entered their own sizes

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
    // keep the sizes; keep the board only between styles made of the same board (carton vs corrugated)
    const sameBoard = STYLES[st.style].params.t?.def === STYLES[k].params.t?.def;
    // sizes carry over only once the user has typed their own; otherwise each style opens at its own size
    const keep = [...(st.typed ? ['L', 'W', 'H'] : []), ...(sameBoard ? ['t'] : [])].filter(x => x in st.params && x in STYLES[k].params);
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
  const isCount = k => !!STYLES[st.style].params[k]?.count;   // counts (lock tabs...) are never unit-converted
  const toShown = (k, mm) => (isCount(k) ? mm : k === 't' ? (st.boardUnit === 'pt' ? mm / PT : mm) : mm / UNIT[st.units].f);
  const fromShown = (k, v) => (isCount(k) ? Math.round(v) : k === 't' ? (st.boardUnit === 'pt' ? v * PT : v) : v * UNIT[st.units].f);
  const round = v => +(+v).toFixed(4);
  const basic = (k, d) => isSizeKey(k) || k === 't' || k === 'lidH' || d.count;
  function renderParams() {
    const box = $('mkParams'); box.innerHTML = '';
    const shown = fromInside(st.params, st.mode);
    $('mkMat').value = materialFor(st.params.t)?.id || '';
    const hidden = Object.entries(STYLES[st.style].params).filter(([k, d]) => !basic(k, d)).length;
    $('mkAdvN').textContent = hidden ? (st.adv ? '' : `(+${hidden} more)`) : '';
    for (const [k, d] of Object.entries(STYLES[st.style].params)) {
      if (!st.adv && !basic(k, d)) continue;
      const lab = document.createElement('label');
      const unit = k === 't' ? `<select class="bu"><option value="mm">mm</option><option value="pt">pt</option></select>` : d.count ? 'count' : UNIT[st.units].label;
      const hint = isSizeKey(k) ? SIZE_MODES[st.mode].toLowerCase() : k === 't' ? 'board caliper' : d.hint || '';
      const code = (d.label.match(/\(([A-Z])\)/) || [])[1];
      lab.innerHTML = `<span>${d.label.replace(/ \(.*\)/, '')}${code ? `<code>${code}</code>` : ''}</span> <small>${unit}${hint ? ' · ' + hint : ''}</small><input type="number">`;
      const inp = lab.querySelector('input');
      inp.step = d.count ? 1 : k === 't' ? (st.boardUnit === 'pt' ? 1 : 0.05) : UNIT[st.units].step;
      inp.value = round(toShown(k, shown[k]));
      inp.oninput = () => {
        const v = parseFloat(inp.value); if (!Number.isFinite(v)) return;
        // keep the sizes as the user entered them (in the current size mode), then convert to inside
        const disp = fromInside(st.params, st.mode); disp[k] = fromShown(k, v);
        st.params = toInside(disp, st.mode);
        if (isSizeKey(k)) st.typed = true;
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
    sign: $('mkSign').value, dimMode: $('mkDimMode').value, fontScale: +$('mkFont').value || 1,
    colors: { cut: $('mkCutCol').value, crease: $('mkCreaseCol').value },
  });
  /** The dieline as shown in the Dieline / Sheet views and exported to files (turned / mirrored). */
  const shown = () => transformGen(st.gen, st.xf);
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
    const g = shown(), o = opts(), pad = $('mkNestBleed').value === '1' && o.bleed ? o.bleedMm : 0;
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
      return toSVG(sheetLayout(shown(), sh, n.L, n.pad), { dims: false, labels: false, bleed: opts().bleed && n.pad > 0, bleedMm: n.pad, safe: false, page: { x: 0, y: 0, w: sh.w, h: sh.h }, frames: frames(sh, mg) });
    }
    return toSVG(shown(), opts());
  }

  function render() {
    if (!st.gen) return;
    const paper = $('mkPaper');
    paper.innerHTML = st.view === 'art' && art ? art.decorate(toSVG(st.gen, opts())) : currentSVG();
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
  const zoomBy = z => {       // z: 1 in, -1 out, 0 fit
    const svg = $('mkPaper').querySelector('svg'); if (!svg) return;
    const cur = parseFloat($('mkPaper').style.width) / svg.viewBox.baseVal.width;
    st.zoom = z === 0 ? null : cur * (z > 0 ? 1.3 : 1 / 1.3);
    render();
  };
  document.querySelectorAll('#mkZoom button').forEach(b => (b.onclick = () => zoomBy(+b.dataset.z)));
  // material list
  $('mkMat').add(new Option('Custom thickness (type it below)', ''));
  for (const g of MATERIALS) {
    const og = document.createElement('optgroup'); og.label = g.group;
    g.items.forEach(m => og.appendChild(new Option(`${m.label} · ${m.t} mm`, m.id)));
    $('mkMat').appendChild(og);
  }
  $('mkMat').onchange = () => {
    const m = MATERIALS.flatMap(g => g.items).find(x => x.id === $('mkMat').value);
    if (m) { st.params = { ...st.params, t: m.t }; st.boardUnit = 'mm'; renderParams(); update(); }
  };
  $('mkAdv').onchange = () => { st.adv = $('mkAdv').checked; renderParams(); };
  $('mkColReset').onclick = () => { $('mkCutCol').value = '#ff00ff'; $('mkCreaseCol').value = '#00ffff'; update(); };
  // turn / mirror
  document.querySelectorAll('#mkXf button').forEach(b => (b.onclick = () => {
    st.xf = b.dataset.x === 'reset' ? IDENTITY : step(st.xf, b.dataset.x); st.zoom = null;
    $('mkXfInfo').textContent = describe(st.xf) === 'as drawn' ? '' : describe(st.xf);
    update();
  }));
  for (const [k, v] of Object.entries(SHEETS)) $('mkSheet').add(new Option(v.label, k));
  $('mkSheet').value = '20x30';
  ['mkDims', 'mkLabels', 'mkBleed', 'mkSafe', 'mkBleedMm', 'mkSafeMm', 'mkSheet', 'mkSheetW', 'mkSheetH', 'mkGutter', 'mkMargin', 'mkNestBleed', 'mkSign', 'mkDimMode', 'mkFont', 'mkCutCol', 'mkCreaseCol']
    .forEach(id => ($(id).oninput = $(id).onchange = update));
  new ResizeObserver(() => st.zoom === null && render()).observe($('mkCanvas'));

  $('mkSvg').onclick = () => st.gen && download(new Blob([toSVG(shown(), opts())], { type: 'image/svg+xml' }), `${fileBase()}.svg`);
  $('mkPdf').onclick = () => st.gen && download(new Blob([toPDF(shown(), opts())], { type: 'application/pdf' }), `${fileBase()}.pdf`);
  $('mkDxf').onclick = () => st.gen && download(new Blob([toDXF(shown(), { ...opts(), units: 'mm' })], { type: 'application/dxf' }), `${fileBase()}.dxf`);
  const sheetFiles = kind => {
    if (!st.gen) return;
    const n = nesting(), sh = n.sh, mg = +$('mkMargin').value || 0;
    if (!n.L.count) return showMsg(`The dieline doesn't fit on ${sh.label}. Pick a bigger sheet or a smaller margin.`);
    const sg = sheetLayout(shown(), sh, n.L, n.pad), o = { dims: false, labels: false, bleed: false, safe: false, page: { x: 0, y: 0, w: sh.w, h: sh.h }, frames: frames(sh, mg) };
    if (kind === 'pdf') download(new Blob([toPDF(sg, o)], { type: 'application/pdf' }), `${fileBase()}_sheet_${n.L.count}up.pdf`);
    else download(new Blob([toDXF(sg, o)], { type: 'application/dxf' }), `${fileBase()}_sheet_${n.L.count}up.dxf`);
  };
  $('mkSheetPdf').onclick = () => sheetFiles('pdf');
  $('mkSheetDxf').onclick = () => sheetFiles('dxf');
  $('mkFold').onclick = () => st.gen && onFold(toSVG(st.gen, { ...opts(), colors: undefined }), `${STYLES[st.style].label} ${fileBase()}.svg`, art?.has() ? art.forFold() : null);

  // ---------- my boxes (saved setups) ----------
  const setSeg = (id, attr, v) => document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset[attr] === v));
  const OPT_IDS = { dims: 'mkDims', labels: 'mkLabels', bleed: 'mkBleed', safe: 'mkSafe', bleedMm: 'mkBleedMm', safeMm: 'mkSafeMm' };
  async function renderBoxes() {
    let items = [];
    try { items = (await listItems('boxes')).sort((a, b) => b.savedAt - a.savedAt); }
    catch { $('mkBoxes').innerHTML = '<div class="hint">Saving isn\'t available in this browser.</div>'; return; }
    const box = $('mkBoxes'); box.innerHTML = items.length ? '' : '<div class="hint">No saved boxes yet.</div>';
    for (const it of items) {
      const d = document.createElement('div'); d.className = 'mk-box';
      const nArt = (it.art?.out?.length || 0) + (it.art?.in?.length || 0);
      d.innerHTML = `<div class="thumb">${it.thumb || ''}</div><div class="meta"><b></b><small></small></div><button class="btn">Open</button><button class="btn" title="Delete">✕</button>`;
      d.querySelector('b').textContent = it.name;
      d.querySelector('small').textContent = `${STYLES[it.style]?.code || it.style} · ${new Date(it.savedAt).toLocaleDateString()}${nArt ? ` · ${nArt} art` : ''}`;
      const [openB, delB] = d.querySelectorAll('button');
      openB.onclick = () => openBox(it);
      delB.onclick = async () => { if (confirm(`Delete "${it.name}"?`)) { await deleteItem('boxes', it.id); renderBoxes(); } };
      box.appendChild(d);
    }
  }
  async function saveBox() {
    if (!st.gen) return;
    const name = $('mkBoxName').value.trim() || `${STYLES[st.style].label} ${fileBase()}`;
    let id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try { const same = (await listItems('boxes')).find(b => b.name === name); if (same) id = same.id; } catch {}
    const o = opts();
    const item = {
      id, name, savedAt: Date.now(), style: st.style, params: { ...st.params }, mode: st.mode, units: st.units, boardUnit: st.boardUnit,
      opts: Object.fromEntries(Object.keys(OPT_IDS).map(k => [k, o[k]])), art: art.serialize(),
      thumb: toSVG(st.gen, { dims: false, labels: false, bleed: false, safe: false }).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" height="100%"').replace(/stroke-width="0.25"/g, 'stroke-width="1.5"'),
    };
    try { await putItem('boxes', item); showMsg(''); $('mkBoxName').value = name; renderBoxes(); }
    catch (e) { showMsg(`Could not save: ${e.message}`); }
  }
  async function openBox(it) {
    if (!STYLES[it.style]) return showMsg('This box style is not in this version of the app.');
    Object.assign(st, { style: it.style, params: { ...defaults(it.style), ...it.params }, mode: it.mode || 'inside', units: it.units || 'mm', boardUnit: it.boardUnit || 'mm', typed: true, zoom: null });
    for (const [k, id] of Object.entries(OPT_IDS)) if (it.opts && k in it.opts) { if ($(id).type === 'checkbox') $(id).checked = !!it.opts[k]; else $(id).value = it.opts[k]; }
    setSeg('mkUnits', 'u', st.units); setSeg('mkMode', 'm', st.mode); $('mkBoxName').value = it.name;
    renderStyleCard(); renderParams(); update();
    await art.load(it.art);
    if (art.has()) { setView('art'); render(); }
  }
  $('mkBoxSave').onclick = saveBox;
  // keyboard (after the artwork editor, so its arrow-key nudge wins when art is selected)
  setTimeout(() => document.addEventListener('keydown', e => {
    if ($('makerApp').hidden || !$('mkGallery').hidden || e.defaultPrevented) return;
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveBox(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const views = { 1: 'dieline', 2: 'art', 3: 'sheet' };
    if (e.key === '+' || e.key === '=' || e.key === 'PageUp') { e.preventDefault(); zoomBy(1); }
    else if (e.key === '-' || e.key === '_' || e.key === 'PageDown') { e.preventDefault(); zoomBy(-1); }
    else if (e.key === '0') zoomBy(0);
    else if (views[e.key]) { setView(views[e.key]); st.zoom = null; render(); }
    else if (e.key.startsWith('Arrow')) {
      const s = e.shiftKey ? 200 : 60, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
      e.preventDefault(); $('mkCanvas').scrollBy(d[0], d[1]);
    }
  }));
  $('mkBoxName').onkeydown = e => e.key === 'Enter' && saveBox();
  renderBoxes();

  const setView = v => { st.view = v; document.querySelectorAll('#mkView button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); };
  art = initArtwork({
    get: () => ({ gen: st.gen, opts: opts(), name: fileBase() }),
    isActive: () => st.view === 'art',
    showArt: () => { if (st.view !== 'art') { setView('art'); st.zoom = null; } render(); },
    redraw: () => st.view === 'art' && render(),
    msg: showMsg,
  });

  renderStyleCard(); renderParams(); update();
  return { refresh: () => { st.zoom = null; render(); }, selectStyle };
}
