#!/usr/bin/env node
// Сборка игровых рядов цен: data/raw/*.json (реальные данные) + scripts/anchors (опорные точки)
//   → src/data/history/<ID>.json и src/data/macro.json
//
// Принцип: везде, где есть реальные дневные данные, они используются как есть.
// Пробелы (нет источника / закрыт доступ к API) заполняются «мостом» между
// приближёнными историческими опорными точками с факторной моделью:
//   ln P(t+1) = ln P(t) + β·Δln(Фактор) + σ·ε,   ε ~ N(0,1)
// затем к пути добавляется линейная поправка, чтобы он точно прошёл через
// следующую опорную точку (броуновский мост). Фактор: S&P 500 для акций,
// BTC для альткоинов, нефть WTI дополнительно для XOM. Волатильность S&P берётся
// из реального дневного VIX, поэтому обвалы 2008/2020 «дрожат» как в жизни.
// Всё детерминировано (seed = хеш тикера), повторная сборка даёт тот же результат.

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, RAW_DIR, OUT_DIR, START, dayNum, dayStr, isWeekend, rng, hashStr, gauss, sig,
  readJson, writeJson, parseAnchors,
} from './lib/common.mjs';
import { STOCKS, SPX_MONTH_END, SPX_EXTREMES, CRYPTO_ANCHORS } from './anchors/stocks.mjs';

const corporate = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/config/corporate.json'), 'utf8'));

const S0 = dayNum(START);
/** Последний день, до которого строим ряды акций/ETF. Дальше игра продолжает симуляцией. */
const EQ_END = dayNum('2026-09-30');
/** Последний день для криптовалют (последняя опорная точка). */
const CR_END = dayNum('2026-07-25');

const log = [];
const raw = (id) => readJson(path.join(RAW_DIR, `${id}.json`));

function rawAt(r, d) {
  if (!r) return null;
  const i = d - dayNum(r.start);
  return i >= 0 && i < r.values.length ? r.values[i] : null;
}

function rawLastDay(r) {
  if (!r) return -Infinity;
  for (let i = r.values.length - 1; i >= 0; i--) if (r.values[i] != null) return dayNum(r.start) + i;
  return -Infinity;
}

function rawFirstDay(r) {
  if (!r) return Infinity;
  for (let i = 0; i < r.values.length; i++) if (r.values[i] != null) return dayNum(r.start) + i;
  return Infinity;
}

/** Массив торговых дней [from..to]; weekdaysOnly — для бирж (крипта торгуется 24/7). */
function dayRange(from, to, weekdaysOnly) {
  const out = [];
  for (let d = from; d <= to; d++) if (!weekdaysOnly || !isWeekend(d)) out.push(d);
  return out;
}

/**
 * Броуновский мост по опорным точкам.
 * @param days       торговые дни
 * @param pins       [[day, price]] — опорные точки (привязываются к ближайшему торговому дню ≤ даты)
 * @param factorStep (i) => лог-приращение фактора между days[i-1] и days[i]
 * @param volAt      (i) => дневная волатильность собственного шума
 * @param extend     продолжать ли путь после последней опорной точки (без привязки)
 * @returns Float64Array лог-цен (NaN до первой опорной точки)
 */
function bridge(days, pins, factorStep, volAt, rand, extend = true) {
  const index = new Map(days.map((d, i) => [d, i]));
  const snap = (d) => {
    for (let k = d; k >= d - 7; k--) if (index.has(k)) return index.get(k);
    for (let k = d; k <= d + 7; k++) if (index.has(k)) return index.get(k);
    return -1;
  };
  const p = new Map();
  for (const [d, v] of pins) {
    const i = snap(d);
    if (i >= 0 && v > 0) p.set(i, Math.log(v));
  }
  const pts = [...p.entries()].sort((a, b) => a[0] - b[0]);
  const x = new Float64Array(days.length).fill(NaN);
  if (!pts.length) return x;
  x[pts[0][0]] = pts[0][1];
  for (let k = 0; k < pts.length - 1; k++) {
    const [i0, v0] = pts[k];
    const [i1, v1] = pts[k + 1];
    const y = [v0];
    for (let i = i0 + 1; i <= i1; i++) y.push(y.at(-1) + factorStep(i) + volAt(i) * gauss(rand));
    const err = v1 - y.at(-1);
    for (let i = i0; i <= i1; i++) x[i] = y[i - i0] + (err * (i - i0)) / Math.max(1, i1 - i0);
  }
  if (extend) {
    for (let i = pts.at(-1)[0] + 1; i < days.length; i++) x[i] = x[i - 1] + factorStep(i) + volAt(i) * gauss(rand);
  }
  return x;
}

