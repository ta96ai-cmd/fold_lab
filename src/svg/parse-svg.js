// Reads an SVG dieline in the browser and returns stroked line groups.
// Output points are in root SVG user units, y flipped up (y-up) for the fold engine.

const NS = 'http://www.w3.org/2000/svg';

export function parseColor(str) {
  const m = str.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  return m ? [+m[1], +m[2], +m[3]].map(v => Math.round(v)) : null;
}

export const toHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** Split a path "d" string into polylines (element-local coords). Curves are sampled. */
export function pathSubpaths(d, tmp) {
  let i = 0; const s = d;
  const ws = () => { while (i < s.length && /[\s,]/.test(s[i])) i++; };
  const num = () => {
    ws(); const m = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/.exec(s.slice(i));
    if (!m) throw new Error('Bad path data'); i += m[0].length; return +m[0];
  };
  const flag = () => { ws(); const c = s[i++]; if (c !== '0' && c !== '1') throw new Error('Bad arc flag'); return +c; };
  const subs = []; let cur = [0, 0], start = [0, 0], poly = null, cmd = null, lastCtrl = null, lastCmd = '';
  const sample = (dstr, n) => {
    tmp.setAttribute('d', `M${cur[0]} ${cur[1]} ${dstr}`);
    const L = tmp.getTotalLength(), pts = [];
    for (let k = 1; k <= n; k++) { const p = tmp.getPointAtLength(L * k / n); pts.push([p.x, p.y]); }
    return pts;
  };
  const ensure = () => { if (!poly) { poly = [cur.slice()]; subs.push(poly); } };
  while (true) {
    ws(); if (i >= s.length) break;
    if (/[a-zA-Z]/.test(s[i])) cmd = s[i++];
    else if (!cmd) throw new Error('Bad path data');
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z';
    const C = cmd.toUpperCase();
    const ox = rel ? cur[0] : 0, oy = rel ? cur[1] : 0;
    if (C === 'Z') { if (poly) poly.push(start.slice()); cur = start.slice(); poly = null; lastCtrl = null; lastCmd = 'Z'; continue; }
    if (C === 'M') {
      const x = num() + ox, y = num() + oy; cur = [x, y]; start = [x, y];
      poly = [cur.slice()]; subs.push(poly); cmd = rel ? 'l' : 'L'; lastCtrl = null; lastCmd = 'M'; continue;
    }
    ensure();
    if (C === 'L') { cur = [num() + ox, num() + oy]; poly.push(cur.slice()); lastCtrl = null; }
    else if (C === 'H') { cur = [num() + ox, cur[1]]; poly.push(cur.slice()); lastCtrl = null; }
    else if (C === 'V') { cur = [cur[0], num() + oy]; poly.push(cur.slice()); lastCtrl = null; }
    else if (C === 'C' || C === 'S') {
      const c1 = C === 'C' ? [num() + ox, num() + oy]
        : (lastCtrl && /[CS]/.test(lastCmd)) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur.slice();
      const c2 = [num() + ox, num() + oy], e = [num() + ox, num() + oy];
      poly.push(...sample(`C${c1} ${c2} ${e}`, 20)); poly[poly.length - 1] = e.slice();
      cur = e; lastCtrl = c2; lastCmd = 'C'; continue;
    }
    else if (C === 'Q' || C === 'T') {
      const c1 = C === 'Q' ? [num() + ox, num() + oy]
        : (lastCtrl && /[QT]/.test(lastCmd)) ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur.slice();
      const e = [num() + ox, num() + oy];
      poly.push(...sample(`Q${c1} ${e}`, 16)); poly[poly.length - 1] = e.slice();
      cur = e; lastCtrl = c1; lastCmd = 'Q'; continue;
    }
    else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), la = flag(), sw = flag(), e = [num() + ox, num() + oy];
      poly.push(...sample(`A${rx} ${ry} ${rot} ${la} ${sw} ${e}`, 24)); poly[poly.length - 1] = e.slice();
      cur = e; lastCtrl = null;
    }
    else throw new Error('Unsupported path command ' + cmd);
    lastCmd = C;
  }
  return subs.filter(p => p.length > 1);
}

