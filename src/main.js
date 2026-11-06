import './styles.css';
import { buildModel, defaultRole } from './engine/fold-engine.js';
import { anglesAt } from './engine/fold-animation.js';
import { presetAngles, findLid, lidSwing } from './engine/presets.js';
import { SAMPLE_SVG } from './engine/sample-dieline.js';
import { extractStrokes, toSegments, toHex } from './svg/parse-svg.js';
import { createViewer } from './viewer/viewer.js';
import { drawFlat, highlightHinge } from './ui/flat-preview.js';
import { makeSampleArt } from './art/sample-art.js';
import { CAMERA_MOVES } from './viewer/camera-moves.js';
import { IMAGE_SIZES, VIDEO_SIZES } from './export/sizes.js';
import { exportImage } from './export/image.js';
import { exportVideo, videoSupported } from './export/video.js';
import { download, safeName } from './export/download.js';
import { saveDieline, listDielines, getDieline, deleteDieline } from './storage/library.js';
import { BOX_STYLES, DEFAULT_BOX, generateTuckBox } from './generator/tuck-box.js';
import { exportGLB } from './export/glb.js';
import { makeCollapsible } from './ui/collapsible.js';
import { pdfToDielineSVG } from './svg/parse-pdf.js';

const $ = id => document.getElementById(id);
const state = {
  name: '', svg: '', items: [], artboard: null, colors: [], model: null, angles: [], flip: false, move: 'orbit',
  art: { exterior: null, interior: null, extName: '', intName: '', extBlob: null, intBlob: null, intInside: true },
};
const viewer = createViewer($('view'));
makeCollapsible(document.querySelector('aside'), { closed: ['Export', 'My dielines', 'Hinges'] });

// ---------- dieline ----------
function loadSVG(text, name) {
  try {
    const { items, artboard } = extractStrokes(text, $('svghost'));
    if (!items.length) throw new Error('No stroked lines found in this SVG.');
    const groups = new Map();
    for (const it of items) {
      if (!groups.has(it.key)) groups.set(it.key, { key: it.key, rgb: it.rgb, dashed: it.dashed, count: 0, role: defaultRole(...it.rgb, it.dashed) });
      groups.get(it.key).count++;
    }
    Object.assign(state, { name, svg: text, items, artboard, colors: [...groups.values()].sort((a, b) => b.count - a.count) });
    $('anim').textContent = 'Fold box';
    if (state.art.extName === 'sample exterior') Object.assign(state.art, { exterior: null, interior: null, extBlob: null, intBlob: null }); // sample art belongs to the old dieline
    renderColors(); rebuild();
    return true;
  } catch (e) { showMsg(e.message, 'err'); console.error(e); return false; }
}

function rebuild() {
  showMsg('');
  const segs = toSegments(state.items, new Map(state.colors.map(c => [c.key, c.role])));
  const count = role => state.colors.filter(c => c.role === role).reduce((s, c) => s + c.count, 0);
  $('fname').textContent = state.name;
  try {
    let m = buildModel(segs);
    if (m.stats.hinges === 0) { // panels outlined one by one, folds not marked: use shared edges as folds
      const auto = buildModel(segs, { autoFolds: true });
      if (auto.stats.hinges > 0) m = auto;
    }
    state.model = m; state.angles = m.hinges.map(() => 0);
    $('all').value = 0; $('allv').textContent = '0°';
    const mm = v => Math.round(v * (state.artboard?.mmPerUnit || 0.2646));
    $('stats').textContent = `${count('crease')} crease · ${count('cut')} cut · ${m.stats.panels} panels · ${m.stats.hinges} hinges · sheet ${mm(m.bbox.maxx - m.bbox.minx)} × ${mm(m.bbox.maxy - m.bbox.miny)} mm`;
    if (m.stats.hinges === 0) showMsg('Found panels but no hinges. Set your fold-line colour to “Crease”.', 'warn');
    else if (m.autoFolds) showMsg('No fold lines found, so every edge shared by two panels is used as a fold. If a flap folds that shouldn’t, set its colours in “SVG line colours”.', 'warn');
    else if (m.stats.loosePanels) showMsg(`${m.stats.loosePanels} closed shape(s) aren't joined to the box by a crease (holes or windows); they are hidden.`, 'warn');
    viewer.setModel(m, state.artboard); applyArt(); applyAngles();
    drawFlat($('flat'), m, segs); renderHinges(m);
  } catch (e) {
    state.model = null; viewer.clear(); $('hinges').innerHTML = ''; $('flat').innerHTML = '';
    $('stats').textContent = `${count('crease')} crease · ${count('cut')} cut`;
    showMsg(e.message, 'err');
  }
}

