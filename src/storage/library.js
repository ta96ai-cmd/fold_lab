// Saved dielines in the browser (IndexedDB): the SVG, colour roles and artwork.
const DB = 'rea-fold-lab', STORE = 'dielines';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      for (const name of [STORE, 'templates', 'jobs']) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn, store = STORE) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), out = fn(t.objectStore(store));
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

// ---------- generic stores (Personalise templates and job versions) ----------
export const putItem = (store, item) => tx('readwrite', s => s.put(item), store);
export const getItem = (store, id) => tx('readonly', s => s.get(id), store);
export const listItems = async store => (await tx('readonly', s => s.getAll(), store)) || [];
export const deleteItem = (store, id) => tx('readwrite', s => s.delete(id), store);
