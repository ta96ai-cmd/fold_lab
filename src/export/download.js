export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const safeName = s => (s || 'box').replace(/\.svg$/i, '').replace(/[^\w-]+/g, '_').slice(0, 60);
