import './styles.css';
import { buildModel, defaultRole } from './engine/fold-engine.js';
import { anglesAt } from './engine/fold-animation.js';
import { SAMPLE_SVG } from './engine/sample-dieline.js';
import { extractStrokes, toSegments, toHex } from './svg/parse-svg.js';
import { createViewer } from './viewer/viewer.js';
import { drawFlat, highlightHinge } from './ui/flat-preview.js';

const $ = id => document.getElementById(id);
const state = { name: '', items: [], colors: [], model: null, angles: [], flip: false };
const viewer = createViewer($('view'));

// ---------- loading ----------
function loadSVG(text, name) {
  try {
    const items = extractStrokes(text, $('svghost'));
    if (!items.length) throw new Error('No stroked lines found in this SVG.');
    const groups = new Map();
    for (const it of items) {
      if (!groups.has(it.key)) groups.set(it.key, { key: it.key, rgb: it.rgb, dashed: it.dashed, count: 0, role: defaultRole(...it.rgb, it.dashed) });
      groups.get(it.key).count++;
    }
    Object.assign(state, { name, items, colors: [...groups.values()].sort((a, b) => b.count - a.count) });
    $('anim').textContent = 'Fold box';
    renderColors(); rebuild();
  } catch (e) { showMsg(e.message, 'err'); console.error(e); }
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
    viewer.setModel(m); applyAngles();
    drawFlat($('flat'), m, segs); renderHinges(m);
  } catch (e) {
    state.model = null; viewer.clear(); $('hinges').innerHTML = ''; $('flat').innerHTML = '';
    $('stats').textContent = `${count('crease')} crease · ${count('cut')} cut`;
    showMsg(e.message, 'err');
  }
}

function showMsg(t, cls) { const m = $('msg'); m.textContent = t; m.className = 'msg' + (t ? ' ' + cls : ''); }
function applyAngles() { viewer.setAngles(state.angles, state.flip); }

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
    r.oninput = () => { state.angles[h.id] = +r.value; v.textContent = r.value + '°'; applyAngles(); };
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

// ---------- fold animation ----------
let anim = null;
const stopAnim = () => { if (anim) cancelAnimationFrame(anim); anim = null; };
$('anim').onclick = () => {
  const m = state.model; if (!m) return; stopAnim();
  const folding = !state.angles.every(a => a >= 89);
  const from = state.angles.slice(), target = folding ? 90 : 0, dur = 2600, t0 = performance.now();
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
$('all').oninput = e => setAll(+e.target.value);
$('reset').onclick = () => { stopAnim(); setAll(0); $('anim').textContent = 'Fold box'; };
$('flip').onchange = e => { state.flip = e.target.checked; applyAngles(); };

// ---------- file input ----------
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
const readFile = f => { if (!f) return; const r = new FileReader(); r.onload = () => loadSVG(r.result, f.name); r.readAsText(f); };
file.onchange = () => readFile(file.files[0]);
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
document.addEventListener('dragleave', e => { e.preventDefault(); if (e.target === document.documentElement) drop.classList.remove('over'); });
document.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });
$('sample').onclick = () => loadSVG(SAMPLE_SVG, 'sample_tuck_box.svg');

loadSVG(SAMPLE_SVG, 'sample_tuck_box.svg');
window.__fold = { state, setAll, viewer }; // debug / tests