function showMsg(t, cls) { const m = $('msg'); m.textContent = t; m.className = 'msg' + (t ? ' ' + cls : ''); }
function applyAngles(opts) { viewer.setAngles(state.angles, state.flip, opts); }

// ---------- sidebar ----------
function renderColors() {
  const box = $('colors'); box.innerHTML = '';
  for (const c of state.colors) {
    const d = document.createElement('div'); d.className = 'color';
    d.innerHTML = `<div class="sw" style="background:${toHex(c.rgb)}"></div>
      <div class="meta"><div>${c.key}</div><div>${c.count} element${c.count > 1 ? 's' : ''}</div></div>
      <select><option value="cut">Cut</option><option value="crease">Crease</option><option value="ignore">Ignore</option></select>`;
    const sel = d.querySelector('select'); sel.value = c.role;
    sel.onchange = () => { c.role = sel.value; rebuild(); };
    box.appendChild(d);
  }
}

function renderHinges(m) {
  const box = $('hinges'); box.innerHTML = '';
  $('hcount').textContent = `(${m.hinges.length})`;
  for (const h of [...m.hinges].sort((a, b) => a.depth - b.depth)) {
    const d = document.createElement('div'); d.className = 'hinge';
    d.innerHTML = `<div class="lbl">Panel ${h.parent + 1} → ${h.child + 1}<span>level ${h.depth}</span></div>
      <div class="slider"><input type="range" min="-180" max="180" value="0"><div class="val">0°</div></div>`;
    const r = d.querySelector('input'), v = d.querySelector('.val');
    h.ui = { r, v };
    r.oninput = () => { stopAll(); state.angles[h.id] = +r.value; v.textContent = r.value + '°'; applyAngles(); };
    d.onmouseenter = () => highlightHinge($('flat'), h);
    d.onmouseleave = () => highlightHinge($('flat'), null);
    box.appendChild(d);
  }
}

function syncHingeUI() {
  state.model?.hinges.forEach(h => {
    if (!h.ui) return;
    const a = Math.round(state.angles[h.id]); h.ui.r.value = a; h.ui.v.textContent = a + '°';
  });
}

function setAll(a) {
  if (!state.model) return;
  state.angles = state.model.hinges.map(() => a);
  $('all').value = a; $('allv').textContent = Math.round(a) + '°';
  applyAngles(); syncHingeUI();
}

// ---------- fold animation + presets ----------
let anim = null;
const stopAnim = () => { if (anim) cancelAnimationFrame(anim); anim = null; };
function stopAll() { stopAnim(); viewer.stopMove(); }

function animateTo(target, done) {
  const m = state.model; if (!m) return; stopAll();
  const from = state.angles.slice(), folding = target.reduce((s, a) => s + a, 0) >= from.reduce((s, a) => s + a, 0);
  const dur = 1800, t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    const out = from.slice();
    const lerped = anglesAt(m.hinges, from.map(() => 0), 1, t, folding); // 0..1 per hinge
    m.hinges.forEach(h => (out[h.id] = from[h.id] + (target[h.id] - from[h.id]) * lerped[h.id]));
    state.angles = out; applyAngles(); syncHingeUI();
    if (t < 1) anim = requestAnimationFrame(step); else { anim = null; done && done(); }
  };
  anim = requestAnimationFrame(step);
}

