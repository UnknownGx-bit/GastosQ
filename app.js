import { database } from './js/db.js';
import { Analytics } from './js/analytics.js';
import { Backup } from './js/backup.js';
import { APP, Dates, Money, normalizeDescription, uid } from './js/utils.js';

function readLimits() {
  try {
    const saved = JSON.parse(localStorage.getItem('migasto-limits-v1') || '{}');
    return { daily: Number.isSafeInteger(saved.daily) && saved.daily > 0 ? saved.daily : 0, weekly: Number.isSafeInteger(saved.weekly) && saved.weekly > 0 ? saved.weekly : 0, monthly: Number.isSafeInteger(saved.monthly) && saved.monthly > 0 ? saved.monthly : 0 };
  } catch { return { daily: 0, weekly: 0, monthly: 0 }; }
}

const app = document.querySelector('#app');
const sheetLayer = document.querySelector('#sheet-layer');
const toastRegion = document.querySelector('#toast-region');
const importInput = document.querySelector('#import-input');
const state = {
  expenses: [], homePeriod: 'month', movementFilter: 'all', search: '', statsPeriod: 'month',
  calendar: new Date(new Date().getFullYear(), new Date().getMonth(), 1), theme: localStorage.getItem('migasto-theme') || 'dark',
  palette: localStorage.getItem('migasto-palette') || 'cobalt', amountsHidden: localStorage.getItem('migasto-hide-amounts-v1') === 'true',
  limits: readLimits(), installPrompt: null, saving: false
};

const PALETTES = [
  { id: 'cobalt', label: 'Cobalto', themeColor: '#244db2' },
  { id: 'aurora', label: 'Aurora', themeColor: '#6239aa' },
  { id: 'jade', label: 'Jade', themeColor: '#087568' },
  { id: 'amber', label: 'Ámbar', themeColor: '#965916' },
  { id: 'cherry', label: 'Cereza', themeColor: '#983652' },
  { id: 'graphite', label: 'Grafito', themeColor: '#3a4663' }
];

if (!PALETTES.some(palette => palette.id === state.palette)) {
  state.palette = PALETTES[0].id;
  localStorage.setItem('migasto-palette', state.palette);
}

const routes = new Set(['inicio', 'movimientos', 'nuevo', 'calendario', 'estadisticas']);
const rawRoute = () => location.hash.replace('#/', '').split('?')[0];
const routeName = () => routes.has(rawRoute()) ? rawRoute() : 'inicio';
const el = (tag, className = '', text = '') => { const item = document.createElement(tag); if (className) item.className = className; if (text !== '') item.textContent = text; return item; };
const icon = name => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; };
const haptic = pattern => { if (navigator.vibrate) navigator.vibrate(pattern); };
const formatMoney = cents => state.amountsHidden ? '$••••••' : Money.format(cents);

function toggleAmounts() {
  state.amountsHidden = !state.amountsHidden;
  localStorage.setItem('migasto-hide-amounts-v1', String(state.amountsHidden));
  haptic(10); render();
}

function limitWarningFor(amountCents) {
  const definitions = [
    { key: 'daily', period: 'today', label: 'diario' },
    { key: 'weekly', period: 'week', label: 'semanal' },
    { key: 'monthly', period: 'month', label: 'mensual' }
  ];
  const warnings = definitions.map(definition => {
    const limit = state.limits[definition.key];
    if (!limit) return null;
    const projected = Analytics.summary(state.expenses, definition.period).total + amountCents;
    return { ...definition, limit, projected, ratio: projected / limit };
  }).filter(item => item && item.ratio >= .8).sort((a, b) => b.ratio - a.ratio);
  const warning = warnings[0];
  if (!warning) return null;
  if (warning.ratio >= 1) return { message: state.amountsHidden ? `Alcanzaste tu límite ${warning.label}.` : `Alcanzaste tu límite ${warning.label}: ${Money.format(warning.projected)}.`, type: 'emergency' };
  return { message: `Alerta: estás cerca de tu límite ${warning.label} (${Math.round(warning.ratio * 100)}%).`, type: 'emergency' };
}

function applyAppearance() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.palette = state.palette;
  const palette = PALETTES.find(item => item.id === state.palette) || PALETTES[0];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.themeColor);
}

function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