/** Превращает (дни, лог-цены) в плотный календарный массив с заполнением выходных. */
function toCalendar(days, logx, from, to) {
  const map = new Map();
  days.forEach((d, i) => Number.isFinite(logx[i]) && map.set(d, Math.exp(logx[i])));
  const out = [];
  let last = null;
  let first = null;
  for (let d = from; d <= to; d++) {
    if (map.has(d)) last = map.get(d);
    if (last != null && first == null) first = d;
    if (first != null) out.push(last);
  }
  return { first, c: out };
}

function splitFactor(sym, d) {
  let f = 1;
  for (const [date, r] of corporate.splits[sym] ?? []) if (dayNum(date) > d) f *= r;
  return f;
}

function emit(id, first, closes, src, extra = {}) {
  const c = closes.map((v) => sig(v, 5));
  writeJson(path.join(OUT_DIR, `${id}.json`), { id, first: dayStr(first), c, src, ...extra });
  log.push(`${id.padEnd(7)} ${dayStr(first)} … ${dayStr(first + c.length - 1)}  ${src.map((s) => s[1]).join(' + ')}`);
}

// ---------------------------------------------------------------------------
// 1. S&P 500 — рыночный фактор
// ---------------------------------------------------------------------------
const vix = raw('VIX');
const spxMonthly = raw('SPX-monthly');
const eqDays = dayRange(S0 - 10, EQ_END, true);

const spxPins = [];
for (const [y, arr] of Object.entries(SPX_MONTH_END)) {
  arr.forEach((v, m) => {
    let d = Date.UTC(+y, m + 1, 0) / 86_400_000; // последний день месяца
    while (isWeekend(d)) d--;
    spxPins.push([d, v]);
  });
}
for (const [d, v] of parseAnchors(SPX_EXTREMES)) spxPins.push([d, v]);
spxPins.push([dayNum('1999-12-31'), 1469.25], [dayNum('2000-01-03'), 1455.22]);
let spxSrc = [[START, 'model', 'месячные закрытия S&P 500 + VIX']];
if (spxMonthly) {
  for (const [date, v] of spxMonthly.points) if (date >= '2026-01-01') spxPins.push([dayNum(date), v]);
  spxSrc.push(['2026-01-01', 'model', 'среднемесячный S&P 500 (Shiller, datasets)']);
}
spxPins.sort((a, b) => a[0] - b[0]);

const volSpx = (i) => {
  const v = rawAt(vix, eqDays[i]);
  return v ? (v / 100 / Math.sqrt(252)) * 0.8 : 0.011;
};
const spxLog = bridge(eqDays, spxPins, () => 0, volSpx, rng(hashStr('SPX')));
const spxAt = new Map(eqDays.map((d, i) => [d, spxLog[i]]));

// Нефть как дополнительный фактор (реальные данные WTI)
const wtiRaw = raw('WTI');
let lastOil = null;
const oilLog = new Map();
for (const d of eqDays) {
  const v = rawAt(wtiRaw, d);
  if (v && v > 1) lastOil = Math.log(v);
  oilLog.set(d, lastOil);
}

// SPY = S&P 500 / 10
{
  const cal = toCalendar(eqDays, spxLog.map((v) => v + Math.log(0.1)), S0, EQ_END);
  emit('SPY', cal.first, cal.c, spxSrc.map(([d, , s]) => [d, 'model', `SPY ≈ ${s} / 10`]), { divs: dividends('SPY', cal.first, EQ_END) });
}