$('anim').onclick = () => {
  const m = state.model; if (!m) return;
  const folding = !state.angles.every(a => a >= 89);
  const from = state.angles.slice(), target = folding ? 90 : 0, dur = 2600, t0 = performance.now();
  stopAll();
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    state.angles = anglesAt(m.hinges, from, target, t, folding);
    applyAngles(); syncHingeUI();
    const all = folding ? 90 * t : 90 * (1 - t);
    $('all').value = all; $('allv').textContent = Math.round(all) + '°';
    if (t < 1) anim = requestAnimationFrame(step);
    else { anim = null; $('anim').textContent = folding ? 'Unfold box' : 'Fold box'; }
  };
  anim = requestAnimationFrame(step);
};
$('all').oninput = e => { stopAll(); setAll(+e.target.value); };
document.querySelectorAll('[data-preset]').forEach(b => (b.onclick = () => {
  if (!state.model) return;
  const name = b.dataset.preset;
  animateTo(presetAngles(state.model, name), () => {
    $('anim').textContent = name === 'closed' ? 'Unfold box' : 'Fold box';
    const all = { flat: 0, half: 45, closed: 90, lidOpen: 90 }[name];
    $('all').value = all; $('allv').textContent = all + '°';
  });
}));
$('flip').onchange = e => { state.flip = e.target.checked; applyAngles(); };

// ---------- camera moves ----------
for (const [key, mv] of Object.entries(CAMERA_MOVES)) {
  const b = document.createElement('button');
  b.className = 'btn move' + (key === state.move ? ' sel' : ''); b.dataset.move = key; b.textContent = mv.label;
  $('moves').appendChild(b);
}
const setLid = t => {
  const lid = $('lidMove').checked && state.model ? findLid(state.model) : null;
  if (!lid) return;
  const s = lidSwing(t);
  state.angles[lid.lid.id] = s.lid; lid.tucks.forEach(k => (state.angles[k.id] = s.tuck));
  applyAngles({ recenter: false });
};
/** Fold to the closed box (animated) unless it's already closed. */
function ensureClosed(then) {
  const closed = presetAngles(state.model, 'closed');
  if (state.angles.every((a, i) => Math.abs(a - closed[i]) < 0.5)) return then();
  animateTo(closed, () => { $('all').value = 90; $('allv').textContent = '90°'; $('anim').textContent = 'Unfold box'; then(); });
}
document.querySelectorAll('[data-move]').forEach(b => (b.onclick = () => {
  state.move = b.dataset.move;
  document.querySelectorAll('.move').forEach(x => x.classList.toggle('sel', x === b));
  if (!state.model) return;
  ensureClosed(() => {
    document.querySelectorAll('.move').forEach(x => x.classList.toggle('on', x === b));
    setLid(0.5); // frame the shot around the fully open lid, so it never leaves the picture
    viewer.playMove(b.dataset.move, {
      duration: 6500,
      onFrame: setLid,
      onEnd: () => { document.querySelectorAll('.move').forEach(x => x.classList.remove('on')); syncHingeUI(); },
    });
  });
}));
$('view').addEventListener('pointerdown', () => viewer.playing && viewer.stopMove());

// ---------- artwork ----------
function applyArt() { viewer.setArtwork(state.art.exterior, state.art.interior, state.art.intInside); renderArtBoxes(); }
function renderArtBoxes() {
  for (const [box, name, src, label] of [['extBox', 'extName', state.art.exterior, state.art.extName], ['intBox', 'intName', state.art.interior, state.art.intName]]) {
    const el = $(box);
    el.classList.toggle('has', !!src);
    el.style.backgroundImage = src ? `linear-gradient(#0008,#0008), url(${src instanceof HTMLCanvasElement ? src.toDataURL('image/jpeg', 0.5) : src.src})` : '';
    $(name).textContent = src ? label : 'white';
  }
}
function readImage(file, slot, name = file && file.name) {
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    state.art[slot] = img; state.art[slot === 'exterior' ? 'extName' : 'intName'] = name;
    state.art[slot === 'exterior' ? 'extBlob' : 'intBlob'] = file;
    if (state.artboard) {
      const a = img.width / img.height, b = state.artboard.w / state.artboard.h;
      if (Math.abs(a / b - 1) > 0.03) showMsg(`${name} is ${img.width}×${img.height}; its shape doesn't match the dieline artboard, so the art will be stretched. Export it at the same artboard size as the SVG.`, 'warn');
    }
    applyArt();
  };
  img.onerror = () => showMsg(`Couldn't read ${name} as an image.`, 'err');
  img.src = url;
}
$('extFile').onchange = e => readImage(e.target.files[0], 'exterior');
$('intFile').onchange = e => readImage(e.target.files[0], 'interior');
$('sampleArt').onclick = () => {
  if (!state.model) return;
  const art = makeSampleArt(state.model, state.artboard);
  Object.assign(state.art, { exterior: art.exterior, interior: art.interior, extName: 'sample exterior', intName: 'sample kraft', extBlob: null, intBlob: null, intInside: true });
  $('intInside').checked = true;
  applyArt();
};
$('clearArt').onclick = () => { Object.assign(state.art, { exterior: null, interior: null, extBlob: null, intBlob: null }); applyArt(); };
$('intInside').onchange = e => { state.art.intInside = e.target.checked; applyArt(); };

