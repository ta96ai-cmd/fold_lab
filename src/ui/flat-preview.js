// 2D dieline map: numbered panels, cut/crease lines, hinge highlight.

export function drawFlat(svg, m, segs) {
  const b = m.bbox, pad = m.diag * 0.03;
  svg.setAttribute('viewBox', `${b.minx - pad} ${-b.maxy - pad} ${b.maxx - b.minx + 2 * pad} ${b.maxy - b.miny + 2 * pad}`);
  const sw = m.diag * 0.004, fs = m.diag * 0.035;
  let h = '';
  for (const f of m.faces) {
    if (m.depth[f.id] < 0) continue;
    h += `<polygon points="${f.poly.map(p => `${p.x},${-p.y}`).join(' ')}" fill="${f.id === m.root ? '#c8f43c22' : '#ffffff0d'}"/>`;
  }
  for (const s of [...segs].sort((a, b) => (a.type === 'crease') - (b.type === 'crease'))) { // creases drawn on top
    const crease = s.type === 'crease';
    h += `<line x1="${s.a.x}" y1="${-s.a.y}" x2="${s.b.x}" y2="${-s.b.y}" stroke="${crease ? '#2ee6ff' : '#ff3cf0'}" stroke-width="${sw}"${crease ? ` stroke-dasharray="${sw * 3} ${sw * 2}"` : ''}/>`;
  }
  m.faces.forEach((f, i) => {
    if (m.depth[f.id] >= 0) h += `<text x="${f.centroid.x}" y="${-f.centroid.y}" font-size="${fs}" fill="#bbb" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>`;
  });
  h += `<line class="hl" stroke="#c8f43c" stroke-width="${sw * 4}" stroke-linecap="round" visibility="hidden"/>`;
  svg.innerHTML = h;
}

export function highlightHinge(svg, h) {
  const l = svg.querySelector('.hl'); if (!l) return;
  if (!h) { l.setAttribute('visibility', 'hidden'); return; }
  l.setAttribute('x1', h.a.x); l.setAttribute('y1', -h.a.y);
  l.setAttribute('x2', h.b.x); l.setAttribute('y2', -h.b.y);
  l.setAttribute('visibility', 'visible');
}