// ---------------------------------------------------------------------------
// 2. Акции и QQQ
// ---------------------------------------------------------------------------
function dividends(sym, first, last) {
  const cfg = corporate.dividends[sym];
  if (!cfg) return [];
  const real = raw(sym);
  if (real?.dividends?.length) {
    return real.dividends
      .map((x) => [dayNum(x.date), x.amount])
      .filter(([d]) => d >= first)
      .map(([d, a]) => [dayStr(d), sig(a * splitFactor(sym, d), 4)]);
  }
  const out = [];
  const years = Object.keys(cfg.dps).map(Number).sort((a, b) => a - b);
  const from = cfg.from ? dayNum(cfg.from) : first;
  const to = cfg.to ? dayNum(cfg.to) : last + 120;
  for (let y = 2000; y <= 2026; y++) {
    const yKey = years.filter((k) => k <= y).at(-1);
    if (yKey == null) continue;
    const annual = cfg.dps[yKey];
    for (const m of cfg.months) {
      let d = dayNum(`${y}-${String(m).padStart(2, '0')}-${String(cfg.day).padStart(2, '0')}`);
      while (isWeekend(d)) d++;
      if (d < Math.max(first, from) || d > to) continue;
      if ((cfg.gaps ?? []).some(([a, b]) => d >= dayNum(a) && d <= dayNum(b))) continue;
      out.push([d, annual / cfg.months.length]);
    }
  }
  for (const [date, amt] of cfg.special ?? []) out.push([dayNum(date), amt]);
  return out
    .sort((a, b) => a[0] - b[0])
    .map(([d, a]) => [dayStr(d), sig(a * splitFactor(sym, d), 4)]);
}

for (const [sym, cfg] of Object.entries(STOCKS)) {
  const real = raw(sym);
  const listed = Math.max(dayNum(cfg.listed), S0 - 10);
  const days = dayRange(listed, EQ_END, true);
  let logx;
  const src = [];
  if (real && rawLastDay(real) > dayNum('2020-01-01')) {
    // Реальные данные (Yahoo/Stooq), выходные и праздники — последнее закрытие
    let last = NaN;
    logx = Float64Array.from(days, (d) => {
      const v = rawAt(real, d);
      if (v && v > 0) last = Math.log(v);
      return last;
    });
    src.push([dayStr(Math.max(rawFirstDay(real), S0)), 'real', real.source]);
    if (rawLastDay(real) < EQ_END) {
      // продолжение за пределами реальных данных — по рынку
      const rand = rng(hashStr(sym + ':tail'));
      const i0 = days.findIndex((d) => d > rawLastDay(real));
      for (let i = Math.max(1, i0); i < days.length && i0 > 0; i++) {
        logx[i] = logx[i - 1] + cfg.beta * ((spxAt.get(days[i]) ?? 0) - (spxAt.get(days[i - 1]) ?? 0)) + cfg.idio * gauss(rand);
      }
    }
  } else {
    const pins = parseAnchors(cfg.anchors);
    const factor = (i) => {
      const a = spxAt.get(days[i]);
      const b = spxAt.get(days[i - 1]);
      let f = Number.isFinite(a) && Number.isFinite(b) ? cfg.beta * (a - b) : 0;
      if (cfg.oilBeta) {
        const oa = oilLog.get(days[i]);
        const ob = oilLog.get(days[i - 1]);
        if (Number.isFinite(oa) && Number.isFinite(ob)) f += cfg.oilBeta * (oa - ob);
      }
      return f;
    };
    logx = bridge(days, pins, factor, () => cfg.idio, rng(hashStr(sym)));
    src.push([dayStr(Math.max(pins[0][0], S0)), 'model', 'опорные точки (квартальные закрытия) + факторная модель S&P 500']);
  }
  // скорректированные на сплиты → номинальные цены того времени
  const nominal = days.map((d, i) => logx[i] + Math.log(splitFactor(sym, d)));
  const cal = toCalendar(days, nominal, S0, EQ_END);
  emit(sym, cal.first, cal.c, src, { divs: dividends(sym, cal.first, EQ_END) });
}

