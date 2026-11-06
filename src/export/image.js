// Still image export from the current camera view.
export async function exportImage(viewer, { w, h, transparent, fit = false }) {
  const canvas = viewer.beginOffscreen(w, h, { transparent });
  try {
    if (fit) viewer.fitToFrame();
    viewer.renderNow();
    return await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not create the image.'))), 'image/png'));
  } finally { viewer.endOffscreen(); }
}
