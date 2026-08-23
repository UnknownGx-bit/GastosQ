import { APP, Dates } from './utils.js';

function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export const Backup = {
  exportJSON(expenses) { const payload = { app: APP.name, version: 1, exportedAt: new Date().toISOString(), expenses }; download(`migasto-respaldo-${Dates.key(new Date())}.json`, JSON.stringify(payload, null, 2), 'application/json'); },
  exportCSV(expenses) {
    const escape = value => `"${String(value).replace(/"/g, '""')}"`; const rows = [['Fecha', 'Hora', 'Descripción', 'Monto'], ...expenses.map(item => [Dates.full(item.timestamp), Dates.time(item.timestamp), item.description, (item.amountCents / 100).toFixed(2)])];
    download(`migasto-${Dates.key(new Date())}.csv`, '\ufeff' + rows.map(row => row.map(escape).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  },
  validate(payload) {
    if (!payload || !Array.isArray(payload.expenses)) throw new Error('El archivo no contiene un respaldo de MiGasto.');
    const ids = new Set(); const expenses = payload.expenses.map(item => {
      if (!item || typeof item.id !== 'string' || ids.has(item.id) || !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0 || !Number.isFinite(item.timestamp) || typeof item.description !== 'string' || !item.description.trim()) throw new Error('El respaldo contiene movimientos no válidos.');
      ids.add(item.id); return { id: item.id, amountCents: item.amountCents, description: item.description.trim().slice(0, 100), timestamp: item.timestamp, createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(item.timestamp).toISOString() };
    }); return expenses;
  }
};
