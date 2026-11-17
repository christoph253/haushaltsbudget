// Zwei Speicher mit gleicher Schnittstelle: IndexedDB (Gerät) und Arbeitsspeicher (Tests).
import { STORES } from './daten.js';

export class SpeicherImArbeitsspeicher {
  constructor() { this.d = Object.fromEntries(STORES.map((s) => [s, new Map()])); }
  async get(s, id) { const v = this.d[s].get(id); return v ? structuredClone(v) : undefined; }
  async alle(s) { return [...this.d[s].values()].map((v) => structuredClone(v)); }
  async put(s, obj) { this.d[s].set(obj.id ?? obj.key, structuredClone(obj)); }
  async loesche(s, id) { this.d[s].delete(id); }
  async leeren(s) { this.d[s].clear(); }
}

const DB_NAME = 'haushaltsbudget';
const DB_VERSION = 1;

export class IndexedDbSpeicher {
  async oeffnen() {
    this.db = await new Promise((ok, fehler) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'monate' ? 'key' : 'id' });
        }
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fehler(r.error);
    });
    return this;
  }
  _tx(s, modus, fn) {
    return new Promise((ok, fehler) => {
      const tx = this.db.transaction(s, modus);
      const req = fn(tx.objectStore(s));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => fehler(tx.error);
      tx.onabort = () => fehler(tx.error || new Error('Abgebrochen'));
    });
  }
  get(s, id) { return this._tx(s, 'readonly', (st) => st.get(id)); }
  alle(s) { return this._tx(s, 'readonly', (st) => st.getAll()); }
  put(s, obj) { return this._tx(s, 'readwrite', (st) => st.put(obj)).then(() => undefined); }
  loesche(s, id) { return this._tx(s, 'readwrite', (st) => st.delete(id)).then(() => undefined); }
  leeren(s) { return this._tx(s, 'readwrite', (st) => st.clear()).then(() => undefined); }
}