async function requestInstall() {
  if (isStandalone()) { toast('MiGasto ya está instalada', 'success'); return; }
  if (!state.installPrompt) { toast('En Chrome abre el menú ⋮ y elige “Instalar aplicación”.', 'info'); return; }
  state.installPrompt.prompt();
  const choice = await state.installPrompt.userChoice;
  state.installPrompt = null;
  toast(choice.outcome === 'accepted' ? 'MiGasto se está instalando' : 'Instalación cancelada', choice.outcome === 'accepted' ? 'success' : 'info');
}

function makeButton(label, className, handler, iconName) {
  const button = el('button', className); button.type = 'button';
  if (iconName) { button.append(icon(iconName)); button.setAttribute('aria-label', label); } button.append(el('span', '', label));
  if (handler) button.addEventListener('click', handler); return button;
}

function pageHeader(title, subtitle, action) {
  const header = el('header', 'page-header'); const copy = el('div');
  if (subtitle) copy.append(el('p', 'eyebrow', subtitle)); copy.append(el('h1', '', title)); header.append(copy);
  if (action) header.append(action); return header;
}

function segmentControl(options, active, onChange, label) {
  const group = el('div', 'segments'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
  options.forEach(([value, text]) => { const button = makeButton(text, value === active ? 'active' : '', () => onChange(value)); button.setAttribute('aria-pressed', String(value === active)); group.append(button); });
  return group;
}

function emptyState(action = true, message = 'Registra tu primera compra para comenzar.') {
  const card = el('div', `empty-state${action ? '' : ' passive'}`); const mark = el('span', 'empty-mark'); mark.append(icon('plus'));
  if (action) card.append(mark); card.append(el('h3', '', 'Todavía no hay gastos'), el('p', '', message));
  if (action) card.append(makeButton('Registrar gasto', 'primary-button', () => go('nuevo'), 'plus'));
  return card;
}

function toast(message, type = 'info') {
  const isAlert = type === 'error' || type === 'emergency';
  const item = el('div', `toast ${type}`); item.setAttribute('role', isAlert ? 'alert' : 'status');
  item.append(icon(type === 'success' ? 'check' : isAlert ? 'close' : 'plus'), el('span', '', message)); toastRegion.append(item);
  setTimeout(() => { item.classList.add('leaving'); setTimeout(() => item.remove(), 220); }, 2400);
}

function go(route) { if (routeName() === route) render(); else location.hash = `#/${route}`; }

function animateMoney(target, cents) {
  if (state.amountsHidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { target.textContent = formatMoney(cents); return; }
  const started = performance.now(); const duration = 420;
  function frame(now) { const p = Math.min(1, (now - started) / duration); const eased = 1 - (1 - p) ** 3; target.textContent = formatMoney(Math.round(cents * eased)); if (p < 1) requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
}

function openSheet(content, label = 'Panel') {
  const wasHidden = sheetLayer.hidden;
  const backdrop = el('button', 'sheet-backdrop'); backdrop.type = 'button'; backdrop.setAttribute('aria-label', 'Cerrar panel');
  const sheet = el('section', 'bottom-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', label);
  const handle = el('span', 'sheet-handle'); const close = makeButton('Cerrar', 'sheet-close', closeSheet, 'close'); close.setAttribute('aria-label', 'Cerrar');
  sheet.append(handle, close, content); sheetLayer.replaceChildren(backdrop, sheet); sheetLayer.hidden = false; document.body.classList.add('sheet-open'); backdrop.addEventListener('click', closeSheet);
  if (wasHidden) history.pushState({ migastoSheet: true }, '', location.href);
  requestAnimationFrame(() => close.focus());
}

function forceCloseSheet() { sheetLayer.hidden = true; sheetLayer.replaceChildren(); document.body.classList.remove('sheet-open'); }
function closeSheet() { if (!sheetLayer.hidden) history.back(); }

function expenseRow(expense) {
  const row = el('button', 'expense-row'); row.type = 'button'; row.setAttribute('aria-label', `${expense.description}, ${state.amountsHidden ? 'importe oculto' : Money.format(expense.amountCents)}`);
  const badge = el('span', 'expense-badge', expense.description.charAt(0).toLocaleUpperCase('es-MX'));
  const copy = el('span', 'expense-copy'); copy.append(el('strong', '', expense.description), el('small', '', Dates.relative(expense.timestamp)));
  row.append(badge, copy, el('span', 'expense-amount', state.amountsHidden ? '$••••••' : `−${Money.format(expense.amountCents)}`)); row.addEventListener('click', () => showExpense(expense.id)); return row;
}

function comparisonText(kind) {
  const comparison = Analytics.comparison(state.expenses, kind);
  if (!comparison) return 'Aún no hay suficientes datos para comparar.';
  if (comparison.direction === 'igual') return 'Gastaste lo mismo que en el periodo anterior.';
  return `Gastaste ${comparison.percent.toFixed(1)}% ${comparison.direction} que en el periodo anterior.`;
}

function renderHome() {
  const summary = Analytics.summary(state.expenses, state.homePeriod); const fragment = document.createDocumentFragment();
  fragment.append(pageHeader(Dates.monthLabel(new Date()), `${Dates.greeting()} Angel`, makeButton('Ajustes', 'icon-button', showSettings, 'settings')));
  const hero = el('section', 'hero'); hero.append(el('p', 'hero-label', state.homePeriod === 'today' ? 'Gastado hoy' : state.homePeriod === 'week' ? 'Gastado esta semana' : 'Gastado este mes'));
  const moneyRow = el('div', 'hero-money-row'); const amount = el('strong', 'hero-amount', formatMoney(0)); const privacy = makeButton(state.amountsHidden ? 'Mostrar importes' : 'Ocultar importes', 'privacy-toggle', toggleAmounts, state.amountsHidden ? 'eye-off' : 'eye'); moneyRow.append(amount, privacy); hero.append(moneyRow, el('span', 'hero-count', `${summary.count} ${summary.count === 1 ? 'movimiento' : 'movimientos'}`));
  hero.append(segmentControl([['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']], state.homePeriod, value => { state.homePeriod = value; render(); }, 'Periodo del resumen'));
  const compare = el('p', 'comparison-note', comparisonText(state.homePeriod)); hero.append(compare); fragment.append(hero);
  requestAnimationFrame(() => animateMoney(amount, summary.total));

  const recent = el('section', 'surface recent-card'); const recentHeader = el('div', 'section-heading'); recentHeader.append(el('h2', '', 'Movimientos recientes')); recent.append(recentHeader);
  if (!summary.items.length) recent.append(emptyState(false)); else summary.items.slice(0, 5).forEach(item => recent.append(expenseRow(item)));
  fragment.append(recent); return fragment;
}

function renderMovementGroups(container, items) {
  container.replaceChildren(); const query = state.search.trim().toLocaleLowerCase('es-MX'); let filtered = items;
  if (query) filtered = filtered.filter(item => item.description.toLocaleLowerCase('es-MX').includes(query));
  if (!filtered.length) { const empty = emptyState(!query, query ? 'No encontramos movimientos con esa descripción.' : 'Registra tu primera compra para comenzar.'); if (query) empty.querySelector('h3').textContent = 'Sin resultados'; container.append(empty); return; }
  Analytics.byDay(filtered).forEach((dayItems, key) => {
    const group = el('section', 'movement-group'); const heading = el('div', 'group-heading'); const date = Dates.fromKey(key);
    const todayKey = Dates.key(new Date()); const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const title = key === todayKey ? 'Hoy' : key === Dates.key(yesterday) ? 'Ayer' : Dates.full(date);
    heading.append(el('h2', '', title), el('span', '', formatMoney(Analytics.total(dayItems)))); group.append(heading); dayItems.forEach(item => group.append(expenseRow(item))); container.append(group);
  });
}

function renderMovements() {
  const fragment = document.createDocumentFragment(); fragment.append(pageHeader('Movimientos', `${state.expenses.length} registros`));
  const searchWrap = el('label', 'search-box'); searchWrap.append(icon('search')); const input = el('input'); input.type = 'search'; input.placeholder = 'Buscar gastos'; input.value = state.search; input.setAttribute('aria-label', 'Buscar gastos por descripción'); searchWrap.append(input); fragment.append(searchWrap);
  const filters = el('div', 'chip-row'); [['all', 'Todos'], ['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']].forEach(([value, label]) => filters.append(makeButton(label, state.movementFilter === value ? 'chip active' : 'chip', () => { state.movementFilter = value; render(); })));
  fragment.append(filters); const results = el('div', 'movement-results'); fragment.append(results);
  const base = state.movementFilter === 'all' ? state.expenses : Analytics.filter(state.expenses, Dates.range(state.movementFilter)); renderMovementGroups(results, base);
  input.addEventListener('input', () => { state.search = input.value; renderMovementGroups(results, base); }); return fragment;
}

function amountField(id, labelText, value = '') {
  const label = el('label', 'field-label', labelText); label.htmlFor = id; const wrap = el('div', 'money-field'); wrap.append(el('span', 'currency-prefix', '$'));
  const input = el('input'); input.id = id; input.name = id; input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.placeholder = '0.0'; input.value = value; input.setAttribute('aria-describedby', `${id}-error`); wrap.append(input); return { label, wrap, input };
}

function renderNew() {
  const fragment = document.createDocumentFragment(); fragment.append(pageHeader('Nuevo gasto', 'Registro rápido'));
  const form = el('form', 'new-expense-form'); form.noValidate = true; const amount = amountField('amount', '¿Cuánto gastaste?');
  const amountError = el('p', 'field-error'); amountError.id = 'amount-error'; const descriptionLabel = el('label', 'field-label', '¿En qué gastaste?'); descriptionLabel.htmlFor = 'description';
  const description = el('input', 'description-input'); description.id = 'description'; description.name = 'description'; description.type = 'text'; description.maxLength = APP.maxDescription; description.placeholder = 'Ej. Supermercado'; description.autocomplete = 'off';
  const descriptionError = el('p', 'field-error'); descriptionError.id = 'description-error'; const submit = makeButton('Guardar gasto', 'primary-button save-button', null, 'check'); submit.type = 'submit';
  const automatic = el('p', 'automatic-date', `Se registrará automáticamente · ${Dates.relative(Date.now())}`);
  form.append(amount.label, amount.wrap, amountError, descriptionLabel, description, descriptionError, submit, automatic); fragment.append(form);
  amount.input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); description.focus(); } });
  description.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (state.saving) return; amountError.textContent = ''; descriptionError.textContent = '';
    const amountCents = Money.parse(amount.input.value); const cleanDescription = normalizeDescription(description.value);
    if (!amountCents) { amountError.textContent = 'Introduce un monto válido mayor que cero.'; amount.input.focus(); return; }
    if (!cleanDescription) { descriptionError.textContent = 'Escribe una descripción.'; description.focus(); return; }
    state.saving = true; submit.disabled = true;
    try {
      const limitWarning = limitWarningFor(amountCents);
      const now = Date.now(); await database.put({ id: uid(), amountCents, description: cleanDescription, timestamp: now, createdAt: new Date(now).toISOString() });
      state.expenses = await database.getAll(); amount.input.value = ''; description.value = ''; haptic(18); toast('Gasto registrado', 'success'); go('inicio');
      if (limitWarning) setTimeout(() => toast(limitWarning.message, limitWarning.type), 350);
    } catch { toast('No se pudo guardar el gasto.', 'error'); } finally { state.saving = false; submit.disabled = false; }
  }); requestAnimationFrame(() => amount.input.focus()); return fragment;
}