// ---------------------------------------------------------------------------
// 3. Сырьё и валюта
// ---------------------------------------------------------------------------
{
  // Золото: реальные среднемесячные цены (середина месяца) + дневной шум ~1%
  const gold = raw('XAU-monthly');
  const days = dayRange(dayNum('1999-01-01'), EQ_END, true);
  const pins = gold ? gold.points.map(([d, v]) => [dayNum(d), v]) : parseAnchors('2000-01-15 284, 2026-09-15 4319');
  const logx = bridge(days, pins, () => 0, () => 0.0095, rng(hashStr('XAU')));
  const cal = toCalendar(days, logx, S0, EQ_END);
  emit('XAU', cal.first, cal.c, [[START, gold ? 'real' : 'model', gold ? `${gold.source}; внутри месяца — мост` : 'опорные точки']]);
}
for (const id of ['WTI', 'EURUSD']) {
  const r = raw(id);
  if (!r) {
    log.push(`${id}: нет данных — пропуск (запустите npm run data:fetch)`);
    continue;
  }
  const end = rawLastDay(r);
  const days = dayRange(S0 - 10, end, true);
  let last = NaN;
  // WTI 20.04.2020 = −37.63 $: логарифм не годится, храним цены напрямую
  const prices = days.map((d) => {
    const v = rawAt(r, d);
    if (v != null && Number.isFinite(v)) last = v;
    return last;
  });
  const out = [];
  let first = null;
  let cur = null;
  const map = new Map(days.map((d, i) => [d, prices[i]]));
  for (let d = S0; d <= end; d++) {
    if (map.has(d) && Number.isFinite(map.get(d))) cur = map.get(d);
    if (cur != null && first == null) first = d;
    if (first != null) out.push(cur);
  }
  emit(id, first, out, [[dayStr(first), 'real', r.source]]);
}

// ---------------------------------------------------------------------------
// 4. Криптовалюты
// ---------------------------------------------------------------------------
const crDays = dayRange(dayNum('2009-10-05'), CR_END, false);
const btcReal = raw('BTC');
const btcRealFrom = rawFirstDay(btcReal);
const btcRealTo = rawLastDay(btcReal);
const btcLog = new Map();
{
  const pins = [...parseAnchors(CRYPTO_ANCHORS.BTC_PRE.anchors)];
  for (const d of crDays) {
    const v = rawAt(btcReal, d);
    if (v) pins.push([d, v]);
  }
  pins.push(...parseAnchors(CRYPTO_ANCHORS.LATE_2026.BTC));
  const isReal = (d) => d >= btcRealFrom && d <= btcRealTo;
  const logx = bridge(crDays, pins, () => 0, (i) => (isReal(crDays[i]) ? 0.0001 : crDays[i] < btcRealFrom ? CRYPTO_ANCHORS.BTC_PRE.idio : 0.028), rng(hashStr('BTC')));
  crDays.forEach((d, i) => btcLog.set(d, logx[i]));
  const cal = toCalendar(crDays, logx, crDays[0], CR_END);
  const src = [['2009-10-05', 'model', 'внебиржевые курсы: New Liberty Standard, BitcoinMarket.com, «пицца-день»']];
  if (btcReal) src.push([dayStr(btcRealFrom), 'real', btcReal.source], [dayStr(btcRealTo + 1), 'model', 'мост к уровню конца июля 2026']);
  emit('BTC', cal.first, cal.c, src);
}
const btcStep = (days) => (i) => {
  const a = btcLog.get(days[i]);
  const b = btcLog.get(days[i - 1]);
  return a != null && b != null && Number.isFinite(a) && Number.isFinite(b) ? a - b : 0;
};