// ---------- export ----------
const fillSelect = (sel, sizes) => { for (const [k, v] of Object.entries(sizes)) sel.add(new Option(v.label, k)); };
fillSelect($('imgSize'), IMAGE_SIZES); fillSelect($('vidSize'), VIDEO_SIZES);
if (!videoSupported()) { $('saveVid').disabled = true; $('saveVid').title = 'Needs the latest Chrome or Edge'; }

$('saveImg').onclick = async () => {
  if (!state.model) return;
  stopAll();
  try {
    const blob = await exportImage(viewer, { ...IMAGE_SIZES[$('imgSize').value], transparent: $('imgClear').checked, fit: $('imgFit').checked });
    download(blob, `${safeName(state.name)}_${$('imgSize').value}.png`);
  } catch (e) { showMsg(e.message, 'err'); }
};

let job = null;
$('saveVid').onclick = () => {
  if (!state.model || job) return;
  stopAll();
  ensureClosed(async () => {
    job = { cancelled: false };
    const sz = VIDEO_SIZES[$('vidSize').value], fps = +$('vidFps').value, seconds = +$('vidLen').value;
    const before = state.angles.slice();
    $('prog').hidden = false; $('saveVid').disabled = true;
    const progress = k => { $('progBar').style.width = (k * 100).toFixed(1) + '%'; $('progTxt').textContent = `Rendering ${Math.round(k * 100)}% · ${CAMERA_MOVES[state.move].label}`; };
    try {
      const blob = await exportVideo(viewer, { move: state.move, w: sz.w, h: sz.h, fps, seconds, setFrame: setLid, onProgress: progress, signal: job });
      download(blob, `${safeName(state.name)}_${state.move}_${sz.w}x${sz.h}_${fps}fps.mp4`);
      $('progTxt').textContent = `Done · ${(blob.size / 1048576).toFixed(1)} MB`;
    } catch (e) {
      if (e.message === 'cancelled') $('progTxt').textContent = 'Cancelled';
      else { showMsg(e.message, 'err'); $('progTxt').textContent = 'Failed'; }
    } finally {
      state.angles = before; applyAngles(); syncHingeUI();
      job = null; $('saveVid').disabled = false;
      setTimeout(() => { if (!job) $('prog').hidden = true; }, 4000);
    }
  });
};
$('cancelVid').onclick = () => { if (job) job.cancelled = true; };

$('saveSvg').onclick = () => { if (state.svg) download(new Blob([state.svg], { type: 'image/svg+xml' }), `${safeName(state.name)}.svg`); };
$('saveGlb').onclick = async () => {
  if (!state.model) return;
  stopAll();
  try { download(await exportGLB(viewer, state.artboard?.mmPerUnit), `${safeName(state.name)}.glb`); }
  catch (e) { showMsg('Could not export the 3D model: ' + e.message, 'err'); }
};

// ---------- dieline generator ----------
for (const [k, v] of Object.entries(BOX_STYLES)) $('gStyle').add(new Option(v.label, k));
const genFields = { L: 'gL', W: 'gW', H: 'gH', t: 'gT', glue: 'gG', tuck: 'gK' };
for (const [k, id] of Object.entries(genFields)) $(id).value = DEFAULT_BOX[k];
$('genToggle').onclick = () => { $('gen').hidden = !$('gen').hidden; };
$('gMake').onclick = () => {
  const p = { style: $('gStyle').value };
  for (const [k, id] of Object.entries(genFields)) p[k] = parseFloat($(id).value);
  try {
    const g = generateTuckBox(p);
    const name = `${p.style.toUpperCase()}_${p.L}x${p.W}x${p.H}.svg`;
    if (loadSVG(g.svg, name)) animateTo(presetAngles(state.model, 'closed'), () => { $('all').value = 90; $('allv').textContent = '90°'; $('anim').textContent = 'Unfold box'; });
  } catch (e) { showMsg(e.message, 'err'); }
};

