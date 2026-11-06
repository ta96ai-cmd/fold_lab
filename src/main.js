import './styles.css';
import { buildModel, defaultRole } from './engine/fold-engine.js';
import { anglesAt } from './engine/fold-animation.js';
import { presetAngles, findLid, lidSwing } from './engine/presets.js';
import { SAMPLE_SVG } from './engine/sample-dieline.js';
import { extractStrokes, toSegments, toHex } from './svg/parse-svg.js';
import { createViewer } from './viewer/viewer.js';
import { drawFlat, highlightHinge } from './ui/flat-preview.js';
import { makeSampleArt } from './art/sample-art.js';

const $ = id => document.getElementById(id);
const state = {
  name: '', items: [], artboard: null, colors: [], model: null, angles: [], flip: false,
  art: { exterior: null, interior: null, extName: '', intName: '', intInside: true },
};
const viewer = createViewer($('view'));

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
    Object.assign(state, { name, items, artboard, colors: [...groups.values()].sort((a, b) => b.count - a.count) });
    $('anim').textContent = 'Fold box';
    if (state.art.extName === 'sample exterior') Object.assign(state.art, { exterior: null, interior: null }); // sample art belongs to the old dieline
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
    const m = buildModel(segs);
    state.model = m; state.angles = m.hinges.map(() => 0);
    $('all').value = 0; $('allv').textContent = '0°';
    $('stats').textContent = `${count('crease')} crease · ${count('cut')} cut · ${m.stats.panels} panels · ${m.stats.hinges} hinges`;
    if (m.stats.hinges === 0) showMsg('Found panels but no hinges. Set your fold-line colour to “Crease”.', 'warn');
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
document.querySelectorAll('[data-move]').forEach(b => (b.onclick = () => {
  const m = state.model; if (!m) return;
  const closed = presetAngles(m, 'closed');
  const lid = $('lidMove').checked ? findLid(m) : null;
  const start = () => {
    document.querySelectorAll('.move').forEach(x => x.classList.toggle('on', x === b));
    if (lid) { // frame the shot around the fully open lid, so it never leaves the picture
      const s = lidSwing(0.5);
      state.angles[lid.lid.id] = s.lid; lid.tucks.forEach(k => (state.angles[k.id] = s.tuck));
      applyAngles({ recenter: false });
    }
    viewer.playMove(b.dataset.move, {
      duration: 6500,
      onFrame: t => {
        if (!lid) return;
        const s = lidSwing(t);
        state.angles[lid.lid.id] = s.lid; lid.tucks.forEach(k => (state.angles[k.id] = s.tuck));
        applyAngles({ recenter: false });
      },
      onEnd: () => { document.querySelectorAll('.move').forEach(x => x.classList.remove('on')); syncHingeUI(); },
    });
  };
  const isClosed = state.angles.every((a, i) => Math.abs(a - closed[i]) < 0.5);
  if (isClosed) start(); else animateTo(closed, () => { $('all').value = 90; $('allv').textContent = '90°'; $('anim').textContent = 'Unfold box'; start(); });
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
function readImage(file, slot) {
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    state.art[slot] = img; state.art[slot === 'exterior' ? 'extName' : 'intName'] = file.name;
    if (state.artboard) {
      const a = img.width / img.height, b = state.artboard.w / state.artboard.h;
      if (Math.abs(a / b - 1) > 0.03) showMsg(`${file.name} is ${img.width}×${img.height}; its shape doesn't match the dieline artboard, so the art will be stretched. Export it at the same artboard size as the SVG.`, 'warn');
    }
    applyArt();
  };
  img.onerror = () => showMsg(`Couldn't read ${file.name} as an image.`, 'err');
  img.src = url;
}
$('extFile').onchange = e => readImage(e.target.files[0], 'exterior');
$('intFile').onchange = e => readImage(e.target.files[0], 'interior');
$('sampleArt').onclick = () => {
  if (!state.model) return;
  const art = makeSampleArt(state.model, state.artboard);
  Object.assign(state.art, { exterior: art.exterior, interior: art.interior, extName: 'sample exterior', intName: 'sample kraft', intInside: true });
  $('intInside').checked = true;
  applyArt();
};
$('clearArt').onclick = () => { Object.assign(state.art, { exterior: null, interior: null }); applyArt(); };
$('intInside').onchange = e => { state.art.intInside = e.target.checked; applyArt(); };

// ---------- file input ----------
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
const readFile = f => {
  if (!f) return;
  if (/^image\/(png|jpe?g|webp)$/.test(f.type)) return readImage(f, 'exterior'); // dropped artwork
  const r = new FileReader(); r.onload = () => loadSVG(r.result, f.name); r.readAsText(f);
};
file.onchange = () => readFile(file.files[0]);
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
document.addEventListener('dragleave', e => { e.preventDefault(); if (e.target === document.documentElement) drop.classList.remove('over'); });
document.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
$('sample').onclick = () => loadSVG(SAMPLE_SVG, 'sample_tuck_box.svg');

loadSVG(SAMPLE_SVG, 'sample_tuck_box.svg');
window.__fold = { state, setAll, viewer }; // debug / tests
