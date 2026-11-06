// Turns each sidebar <h2> section into a section that opens and closes on click.
// Remembers which sections were open (per browser).
export function makeCollapsible(aside, { closed = [] } = {}) {
  const KEY = 'rea-fold-sections';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage off */ }
  for (const h of [...aside.querySelectorAll(':scope > h2')]) {
    const name = h.firstChild.textContent.replace(/^\d+\.\s*/, '').trim();
    const det = document.createElement('details'); det.className = 'sec';
    const sum = document.createElement('summary');
    h.replaceWith(det); sum.appendChild(h); det.appendChild(sum);
    while (det.nextSibling && !(det.nextSibling.nodeType === 1 && /^(H2|DETAILS)$/.test(det.nextSibling.tagName))) det.appendChild(det.nextSibling);
    det.open = saved[name] ?? !closed.includes(name);
    det.addEventListener('toggle', () => {
      saved[name] = det.open;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage off */ }
    });
  }
}