// ---------- my dielines ----------
const canvasBlob = c => new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
async function renderLib() {
  let items = [];
  try { items = await listDielines(); } catch { $('lib').innerHTML = '<div class="hint">Saving isn\'t available in this browser.</div>'; return; }
  const box = $('lib'); box.innerHTML = items.length ? '' : '<div class="hint">Nothing saved yet.</div>';
  for (const it of items) {
    const d = document.createElement('div'); d.className = 'libitem';
    d.innerHTML = `<img alt=""><div class="meta"><div></div><div>${new Date(it.savedAt).toLocaleString()}</div></div><button class="btn">Open</button><button class="btn">✕</button>`;
    d.querySelector('img').src = it.thumb || '';
    d.querySelector('.meta div').textContent = it.name;
    const [openB, delB] = d.querySelectorAll('button');
    openB.onclick = () => openSaved(it.id);
    delB.onclick = async () => { await deleteDieline(it.id); renderLib(); };
    box.appendChild(d);
  }
}
$('saveLib').onclick = async () => {
  if (!state.model) return;
  const a = state.art;
  try {
    const thumbBlob = await exportImage(viewer, { w: 160, h: 160, transparent: false, fit: true });
    const thumb = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(thumbBlob); });
    await saveDieline({
      name: state.name, svg: state.svg, roles: Object.fromEntries(state.colors.map(c => [c.key, c.role])),
      exterior: a.extBlob || (a.exterior instanceof HTMLCanvasElement ? await canvasBlob(a.exterior) : null),
      interior: a.intBlob || (a.interior instanceof HTMLCanvasElement ? await canvasBlob(a.interior) : null),
      extName: a.exterior ? a.extName : '', intName: a.interior ? a.intName : '', intInside: a.intInside, thumb,
    });
    renderLib();
  } catch (e) { showMsg('Could not save: ' + e.message, 'err'); }
};
async function openSaved(id) {
  const it = await getDieline(id); if (!it) return;
  stopAll();
  Object.assign(state.art, { exterior: null, interior: null, extBlob: null, intBlob: null, intInside: it.intInside ?? true });
  $('intInside').checked = state.art.intInside;
  if (!loadSVG(it.svg, it.name)) return;
  state.colors.forEach(c => { if (it.roles[c.key]) c.role = it.roles[c.key]; });
  renderColors(); rebuild();
  if (it.exterior) readImage(it.exterior, 'exterior', it.extName || 'exterior');
  if (it.interior) readImage(it.interior, 'interior', it.intName || 'interior');
}
renderLib();

// ---------- file input ----------
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
const readFile = async f => {
  if (!f) return;
  if (/^image\/(png|jpe?g|webp)$/.test(f.type)) return readImage(f, 'exterior'); // dropped artwork
  if (/\.(pdf|ai)$/i.test(f.name) || f.type === 'application/pdf') {
    showMsg(`Reading ${f.name}…`, 'warn');
    try {
      const { svg, pages } = await pdfToDielineSVG(await f.arrayBuffer(), f.name);
      if (loadSVG(svg, f.name.replace(/\.(pdf|ai)$/i, '') + ' (from PDF).svg') && pages > 1)
        showMsg(`${f.name} has ${pages} pages; only page 1 was used.`, 'warn');
    } catch (e) { showMsg(e.message, 'err'); console.error(e); }
    return;
  }
  if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') return showMsg(`${f.name}: please use an SVG, PDF or PDF-compatible .ai file.`, 'err');
  const r = new FileReader(); r.onload = () => loadSVG(r.result, f.name); r.readAsText(f);
};
file.onchange = () => readFile(file.files[0]);
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
document.addEventListener('dragleave', e => { e.preventDefault(); if (e.target === document.documentElement) drop.classList.remove('over'); });
document.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
$('sample').onclick = () => loadSVG(SAMPLE_SVG, 'sample_tuck_box.svg');

loadSVG(SAMPLE_SVG, 'sample_tuck_box.svg');
window.__fold = { state, setAll, viewer }; // debug / tests
