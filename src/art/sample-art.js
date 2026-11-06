// Generates an original sample artwork that fits any dieline, using the detected panels.
// Returns canvases covering the SVG artboard (same area the user's own artwork must cover).

export function makeSampleArt(model, artboard) {
  const { x: ax, y: ay, w: aw, h: ah } = artboard;
  const s = 2048 / Math.max(aw, ah);
  const W = Math.round(aw * s), H = Math.round(ah * s);
  const px = p => [(p.x - ax) * s, (-p.y - ay) * s];

  // ----- exterior -----
  const ext = document.createElement('canvas'); ext.width = W; ext.height = H;
  const g = ext.getContext('2d');
  g.fillStyle = '#17463a'; g.fillRect(0, 0, W, H);
  // diagonal diamond lattice
  const step = Math.max(W, H) / 46;
  g.fillStyle = '#d8b25a';
  for (let y = -step; y < H + step; y += step) for (let x = -step; x < W + step; x += step) {
    const ox = ((y / step) % 2) * step / 2;
    g.beginPath(); g.moveTo(x + ox, y - step * 0.12); g.lineTo(x + ox + step * 0.12, y);
    g.lineTo(x + ox, y + step * 0.12); g.lineTo(x + ox - step * 0.12, y); g.fill();
  }

  const faces = model.faces.filter(f => model.depth[f.id] >= 0);
  const maxA = Math.max(...faces.map(f => f.area));
  const rootY = model.faces[model.root].centroid.y;
  for (const f of faces) {
    const pts = f.poly.map(px);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
    const cx = bx + bw / 2, cy = by + bh / 2;
    g.save();
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.clip();
    const ratio = f.area / maxA;
    if (ratio > 0.95) {
      // main panels: band + label
      g.fillStyle = '#f3ead6'; g.fillRect(bx, by + bh * 0.06, bw, bh * 0.05); g.fillRect(bx, by + bh * 0.89, bw, bh * 0.05);
      const lw = bw * 0.78, lh = bh * 0.42, lx = cx - lw / 2, ly = cy - lh / 2;
      g.fillStyle = '#f3ead6'; g.fillRect(lx, ly, lw, lh);
      g.strokeStyle = '#b4372f'; g.lineWidth = lw * 0.02; g.strokeRect(lx + lw * 0.04, ly + lw * 0.04, lw * 0.92, lh - lw * 0.08);
      g.fillStyle = '#17463a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `600 ${lw * 0.09}px Georgia, serif`; g.fillText('HIMALAYAN', cx, ly + lh * 0.22);
      g.fillStyle = '#b4372f'; g.font = `700 ${lw * 0.26}px Georgia, serif`; g.fillText('CHAI', cx, ly + lh * 0.5);
      g.fillStyle = '#17463a'; g.font = `500 ${lw * 0.065}px system-ui, sans-serif`; g.fillText('MASALA BLEND · 100 g', cx, ly + lh * 0.8);
    } else if (ratio > 0.5) {
      // side panels: vertical name
      g.fillStyle = '#b4372f'; g.fillRect(bx, by, bw, bh);
      g.translate(cx, cy); g.rotate(-Math.PI / 2);
      g.fillStyle = '#f3ead6'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.min(bw * 0.38, bh * 0.1)}px Georgia, serif`; g.fillText('HIMALAYAN CHAI', 0, 0);
    } else if (ratio > 0.25) {
      // lids: emblem
      const r = Math.min(bw, bh) * 0.3;
      g.fillStyle = '#b4372f'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f3ead6'; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, Math.PI * 2); g.fill();
      // a lid above the main panels folds over toward the front, so turn its text to read from the front
      g.translate(cx, cy); if (f.centroid.y > rootY) g.rotate(Math.PI);
      g.fillStyle = '#17463a'; g.font = `700 ${r * 0.7}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HC', 0, r * 0.04);
    }
    g.restore();
  }

  // ----- interior: plain kraft board -----
  const int = document.createElement('canvas'); int.width = W; int.height = H;
  const k = int.getContext('2d');
  k.fillStyle = '#cfae7f'; k.fillRect(0, 0, W, H);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  k.strokeStyle = 'rgba(90,60,30,0.12)'; k.lineWidth = 1.5;
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * W, y = rnd() * H, l = 6 + rnd() * 18, a = rnd() * Math.PI;
    k.beginPath(); k.moveTo(x, y); k.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); k.stroke();
  }
  return { exterior: ext, interior: int };
}
