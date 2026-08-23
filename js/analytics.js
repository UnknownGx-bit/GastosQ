import { Dates, inRange } from './utils.js';

export const Analytics = {
  filter(expenses, range) { return expenses.filter(item => inRange(item, range)); },
  total(expenses) { return expenses.reduce((sum, item) => sum + item.amountCents, 0); },
  summary(expenses, kind, value = new Date()) {
    const range = Dates.range(kind, value); const items = this.filter(expenses, range); const total = this.total(items); const grouped = this.byDay(items);
    const peak = [...grouped.values()].sort((a, b) => this.total(b) - this.total(a))[0] || [];
    const elapsedEnd = Math.min(range.end, Date.now()); const elapsedDays = Math.max(1, Math.floor((elapsedEnd - range.start) / 86400000) + 1);
    return { range, items, total, count: items.length, average: Math.round(total / elapsedDays), peak, peakTotal: this.total(peak) };
  },
  byDay(expenses) {
    const groups = new Map(); expenses.forEach(item => { const key = Dates.key(item.timestamp); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
    return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  },
  byDescription(expenses) {
    const groups = new Map(); expenses.forEach(item => { const key = item.description.toLocaleLowerCase('es-MX'); const current = groups.get(key) || { label: item.description, total: 0, count: 0 }; current.total += item.amountCents; current.count += 1; groups.set(key, current); });
    return [...groups.values()].sort((a, b) => b.total - a.total);
  },
  comparison(expenses, kind, value = new Date()) {
    const current = this.total(this.filter(expenses, Dates.range(kind, value))); const previous = this.total(this.filter(expenses, Dates.previousRange(kind, value)));
    if (!previous) return null;
    return { percent: Math.abs(((current - previous) / previous) * 100), direction: current > previous ? 'más' : current < previous ? 'menos' : 'igual' };
  }
};