for (const sym of ['ETH', 'BNB', 'XRP', 'DOGE', 'LTC', 'FTT']) {
  const r = raw(sym);
  if (!r) {
    log.push(`${sym}: нет данных — пропуск`);
    continue;
  }
  const from = rawFirstDay(r);
  const to = rawLastDay(r);
  const days = dayRange(from, CR_END, false);
  const pins = days.map((d) => [d, rawAt(r, d)]).filter(([, v]) => v > 0);
  const late = CRYPTO_ANCHORS.LATE_2026[sym];
  if (late) pins.push(...parseAnchors(late));
  const step = btcStep(days);
  const beta = sym === 'ETH' ? 1.15 : 1.0;
  const logx = bridge(
    days, pins,
    (i) => (days[i] > to ? beta * step(i) : 0),
    (i) => (days[i] > to ? 0.03 : 0.0001),
    rng(hashStr(sym)),
  );
  const cal = toCalendar(days, logx, from, CR_END);
  emit(sym, cal.first, cal.c, [[dayStr(from), 'real', r.source], [dayStr(to + 1), 'model', 'продолжение по бете к BTC']]);
}

for (const sym of ['SOL', 'LUNA']) {
  const cfg = CRYPTO_ANCHORS[sym];
  const r = raw(sym);
  const days = dayRange(dayNum(cfg.listed), CR_END, false);
  let pins;
  let src;
  if (r && rawLastDay(r) - rawFirstDay(r) > 365) {
    pins = days.map((d) => [d, rawAt(r, d)]).filter(([, v]) => v > 0);
    src = [[dayStr(rawFirstDay(r)), 'real', r.source]];
  } else {
    pins = parseAnchors(cfg.anchors);
    src = [[cfg.listed, 'model', 'опорные точки (месячные уровни) + факторная модель BTC']];
  }
  const step = btcStep(days);
  const logx = bridge(days, pins, (i) => cfg.beta * step(i), () => cfg.idio, rng(hashStr(sym)));
  const cal = toCalendar(days, logx, days[0], CR_END);
  emit(sym, cal.first, cal.c, src);
}

// ---------------------------------------------------------------------------
// 5. Макро: доходность 10Y, CPI, хешрейт и эмиссия BTC (для майнинга)
// ---------------------------------------------------------------------------
{
  const monthly = (id) => {
    const r = raw(id);
    if (!r) return null;
    const pts = r.points.filter(([d]) => d >= '2000-01');
    return { first: pts[0][0].slice(0, 7), v: pts.map(([, v]) => sig(v, 4)) };
  };
  const weekly = (id) => {
    const r = raw(id);
    if (!r) return null;
    const from = rawFirstDay(r);
    const to = rawLastDay(r);
    const v = [];
    for (let d = from; d <= to; d += 7) {
      let s = 0;
      let n = 0;
      for (let k = d; k < d + 7 && k <= to; k++) {
        const x = rawAt(r, k);
        if (x != null) {
          s += x;
          n++;
        }
      }
      v.push(n ? sig(s / n, 4) : v.at(-1) ?? 0);
    }
    return { first: dayStr(from), step: 7, v };
  };
  const macro = {
    ust10y: monthly('UST10Y-monthly'),
    cpi: monthly('CPI-monthly'),
    btcHash: weekly('BTC-hashrate'),
    btcIssuance: weekly('BTC-issuance'),
    builtAt: new Date().toISOString().slice(0, 10),
  };
  writeJson(path.join(ROOT, 'src/data/macro.json'), macro);
  log.push(`macro   10Y:${macro.ust10y?.v.length ?? 0} мес, CPI:${macro.cpi?.v.length ?? 0} мес, hash:${macro.btcHash?.v.length ?? 0} нед.`);
}

// Индекс собранных рядов
const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
const index = files.map((f) => {
  const j = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
  return { id: j.id, first: j.first, last: dayStr(dayNum(j.first) + j.c.length - 1), src: j.src };
});
writeJson(path.join(OUT_DIR, 'index.json'), index);

console.log(log.join('\n'));
const total = files.reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0);
console.log(`\nГотово: ${files.length} рядов, ${(total / 1024).toFixed(0)} КБ → ${path.relative(ROOT, OUT_DIR)}`);
