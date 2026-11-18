// Dieline Maker · Artwork view: place artwork on the outside and inside of the dieline, then send it
// to 3D or export a print PDF (art clipped to the bleed + die line).
import { layerAffine, layerCorners, fitLayer, layerDpi, rasterMm, history, snapshot, restore, mirrorX } from '../artwork/art-core.js';
import { buildArtPdf } from '../artwork/art-pdf.js';
import { prepare, toPDF } from '../generator/writers.js';
import { bleedOutline } from '../generator/guides.js';
import { loadLogo } from '../personalise/logo.js';
import { download } from '../export/download.js';

const $ = id => document.getElementById(id);
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const toBytes = c => new Promise(r => c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f4 = v => +(+v).toFixed(4);

/**
 * ctx: { get: () => ({ gen, opts, name }), isActive: () => bool, showArt: () => void, redraw: () => void, msg: text => void }
 */
export function initArtwork(ctx) {
  let sides = { out: [], in: [] }, side = 'out', sel = null, seq = 0, pending = null;
  const byId = new Map(), hist = history();
  const list = () => sides[side];
  const page = () => { const { gen, opts } = ctx.get(); return prepare(gen, opts).page; };
  const box = () => {                                   // the dieline bounds, as seen on the current side
    const b = ctx.get().gen.dieline.bbox, p = page();
    return side === 'out' ? { x: b.minx, y: b.miny, w: b.w, h: b.h } : { x: mirrorX(b.maxx, p), y: b.miny, w: b.w, h: b.h };
  };

  // ---------- undo / redo ----------
  const begin = () => { if (!pending) pending = snapshot(sides); };
  const commit = () => { if (pending && pending !== snapshot(sides)) hist.push(pending); pending = null; buttons(); };
  const change = fn => { begin(); fn(); commit(); refresh(); };
  const undoRedo = which => {
    const s = hist[which](snapshot(sides)); if (!s) return;
    sides = restore(s, byId); if (sel && !list().includes(sel)) sel = null; refresh();
  };

  // ---------- loading ----------
  async function makeLayer(file) {
    const lower = file.name.toLowerCase(), bytes = new Uint8Array(await file.arrayBuffer());
    const L = { id: `L${++seq}`, name: file.name, s: 1, rot: 0, fx: false, fy: false, op: 1, visible: true, bytes, mime: file.type };
    if (/\.(pdf|ai|svg)$/.test(lower) || /pdf|svg/.test(file.type)) {
      const lg = await loadLogo(file);
      Object.assign(L, { kind: lg.kind === 'pdf' ? 'pdf' : 'svg', w: lg.srcMm.w, h: lg.srcMm.h, render: lg.render });
      L.img = await lg.render(Math.min(2400, Math.max(600, Math.round(lg.srcMm.w / 25.4 * 150))));
    } else {
      const bmp = await createImageBitmap(new Blob([bytes], { type: file.type || 'image/png' }));
      Object.assign(L, { kind: 'raster', img: bmp, pxW: bmp.width, ...rasterMm(bmp.width, bmp.height) });
    }
    L.url = L.kind === 'raster' ? URL.createObjectURL(file) : URL.createObjectURL(new Blob([await toBytes(L.img)], { type: 'image/png' }));
    return L;
  }
  async function addFile(file) {
    const L = await makeLayer(file), b = box();
    const placed = list().length ? fitLayer(L, { x: b.x + b.w * 0.3, y: b.y + b.h * 0.3, w: b.w * 0.4, h: b.h * 0.4 }, 'contain') : fitLayer(L, b, 'cover');
    Object.assign(L, placed); byId.set(L.id, L);
    change(() => list().push(L)); sel = L; refresh(); ctx.showArt();
  }

  // ---------- drawing on the dieline (svg string in, svg string out) ----------
  function decorate(svg) {
    if (!ctx.get().gen) return svg;
    const p = page(), { gen, opts } = ctx.get();
    const head = svg.slice(0, svg.indexOf('>', svg.indexOf('<svg')) + 1), body = svg.slice(head.length, svg.lastIndexOf('</svg>'));
    const flip = `matrix(-1 0 0 1 ${f4(2 * p.x + p.w)} 0)`;
    const clip = (opts.bleed ? prepare(gen, opts).bleed : bleedOutline(gen.dieline.pieces, 0));
    const img = L => L.visible === false ? '' : `<image href="${L.url}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" opacity="${L.op}" transform="matrix(${layerAffine(L).map(f4).join(' ')})"/>`;
    const imgs = list().map(img).join('');
    const pts = poly => poly.map(q => q.map(f4).join(',')).join(' ');
    const selLine = sel && list().includes(sel) ? `<polygon points="${pts(layerCorners(sel))}" fill="none" stroke="#2f7cf6" stroke-width="${f4(p.w / 600)}" stroke-dasharray="${f4(p.w / 150)} ${f4(p.w / 300)}"/>` : '';
    return head +
      `<defs><clipPath id="arClip"><g${side === 'in' ? ` transform="${flip}"` : ''}>${clip.map(q => `<polygon points="${pts(q)}"/>`).join('')}</g></clipPath></defs>` +
      `<g opacity="0.22">${imgs}</g><g clip-path="url(#arClip)">${imgs}</g>` +
      (side === 'in' ? `<g transform="${flip}">${body}</g>` : body) + selLine + '</svg>';
  }

  // ---------- composite images for 3D ----------
  function composite(which) {
    const layers = sides[which].filter(L => L.visible !== false && L.op > 0);
    if (!layers.length) return null;
    const p = page(), k = Math.min(4096 / p.w, 4096 / p.h, 10), c = canvasOf(p.w * k, p.h * k), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
    for (const L of layers) {
      const m = layerAffine(L);
      g.save(); g.globalAlpha = L.op;
      g.setTransform(k * m[0], k * m[1], k * m[2], k * m[3], k * (m[4] - p.x), k * (m[5] - p.y));
      g.drawImage(L.img, 0, 0, 1, 1); g.restore();
    }
    return c;
  }

  // ---------- print PDF ----------
  async function asset(L) {
    if (L.kind === 'pdf') return { kind: 'pdf', bytes: L.bytes };
    if (L.kind === 'raster' && /png/.test(L.mime)) return { kind: 'png', bytes: L.bytes };
    if (L.kind === 'raster' && /jpe?g/.test(L.mime)) return { kind: 'jpg', bytes: L.bytes };
    if (L.kind === 'raster') { const c = canvasOf(L.img.width, L.img.height); c.getContext('2d').drawImage(L.img, 0, 0); return { kind: 'png', bytes: await toBytes(c) }; }
    const px = Math.min(8000, Math.max(300, Math.round(L.w * L.s / 25.4 * 300)));   // SVG: 300 dpi at its placed size
    return { kind: 'png', bytes: await toBytes(await L.render(px)) };
  }
  async function printPdf() {
    const { gen, opts, name } = ctx.get(); if (!gen) return;
    if (!sides.out.length && !sides.in.length) return ctx.msg('Add artwork first.');
    ctx.msg('Making the print PDF…');
    try {
      const P = prepare(gen, opts), bleed = opts.bleed ? P.bleed : bleedOutline(gen.dieline.pieces, 0);
      const bytes = await buildArtPdf({ page: P.page, bleed, dielinePdf: toPDF(gen, opts), sides, asset, title: `${name} artwork` });
      download(new Blob([bytes], { type: 'application/pdf' }), `${name}_artwork.pdf`); ctx.msg('');
    } catch (e) { ctx.msg(`Could not make the PDF: ${e.message}`); }
  }

  // ---------- panel ----------
  function buttons() { $('arUndo').disabled = !hist.canUndo; $('arRedo').disabled = !hist.canRedo; }
  function renderList() {
    const box = $('arLayers'); box.innerHTML = '';
    if (!list().length) { box.innerHTML = `<div class="hint">No ${side === 'out' ? 'outside' : 'inside'} artwork yet. Add a PNG, JPG, SVG or PDF.</div>`; }
    [...list()].reverse().forEach(L => {
      const row = document.createElement('div'); row.className = 'ar-row' + (L === sel ? ' on' : '');
      const dpi = L.kind === 'raster' ? Math.round(layerDpi(L, L.pxW)) : null;
      const q = dpi === null ? '<span class="ok">vector</span>' : `<span class="${dpi < 150 ? 'bad' : dpi < 250 ? 'mid' : 'ok'}">${dpi} dpi</span>`;
      row.innerHTML = `<input type="checkbox" ${L.visible !== false ? 'checked' : ''} title="Show"><span class="nm">${esc(L.name)}</span>${q}<button title="Up">▲</button><button title="Down">▼</button><button title="Delete">✕</button>`;
      const [vis, , , up, dn, del] = row.children;
      row.onclick = e => { if (e.target === row || e.target.classList.contains('nm')) { sel = L; refresh(); } };
      vis.onchange = () => change(() => (L.visible = vis.checked));
      up.onclick = () => change(() => { const a = list(), i = a.indexOf(L); if (i < a.length - 1) [a[i], a[i + 1]] = [a[i + 1], a[i]]; });
      dn.onclick = () => change(() => { const a = list(), i = a.indexOf(L); if (i > 0) [a[i], a[i - 1]] = [a[i - 1], a[i]]; });
      del.onclick = () => change(() => { list().splice(list().indexOf(L), 1); if (sel === L) sel = null; });
      box.appendChild(row);
    });
  }
  const fields = { arX: ['x', 1], arY: ['y', 1], arScale: ['s', 100], arRot: ['rot', 1], arOp: ['op', 100] };
  function renderSel() {
    $('arSel').hidden = !sel;
    if (!sel) return;
    for (const [id, [k, f]] of Object.entries(fields)) if (document.activeElement !== $(id)) $(id).value = f4(sel[k] * f);
  }
  function refresh() { renderList(); renderSel(); buttons(); ctx.redraw(); }

  for (const [id, [k, f]] of Object.entries(fields)) {
    $(id).oninput = () => { const v = parseFloat($(id).value); if (!sel || !Number.isFinite(v)) return; begin(); sel[k] = k === 'op' ? Math.min(1, Math.max(0, v / f)) : k === 's' ? Math.max(0.0001, v / f) : v / f; ctx.redraw(); };
    $(id).onchange = () => { commit(); refresh(); };
  }
  const act = (id, fn) => ($(id).onclick = () => sel && change(() => fn(sel)));
  act('arRotL', L => (L.rot = ((L.rot || 0) - 90) % 360));
  act('arRotR', L => (L.rot = ((L.rot || 0) + 90) % 360));
  act('arFlipH', L => (L.fx = !L.fx));
  act('arFlipV', L => (L.fy = !L.fy));
  act('arCover', L => Object.assign(L, fitLayer(L, box(), 'cover')));
  act('arContain', L => Object.assign(L, fitLayer(L, box(), 'contain')));
  act('arWidth', L => Object.assign(L, fitLayer(L, box(), 'width')));
  act('arCentre', L => { const b = box(); L.x = b.x + b.w / 2; L.y = b.y + b.h / 2; });
  $('arUndo').onclick = () => undoRedo('undo');
  $('arRedo').onclick = () => undoRedo('redo');
  $('arFile').onchange = async e => { for (const f of e.target.files) { try { await addFile(f); } catch (err) { ctx.msg(`Could not read ${f.name}: ${err.message}`); } } e.target.value = ''; };
  $('arPdf').onclick = printPdf;
  document.querySelectorAll('#arSide button').forEach(b => (b.onclick = () => {
    side = b.dataset.side; sel = null;
    document.querySelectorAll('#arSide button').forEach(x => x.classList.toggle('on', x === b));
    refresh(); ctx.showArt();
  }));

  // ---------- mouse on the dieline: click to select, drag to move, Alt+wheel to scale, Shift+wheel to rotate ----------
  const paper = $('mkPaper');
  const toMm = e => { const svg = paper.querySelector('svg'); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; };
  const inside = (P, c) => { let s = 0; for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4], z = (b[0] - a[0]) * (P[1] - a[1]) - (b[1] - a[1]) * (P[0] - a[0]); if (z !== 0) { if (s && Math.sign(z) !== s) return false; s = Math.sign(z); } } return true; };
  let drag = null;
  paper.addEventListener('pointerdown', e => {
    if (!ctx.isActive() || !paper.querySelector('svg')) return;
    const P = toMm(e), hit = [...list()].reverse().find(L => L.visible !== false && inside(P, layerCorners(L)));
    sel = hit || null; refresh();
    if (hit) { begin(); drag = { P, x: hit.x, y: hit.y }; paper.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  paper.addEventListener('pointermove', e => {
    if (!drag || !sel) return;
    const P = toMm(e); sel.x = drag.x + P[0] - drag.P[0]; sel.y = drag.y + P[1] - drag.P[1]; ctx.redraw(); renderSel();
  });
  const end = () => { if (drag) { drag = null; commit(); refresh(); } };
  paper.addEventListener('pointerup', end); paper.addEventListener('pointercancel', end);
  paper.addEventListener('wheel', e => {
    if (!ctx.isActive() || !sel || !(e.altKey || e.shiftKey)) return;
    e.preventDefault(); begin();
    if (e.altKey) sel.s *= e.deltaY < 0 ? 1.03 : 1 / 1.03; else sel.rot = (sel.rot || 0) + (e.deltaY < 0 ? 1 : -1);
    clearTimeout(paper._arT); paper._arT = setTimeout(commit, 300);
    ctx.redraw(); renderSel();
  }, { passive: false });
  document.addEventListener('keydown', e => {
    if (!ctx.isActive() || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    const z = e.ctrlKey || e.metaKey;
    if (z && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 'redo' : 'undo'); return; }
    if (z && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo('redo'); return; }
    if (!sel) return;
    const step = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); change(() => { sel.x += mv[0]; sel.y += mv[1]; }); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); change(() => { list().splice(list().indexOf(sel), 1); sel = null; }); }
  });

  // ---------- save / reopen (with the box in "My boxes") ----------
  const PLACE = ['name', 'kind', 'mime', 'bytes', 'w', 'h', 'x', 'y', 's', 'rot', 'fx', 'fy', 'op', 'visible'];
  const serialize = () => Object.fromEntries(Object.entries(sides).map(([k, a]) => [k, a.map(L => Object.fromEntries(PLACE.map(q => [q, L[q]])))]));
  async function load(data) {
    const next = { out: [], in: [] };
    for (const k of ['out', 'in']) for (const p of data?.[k] || []) {
      const L = await makeLayer(new File([p.bytes], p.name, { type: p.mime || '' }));
      Object.assign(L, { x: p.x, y: p.y, s: p.s, rot: p.rot, fx: p.fx, fy: p.fy, op: p.op, visible: p.visible, w: p.w, h: p.h });
      byId.set(L.id, L); next[k].push(L);
    }
    sides = next; sel = null; pending = null; hist.push(snapshot(sides)); refresh();
  }
  const clear = () => { sides = { out: [], in: [] }; sel = null; refresh(); };

  refresh();
  return {
    decorate, serialize, load, clear,
    has: () => sides.out.length + sides.in.length > 0,
    /** For "Fold in 3D": { exterior, interior } canvases laid out on the dieline page (interior as seen from inside). */
    forFold: () => ({ exterior: composite('out'), interior: composite('in') }),
  };
}
