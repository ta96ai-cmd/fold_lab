// Saved dielines in the browser (IndexedDB): the SVG, colour roles and artwork.
const DB = 'rea-fold-lab', STORE = 'dielines';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(out && 'result' in out ? out.result : undefined); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}

/** entry: { name, svg, roles: {colourKey: role}, exterior?: Blob, interior?: Blob, intInside, thumb?: string } */
export async function saveDieline(entry) {
  const item = { ...entry, id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now() };
  await tx('readwrite', s => s.put(item));
  return item;
}
export const listDielines = async () => ((await tx('readonly', s => s.getAll())) || []).sort((a, b) => b.savedAt - a.savedAt);
export const getDieline = id => tx('readonly', s => s.get(id));
export const deleteDieline = id => tx('readwrite', s => s.delete(id));
