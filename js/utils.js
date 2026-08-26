export const APP = Object.freeze({ name: 'MiGasto', version: '1.4.0', maxDescription: 100 });

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const monthYear = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
const fullDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });

export const Money = {
  format(cents = 0) { return currency.format((Number.isFinite(cents) ? cents : 0) / 100); },
  parse(value) {
    let raw = String(value ?? '').trim().replace(/[$\s]/g, '');
    if (!raw || /[-+e]/i.test(raw)) return null;
    const lastComma = raw.lastIndexOf(','); const lastDot = raw.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      const decimal = Math.max(lastComma, lastDot);
      raw = raw.slice(0, decimal).replace(/[.,]/g, '') + '.' + raw.slice(decimal + 1);
    } else if (lastComma >= 0) {
      const parts = raw.split(','); raw = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join('');
    } else if ((raw.match(/\./g) || []).length > 1) {
      const parts = raw.split('.'); const decimals = parts.pop(); raw = `${parts.join('')}.${decimals}`;
    }
    if (!/^\d+(\.\d{0,2})?$/.test(raw)) return null;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) return null;
    return Math.round(amount * 100);
  }
};

function dateAt(value = new Date()) { return value instanceof Date ? new Date(value) : new Date(value); }
export const Dates = {
  startDay(value = new Date()) { const d = dateAt(value); d.setHours(0, 0, 0, 0); return d; },
  endDay(value = new Date()) { const d = dateAt(value); d.setHours(23, 59, 59, 999); return d; },
  startWeek(value = new Date()) { const d = this.startDay(value); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; },
  startMonth(value = new Date()) { const d = this.startDay(value); d.setDate(1); return d; },
  startYear(value = new Date()) { const d = this.startDay(value); d.setMonth(0, 1); return d; },
  key(value) { const d = dateAt(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  fromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); },
  monthLabel(value) { const text = monthYear.format(dateAt(value)); return text.charAt(0).toUpperCase() + text.slice(1); },
  full(value) { return fullDate.format(dateAt(value)); },
  short(value) { return shortDate.format(dateAt(value)).replace('.', ''); },
  time(value) { return time.format(dateAt(value)); },
  relative(value) {
    const d = dateAt(value); const key = this.key(d); const today = this.key(new Date());
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const label = key === today ? 'Hoy' : key === this.key(yesterday) ? 'Ayer' : this.short(d);
    return `${label} · ${this.time(d)}`;
  },
  greeting() { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; },
  range(kind, value = new Date()) {
    const base = dateAt(value); let start; let end;
    if (kind === 'today') { start = this.startDay(base); end = this.endDay(base); }
    else if (kind === 'week') { start = this.startWeek(base); end = new Date(start); end.setDate(end.getDate() + 6); end = this.endDay(end); }
    else if (kind === 'year') { start = this.startYear(base); end = new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999); }
    else { start = this.startMonth(base); end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999); }
    return { start: start.getTime(), end: end.getTime() };
  },
  previousRange(kind, value = new Date()) {
    const d = dateAt(value);
    if (kind === 'today') d.setDate(d.getDate() - 1); else if (kind === 'week') d.setDate(d.getDate() - 7); else if (kind === 'year') d.setFullYear(d.getFullYear() - 1); else d.setMonth(d.getMonth() - 1);
    return this.range(kind, d);
  },
  periodLabel(kind, value = new Date()) {
    const range = this.range(kind, value);
    if (kind === 'today') return this.full(range.start);
    if (kind === 'week') return `${this.short(range.start)} – ${this.short(range.end)}`;
    return kind === 'year' ? String(new Date(value).getFullYear()) : this.monthLabel(value);
  },
  toLocalInput(timestamp) { const d = new Date(timestamp); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
};

export function uid() { return globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
export function normalizeDescription(value) { return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, APP.maxDescription); }
export function inRange(expense, range) { return expense.timestamp >= range.start && expense.timestamp <= range.end; }