function calendarCell(date, month, totals) {
  const button = el('button', 'calendar-day'); button.type = 'button'; if (date.getMonth() !== month) button.classList.add('outside');
  const key = Dates.key(date); const total = totals.get(key) || 0; button.append(el('span', '', String(date.getDate())));
  if (total) { const dot = el('span', 'day-dot'); dot.style.opacity = String(Math.min(.95, .35 + total / Math.max(...totals.values()) * .6)); button.append(dot); }
  if (key === Dates.key(new Date())) button.classList.add('today'); button.setAttribute('aria-label', `${Dates.full(date)}${total ? `, ${state.amountsHidden ? 'importe oculto' : Money.format(total)}` : ', sin gastos'}`); button.addEventListener('click', () => showDay(date)); return button;
}

function renderCalendar() {
  const cursor = state.calendar; const monthRange = Dates.range('month', cursor); const monthItems = Analytics.filter(state.expenses, monthRange); const total = Analytics.total(monthItems); const totals = new Map();
  Analytics.byDay(monthItems).forEach((items, key) => totals.set(key, Analytics.total(items)));
  const fragment = document.createDocumentFragment(); const controls = el('div', 'calendar-controls');
  controls.append(makeButton('Mes anterior', 'icon-button', () => { state.calendar = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); render(); }, 'arrow'), el('h1', '', Dates.monthLabel(cursor)));
  const next = makeButton('Mes siguiente', 'icon-button rotate', () => { state.calendar = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); render(); }, 'arrow'); controls.append(next); fragment.append(controls);
  const summary = el('section', 'calendar-summary surface'); const average = monthItems.length ? Math.round(total / new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) : 0;
  const left = el('div'); left.append(el('span', '', `Total de ${cursor.toLocaleDateString('es-MX', { month: 'long' })}`), el('strong', '', formatMoney(total))); const right = el('div'); right.append(el('span', '', 'Promedio diario'), el('strong', '', formatMoney(average))); summary.append(left, right); fragment.append(summary);
  const calendar = el('section', 'calendar surface'); ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(day => calendar.append(el('span', 'weekday', day)));
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const offset = (first.getDay() + 6) % 7; const start = new Date(first); start.setDate(first.getDate() - offset);
  for (let i = 0; i < 42; i += 1) { const date = new Date(start); date.setDate(start.getDate() + i); calendar.append(calendarCell(date, cursor.getMonth(), totals)); }
  fragment.append(calendar); return fragment;
}

