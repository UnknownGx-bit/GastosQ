const DB_NAME = 'migasto-db-v1'; const STORE = 'expenses'; const FALLBACK_KEY = 'migasto-expenses-fallback-v1';

class ExpenseDatabase {
  constructor() { this.db = null; this.fallback = false; }
  async open() {
    if (!('indexedDB' in globalThis)) { this.fallback = true; return; }
    try {
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) {
            const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp');
          }
        };
        request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('La base de datos está bloqueada por otra ventana.'));
      });
    } catch { this.fallback = true; }
  }
  fallbackAll() { try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]'); } catch { return []; } }
  saveFallback(items) { localStorage.setItem(FALLBACK_KEY, JSON.stringify(items)); }
  request(mode, action) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, mode); const request = action(tx.objectStore(STORE)); let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || request.error);
      tx.onabort = () => reject(tx.error || new Error('La operación fue cancelada.'));
    });
  }
  async getAll() { const items = this.fallback ? this.fallbackAll() : await this.request('readonly', store => store.getAll()); return items.sort((a, b) => b.timestamp - a.timestamp); }
  async put(expense) { if (this.fallback) { const items = this.fallbackAll().filter(item => item.id !== expense.id); items.push(expense); this.saveFallback(items); return; } await this.request('readwrite', store => store.put(expense)); }
  async remove(id) { if (this.fallback) { this.saveFallback(this.fallbackAll().filter(item => item.id !== id)); return; } await this.request('readwrite', store => store.delete(id)); }
  async clear() { if (this.fallback) { this.saveFallback([]); return; } await this.request('readwrite', store => store.clear()); }
  async bulkPut(items) {
    if (this.fallback) { this.saveFallback(items); return; }
    await new Promise((resolve, reject) => { const tx = this.db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); items.forEach(item => store.put(item)); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
}
export const database = new ExpenseDatabase();
