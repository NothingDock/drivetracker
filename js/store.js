// スマホに旅を保存しておく場所（IndexedDB）。使えない環境では何も保存せずに動く
const DB = 'drive-track', STORE = 'kv';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

export const get = k => tx('readonly', s => s.get(k)).catch(() => undefined);
export const set = (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {});
export const keys = () => tx('readonly', s => s.getAllKeys()).catch(() => []);
export const clear = () => tx('readwrite', s => s.clear()).catch(() => {});