function graphBins(kind, items) {
  const now = new Date(); const bins = [];
  if (kind === 'week') { const start = Dates.startWeek(now); for (let i = 0; i < 7; i += 1) { const date = new Date(start); date.setDate(start.getDate() + i); bins.push({ label: date.toLocaleDateString('es-MX', { weekday: 'narrow' }), date, total: 0 }); } }
  else if (kind === 'year') { for (let i = 0; i < 12; i += 1) bins.push({ label: new Date(now.getFullYear(), i, 1).toLocaleDateString('es-MX', { month: 'narrow' }).replace('.', ''), month: i, total: 0 }); }
  else { const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); for (let i = 1; i <= days; i += 1) bins.push({ label: String(i), date: new Date(now.getFullYear(), now.getMonth(), i), total: 0 }); }
  items.forEach(item => { const d = new Date(item.timestamp); const index = kind === 'year' ? d.getMonth() : kind === 'week' ? Math.round((Dates.startDay(d) - Dates.startWeek(now)) / 86400000) : d.getDate() - 1; if (bins[index]) bins[index].total += item.amountCents; }); return bins;
}

function renderStats() {
  const summary = Analytics.summary(state.expenses, state.statsPeriod); const fragment = document.createDocumentFragment(); fragment.append(pageHeader('Estadísticas', Dates.periodLabel(state.statsPeriod)));
  fragment.append(segmentControl([['week', 'Semana'], ['month', 'Mes'], ['year', 'Año']], state.statsPeriod, value => { state.statsPeriod = value; render(); }, 'Periodo estadístico'));
  const overview = el('section', 'stats-overview'); overview.append(el('p', '', state.statsPeriod === 'week' ? 'Gastado esta semana' : state.statsPeriod === 'month' ? 'Gastado este mes' : 'Gastado este año'));
  const bigTotal = el('strong', '', formatMoney(0)); overview.append(bigTotal, el('span', 'comparison-note', comparisonText(state.statsPeriod))); fragment.append(overview); requestAnimationFrame(() => animateMoney(bigTotal, summary.total));
  if (!summary.items.length) { fragment.append(emptyState()); return fragment; }
  const bins = graphBins(state.statsPeriod, summary.items); const max = Math.max(...bins.map(bin => bin.total), 1); const chart = el('section', 'chart-card surface'); chart.append(el('h2', '', 'Evolución de gastos'));
  const bars = el('div', `bar-chart ${state.statsPeriod}`); bins.forEach((bin, index) => { const wrap = el('div', 'bar-wrap'); const bar = el('button', 'bar'); bar.type = 'button'; bar.style.setProperty('--height', `${Math.max(bin.total ? 8 : 2, (bin.total / max) * 100)}%`); bar.setAttribute('aria-label', `${bin.label}: ${state.amountsHidden ? 'importe oculto' : Money.format(bin.total)}`); const value = el('span', 'bar-value', formatMoney(bin.total)); bar.append(value); bar.addEventListener('click', () => { bars.querySelectorAll('.bar').forEach(item => item.classList.remove('selected')); bar.classList.add('selected'); }); wrap.append(bar); if (state.statsPeriod !== 'month' || index % 5 === 0 || index === bins.length - 1) wrap.append(el('small', '', bin.label)); bars.append(wrap); }); chart.append(bars); fragment.append(chart);
  const metrics = el('section', 'metric-grid'); const peakDate = summary.peak[0] ? Dates.short(summary.peak[0].timestamp) : '—';
  [['Total gastado', formatMoney(summary.total)], ['Promedio diario', formatMoney(summary.average)], ['Día con mayor gasto', `${peakDate} · ${formatMoney(summary.peakTotal)}`], ['Número de gastos', String(summary.count)]].forEach(([label, value]) => { const card = el('article', 'metric-card'); card.append(el('span', '', label), el('strong', '', value)); metrics.append(card); }); fragment.append(metrics);
  const frequent = Analytics.byDescription(summary.items).slice(0, 5); const list = el('section', 'surface frequent'); list.append(el('h2', '', 'Gastos frecuentes'));
  frequent.forEach(item => { const row = el('div', 'frequency-row'); const copy = el('div'); copy.append(el('strong', '', item.label), el('small', '', `${item.count} ${item.count === 1 ? 'vez' : 'veces'}`)); row.append(copy, el('span', '', formatMoney(item.total))); list.append(row); }); fragment.append(list); return fragment;
}