/**
 * Parse SVG text. Needs a hidden, laid-out host element (not display:none).
 * Returns { items: [{ key, rgb, dashed, polys: [[{x,y}...]] }], artboard: {x,y,w,h} }
 * The artboard (viewBox, in SVG user units) is the area an artwork image must cover.
 */
export function extractStrokes(text, host) {
  host.innerHTML = text;
  const svg = host.querySelector('svg');
  if (!svg) throw new Error('This file is not an SVG.');
  host.querySelectorAll('script').forEach(n => n.remove());
  const tmp = document.createElementNS(NS, 'path'); svg.appendChild(tmp);
  const rootInv = svg.getScreenCTM().inverse();
  const vb = svg.viewBox.baseVal;
  const artboard = vb && vb.width > 0 && vb.height > 0
    ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height }
    : { x: 0, y: 0, w: svg.width.baseVal.value || 1000, h: svg.height.baseVal.value || 1000 };
  artboard.mmPerUnit = mmPerUnit(svg.getAttribute('width'), artboard.w);
  // 3D hints written by the Dieline Maker: which panel faces the camera / is the floor
  const rootAttr = (svg.getAttribute('data-rea-root') || '').split(/[\s,]+/).map(Number);
  if (rootAttr.length === 2 && rootAttr.every(Number.isFinite)) artboard.rootPoint = { x: rootAttr[0], y: -rootAttr[1] };
  artboard.floor = svg.getAttribute('data-rea-floor') === '1';
  const out = [];
  svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse').forEach(el => {
    if (el === tmp || el.closest('defs,clipPath,mask,symbol,pattern,marker,[data-rea-ignore]')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const rgb = parseColor(cs.stroke || '');
    if (!rgb || cs.stroke === 'none') return;
    const dashed = !!cs.strokeDasharray && cs.strokeDasharray !== 'none' && cs.strokeDasharray !== '0';
    let polys = [];
    const tag = el.tagName.toLowerCase();
    if (tag === 'line') polys = [[[el.x1.baseVal.value, el.y1.baseVal.value], [el.x2.baseVal.value, el.y2.baseVal.value]]];
    else if (tag === 'polyline' || tag === 'polygon') {
      const p = Array.from(el.points, q => [q.x, q.y]); if (tag === 'polygon' && p.length) p.push(p[0]); polys = [p];
    } else if (tag === 'rect') {
      const x = el.x.baseVal.value, y = el.y.baseVal.value, w = el.width.baseVal.value, h = el.height.baseVal.value;
      polys = [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
    } else if (tag === 'circle' || tag === 'ellipse') {
      const L = el.getTotalLength(), p = [];
      for (let k = 0; k <= 48; k++) { const q = el.getPointAtLength(L * k / 48); p.push([q.x, q.y]); }
      polys = [p];
    } else if (tag === 'path') polys = pathSubpaths(el.getAttribute('d') || '', tmp);
    const M = rootInv.multiply(el.getScreenCTM());
    polys = polys.map(p => p.map(([x, y]) => { const q = new DOMPoint(x, y).matrixTransform(M); return { x: q.x, y: -q.y }; }));
    const fold = el.hasAttribute('data-fold') ? parseFloat(el.getAttribute('data-fold')) : undefined;
    out.push({ key: toHex(rgb) + (dashed ? '·dashed' : ''), rgb, dashed, polys, fold, hinge: el.getAttribute('data-hinge') || undefined });
  });
  host.innerHTML = '';
  return { items: out, artboard };
}

const MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
/** mm per SVG user unit, from the root width attribute (e.g. "230mm") and the viewBox width. */
export function mmPerUnit(widthAttr, vbWidth) {
  const m = /^\s*([\d.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/i.exec(widthAttr || '');
  if (!m || !vbWidth) return 25.4 / 96;
  return (+m[1] * MM[(m[2] || '').toLowerCase()]) / vbWidth;
}

/** Turn stroke groups + colour roles into engine segments. */
export function toSegments(items, roleByKey) {
  const segs = [];
  for (const it of items) {
    const r = roleByKey.get(it.key); if (!r || r === 'ignore') continue;
    for (const p of it.polys) for (let k = 0; k < p.length - 1; k++) segs.push({ a: p[k], b: p[k + 1], type: r, fold: it.fold, role: it.hinge });
  }
  return segs;
}