function showDay(date) {
  const items = Analytics.filter(state.expenses, { start: Dates.startDay(date).getTime(), end: Dates.endDay(date).getTime() }); const content = el('div', 'sheet-content');
  content.append(el('p', 'eyebrow', Dates.full(date)), el('h2', '', `Gastado: ${formatMoney(Analytics.total(items))}`), el('p', 'sheet-subtitle', `${items.length} ${items.length === 1 ? 'movimiento' : 'movimientos'}`));
  const list = el('div', 'sheet-list'); if (items.length) items.forEach(item => list.append(expenseRow(item))); else list.append(el('p', 'empty-inline', 'No registraste gastos este día.')); content.append(list); openSheet(content, `Gastos del ${Dates.full(date)}`);
}

function showExpense(id) {
  const expense = state.expenses.find(item => item.id === id); if (!expense) return; const content = el('div', 'sheet-content expense-detail');
  const badge = el('span', 'detail-badge', expense.description.charAt(0).toUpperCase()); content.append(badge, el('p', 'eyebrow', Dates.full(expense.timestamp)), el('h2', '', expense.description), el('strong', 'detail-amount', formatMoney(expense.amountCents)), el('p', 'sheet-subtitle', Dates.time(expense.timestamp)));
  const actions = el('div', 'sheet-actions'); actions.append(makeButton('Editar', 'secondary-button', () => showEdit(expense.id), 'edit'), makeButton('Eliminar', 'danger-button', () => deleteExpense(expense.id), 'trash')); content.append(actions); openSheet(content, 'Detalle del gasto');
}

function showEdit(id) {
  const expense = state.expenses.find(item => item.id === id); if (!expense) return; const content = el('div', 'sheet-content'); content.append(el('h2', '', 'Editar gasto'));
  const form = el('form', 'edit-form'); const amount = amountField('edit-amount', 'Monto', (expense.amountCents / 100).toFixed(2)); const descriptionLabel = el('label', 'field-label', 'Descripción'); descriptionLabel.htmlFor = 'edit-description'; const description = el('input', 'description-input'); description.id = 'edit-description'; description.maxLength = APP.maxDescription; description.value = expense.description;
  const details = el('details', 'advanced-date'); details.append(el('summary', '', 'Cambiar fecha y hora')); const dateLabel = el('label', 'field-label', 'Fecha y hora'); const dateInput = el('input', 'description-input'); dateInput.type = 'datetime-local'; dateInput.value = Dates.toLocalInput(expense.timestamp); dateLabel.append(dateInput); details.append(dateLabel);
  const error = el('p', 'field-error'); const submit = makeButton('Guardar cambios', 'primary-button', null, 'check'); submit.type = 'submit'; form.append(amount.label, amount.wrap, descriptionLabel, description, details, error, submit); content.append(form);
  form.addEventListener('submit', async event => { event.preventDefault(); const amountCents = Money.parse(amount.input.value); const clean = normalizeDescription(description.value); const timestamp = new Date(dateInput.value).getTime(); if (!amountCents || !clean || !Number.isFinite(timestamp)) { error.textContent = 'Revisa el monto, la descripción y la fecha.'; return; } await database.put({ ...expense, amountCents, description: clean, timestamp }); state.expenses = await database.getAll(); closeSheet(); toast('Movimiento actualizado', 'success'); render(); }); openSheet(content, 'Editar gasto');
}

async function deleteExpense(id) {
  try {
    await database.remove(id);
    state.expenses = await database.getAll();
    closeSheet();
    haptic([15, 30, 15]);
    toast('Movimiento eliminado', 'success');
    render();
  } catch {
    toast('No se pudo eliminar el movimiento.', 'error');
  }
}

function settingRow(iconName, title, subtitle, handler, danger = false) {
  const button = makeButton('', `setting-row${danger ? ' danger' : ''}`, handler); button.replaceChildren(); button.append(icon(iconName)); const copy = el('span'); copy.append(el('strong', '', title)); if (subtitle) copy.append(el('small', '', subtitle)); button.append(copy, icon('chevron')); return button;
}

function limitsSection() {
  const section = el('section', 'settings-section'); section.append(el('h3', '', 'Límites de gasto'), el('p', 'settings-hint', 'Recibirás un aviso al usar 80% y al alcanzar el límite. Déjalo vacío para desactivarlo.'));
  const form = el('form', 'limits-form'); form.noValidate = true; const fields = {};
  [['daily', 'Diario'], ['weekly', 'Semanal'], ['monthly', 'Mensual']].forEach(([key, label]) => {
    const field = el('label', 'limit-field'); field.append(el('span', '', label)); const inputWrap = el('span', 'limit-input-wrap'); inputWrap.append(el('span', '', '$'));
    const input = el('input'); input.type = 'text'; input.inputMode = 'decimal'; input.placeholder = 'Sin límite'; input.autocomplete = 'off'; input.value = state.limits[key] ? (state.limits[key] / 100).toFixed(2) : ''; input.setAttribute('aria-label', `Límite ${label.toLocaleLowerCase('es-MX')}`); inputWrap.append(input); field.append(inputWrap); form.append(field); fields[key] = input;
  });
  const error = el('p', 'field-error limit-error'); const save = makeButton('Guardar límites', 'secondary-button limits-save', null, 'check'); save.type = 'submit'; form.append(error, save);
  form.addEventListener('submit', event => {
    event.preventDefault(); const next = {}; let invalid = false;
    Object.entries(fields).forEach(([key, input]) => { const raw = input.value.trim(); if (!raw || /^[0.,]+$/.test(raw)) next[key] = 0; else { const parsed = Money.parse(raw); if (!parsed) invalid = true; else next[key] = parsed; } });
    if (invalid) { error.textContent = 'Revisa los límites. Usa cantidades mayores que cero.'; return; }
    state.limits = next; localStorage.setItem('migasto-limits-v1', JSON.stringify(next)); haptic(10); toast('Límites guardados', 'success'); showSettings();
  });
  section.append(form); return section;
}

function showSettings() {
  const content = el('div', 'sheet-content settings'); content.append(el('h2', '', 'Ajustes'), el('p', 'privacy-note', 'Tus gastos se almacenan únicamente en este dispositivo. Esta aplicación no envía tus datos a ningún servidor.'));
  const data = el('section', 'settings-section'); data.append(el('h3', '', 'Datos'), settingRow('download', 'Exportar datos', 'Respaldo JSON completo', () => { Backup.exportJSON(state.expenses); toast('Respaldo descargado', 'success'); }), settingRow('download', 'Exportar CSV', 'Compatible con hojas de cálculo', () => { Backup.exportCSV(state.expenses); toast('CSV descargado', 'success'); }), settingRow('upload', 'Importar respaldo', 'Combinar o reemplazar datos', () => importInput.click()));
  const appearance = el('section', 'settings-section'); appearance.append(el('h3', '', 'Apariencia')); const theme = el('div', 'setting-choice'); theme.append(el('span', '', 'Tema'), segmentControl([['system', 'Sistema'], ['dark', 'Oscuro']], state.theme, value => { state.theme = value; localStorage.setItem('migasto-theme', value); applyAppearance(); showSettings(); }, 'Tema de apariencia')); appearance.append(theme);
  const paletteLabel = el('p', 'setting-label', 'Color de la aplicación'); const paletteGrid = el('div', 'palette-grid'); paletteGrid.setAttribute('role', 'group'); paletteGrid.setAttribute('aria-label', 'Color de la aplicación');
  PALETTES.forEach(palette => { const option = el('button', `palette-option ${palette.id}${state.palette === palette.id ? ' active' : ''}`); option.type = 'button'; option.setAttribute('aria-pressed', String(state.palette === palette.id)); option.append(el('span', 'palette-swatch'), el('span', '', palette.label)); option.addEventListener('click', () => { state.palette = palette.id; localStorage.setItem('migasto-palette', palette.id); applyAppearance(); showSettings(); }); paletteGrid.append(option); });
  appearance.append(paletteLabel, paletteGrid);
  const about = el('section', 'settings-section'); about.append(el('h3', '', 'Aplicación'), settingRow('download', isStandalone() ? 'MiGasto instalada' : 'Instalar MiGasto', isStandalone() ? 'Se abre como aplicación independiente' : 'Instálala para usarla sin navegador', requestInstall)); const info = el('div', 'app-info'); info.append(el('span', '', APP.name), el('small', '', `Versión ${APP.version} · PWA privada y offline`)); about.append(info);
  const danger = el('section', 'settings-section danger-zone'); danger.append(el('h3', '', 'Zona peligrosa'), settingRow('trash', 'Eliminar todos los datos', 'Requiere confirmación', confirmClear, true)); content.append(data, appearance, limitsSection(), about, danger); openSheet(content, 'Ajustes');
}

function confirmClear() {
  const content = el('div', 'sheet-content confirm-content'); const mark = el('span', 'danger-mark'); mark.append(icon('trash')); content.append(mark, el('h2', '', '¿Eliminar todos tus datos?'), el('p', '', 'Se borrarán todos los movimientos de este dispositivo. Exporta un respaldo si deseas conservarlos.'));
  const actions = el('div', 'sheet-actions'); actions.append(makeButton('Cancelar', 'secondary-button', closeSheet), makeButton('Sí, eliminar todo', 'danger-button', async () => { await database.clear(); state.expenses = []; closeSheet(); haptic([20, 40, 20]); toast('Todos los datos fueron eliminados', 'success'); render(); }, 'trash')); content.append(actions); openSheet(content, 'Eliminar todos los datos');
}

async function handleImport(file) {
  if (!file) return; try {
    const parsed = JSON.parse(await file.text()); const incoming = Backup.validate(parsed); const content = el('div', 'sheet-content confirm-content'); content.append(el('h2', '', 'Importar respaldo'), el('p', '', `Encontramos ${incoming.length} ${incoming.length === 1 ? 'movimiento' : 'movimientos'}. ¿Deseas combinarlos con los actuales o reemplazarlos?`));
    const actions = el('div', 'stack-actions'); actions.append(makeButton('Combinar', 'primary-button', async () => { const merged = new Map(state.expenses.map(item => [item.id, item])); incoming.forEach(item => merged.set(item.id, item)); await database.bulkPut([...merged.values()]); state.expenses = await database.getAll(); closeSheet(); toast('Respaldo combinado', 'success'); render(); }), makeButton('Reemplazar', 'danger-button', async () => { await database.clear(); await database.bulkPut(incoming); state.expenses = await database.getAll(); closeSheet(); toast('Respaldo importado', 'success'); render(); }), makeButton('Cancelar', 'secondary-button', closeSheet)); content.append(actions); openSheet(content, 'Importar respaldo');
  } catch (error) { toast(error.message || 'El respaldo seleccionado no es válido.', 'error'); } finally { importInput.value = ''; }
}

function render() {
  const route = routeName(); document.body.dataset.route = route; document.querySelectorAll('[data-nav]').forEach(link => { const active = link.dataset.nav === route; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  app.classList.remove('screen-enter'); void app.offsetWidth; app.replaceChildren(route === 'movimientos' ? renderMovements() : route === 'nuevo' ? renderNew() : route === 'calendario' ? renderCalendar() : route === 'estadisticas' ? renderStats() : renderHome()); app.classList.add('screen-enter'); document.title = `${route.charAt(0).toUpperCase() + route.slice(1)} · ${APP.name}`; window.scrollTo({ top: 0, behavior: 'instant' });
}

async function init() {
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; });
  window.addEventListener('appinstalled', () => { state.installPrompt = null; toast('MiGasto instalada correctamente', 'success'); });
  applyAppearance();
  try {
    await database.open();
    state.expenses = await database.getAll();
  } catch {
    state.expenses = [];
    toast('No se pudieron leer los gastos guardados.', 'error');
  }
  if (!location.hash || !routes.has(rawRoute())) location.replace('#/inicio'); else render();
  window.addEventListener('hashchange', () => { if (!sheetLayer.hidden) forceCloseSheet(); if (!routes.has(rawRoute())) { location.replace('#/inicio'); return; } render(); });
  window.addEventListener('popstate', () => { if (!sheetLayer.hidden) forceCloseSheet(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !sheetLayer.hidden) closeSheet(); });
  importInput.addEventListener('change', () => handleImport(importInput.files[0]));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    const watchWorker = worker => worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('Actualización lista. Se aplicará al volver a abrir.', 'info');
    });
    watchWorker(registration.installing);
    registration.addEventListener('updatefound', () => {
      watchWorker(registration.installing);
    });
    await registration.update();
  } catch {
    toast('No se pudo preparar el modo sin conexión.', 'error');
  }
}

registerServiceWorker();
init();
