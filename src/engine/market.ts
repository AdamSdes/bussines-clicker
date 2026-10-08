// Рыночный движок: исторические ряды (src/data/history), внутридневное движение,
// свечи, дивиденды, сплиты, отчётности, продолжение симуляцией после конца данных
// и подмена котировок живыми данными API в «Живом режиме».
import { ASSET_BY_ID, CORPORATE, RATES } from './config';
import { dayNum } from './time';
import type { AssetDef, Candle } from './types';

interface Series {
  id: string;
  first: number;
  c: number[];
  last: number;
  divs: Map<number, number>;
  src: [string, string, string][];
  /** Типичная дневная волатильность (медиана |Δln P| за последние 120 дней) */
  vol: number;
  /** Продолжение после конца данных (детерминированная симуляция) */
  ext: number[];
  allDay: boolean;
}

interface MacroSeries { first: string; v: number[]; step?: number }
interface Macro {
  ust10y: MacroSeries | null;
  cpi: MacroSeries | null;
  btcHash: MacroSeries | null;
  btcIssuance: MacroSeries | null;
  builtAt: string;
}

const series = new Map<string, Series>();
let macro: Macro | null = null;
let loaded = false;

/** Живые котировки (последняя цена API) и дневные закрытия живого режима */
const liveQuotes = new Map<string, { price: number; ts: number }>();
const liveCloses = new Map<string, Map<number, number>>();

// ---------------------------------------------------------------------------
// Детерминированный шум: одинаковый у всех игроков и между сессиями
// ---------------------------------------------------------------------------
function hash32(str: string, n: number): number {
  let h = 2166136261 ^ n;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}
function uniform(str: string, n: number): number {
  return (hash32(str, n) + 0.5) / 4294967296;
}
function normal(str: string, n: number): number {
  const u = uniform(str, n);
  const v = uniform(str + '#', n);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Загрузка
// ---------------------------------------------------------------------------
interface HistoryFile {
  id: string;
  first: string;
  c: number[];
  src: [string, string, string][];
  divs?: [string, number][];
}

function register(j: HistoryFile) {
  const asset = ASSET_BY_ID[j.id];
  const first = dayNum(j.first);
  const c = j.c;
  // оценка волатильности по последним 120 дням
  const rets: number[] = [];
  for (let i = Math.max(1, c.length - 120); i < c.length; i++) {
    if (c[i] > 0 && c[i - 1] > 0 && c[i] !== c[i - 1]) rets.push(Math.abs(Math.log(c[i] / c[i - 1])));
  }
  rets.sort((a, b) => a - b);
  const vol = rets.length ? rets[Math.floor(rets.length / 2)] * 1.25 : 0.015;
  series.set(j.id, {
    id: j.id,
    first,
    c,
    last: first + c.length - 1,
    divs: new Map((j.divs ?? []).map(([d, a]) => [dayNum(d), a])),
    src: j.src,
    vol: Math.min(0.08, Math.max(0.003, vol)),
    ext: [],
    allDay: asset?.kind === 'crypto',
  });
}

export async function loadMarket(onProgress?: (p: number) => void): Promise<void> {
  if (loaded) return;
  const files = import.meta.glob<HistoryFile>('../data/history/*.json', { import: 'default' });
  const entries = Object.entries(files).filter(([p]) => !p.endsWith('index.json'));
  let done = 0;
  await Promise.all(
    entries.map(async ([, load]) => {
      register(await load());
      done++;
      onProgress?.(done / (entries.length + 1));
    }),
  );
  macro = (await import('../data/macro.json')).default as unknown as Macro;
  onProgress?.(1);
  loaded = true;
}

/** Для тестов и Node-скриптов: синхронная регистрация рядов */
export function registerSeries(j: HistoryFile, m?: Macro) {
  register(j);
  if (m) macro = m;
}

export function isLoaded() {
  return loaded;
}

// ---------------------------------------------------------------------------
// Цены
// ---------------------------------------------------------------------------
export function seriesInfo(id: string) {
  const s = series.get(id);
  return s ? { first: s.first, last: s.last, src: s.src, vol: s.vol, allDay: s.allDay } : null;
}

export function listedOn(id: string, day: number): boolean {
  const s = series.get(id);
  return !!s && Math.floor(day) >= s.first;
}

export function firstDay(id: string): number | null {
  return series.get(id)?.first ?? null;
}

/** Торгуется ли актив сейчас: биржа — по будням, крипта — 24/7 */
export function marketOpen(id: string, day: number): boolean {
  const s = series.get(id);
  if (!s) return false;
  if (s.allDay) return true;
  const w = new Date(Math.floor(day) * 86_400_000).getUTCDay();
  return w !== 0 && w !== 6;
}

function extend(s: Series, k: number): number {
  // Продолжение ряда после конца данных: GBM с дрейфом из assets.json и
  // волатильностью последних месяцев. Для бирж выходные — без движения.
  const asset = ASSET_BY_ID[s.id];
  const drift = asset?.drift ?? 0.05;
  const idx = k - s.last - 1;
  while (s.ext.length <= idx) {
    const i = s.ext.length;
    const day = s.last + 1 + i;
    const prev = i === 0 ? s.c[s.c.length - 1] : s.ext[i - 1];
    const w = new Date(day * 86_400_000).getUTCDay();
    if (!s.allDay && (w === 0 || w === 6)) {
      s.ext.push(prev);
      continue;
    }
    const periods = s.allDay ? 365 : 252;
    const sigma = s.vol;
    const mu = drift / periods - (sigma * sigma) / 2;
    const r = mu + sigma * normal(s.id + ':ext', day);
    s.ext.push(Math.max(prev * Math.exp(r), 1e-12));
  }
  return s.ext[idx];
}

/** Цена закрытия дня k (целое). null — актив ещё не торговался. */
export function closeOn(id: string, k: number): number | null {
  const s = series.get(id);
  if (!s || k < s.first) return null;
  const live = liveCloses.get(id)?.get(k);
  if (live != null) return live;
  if (k <= s.last) return s.c[k - s.first];
  return extend(s, k);
}

/**
 * Цена в произвольный момент дня t (дробный день).
 * Внутри дня цена плавно идёт от закрытия вчера к закрытию сегодня,
 * с небольшим детерминированным «дрожанием», которое равно нулю на концах дня.
 */
export function priceAt(id: string, t: number, liveNow = false): number | null {
  const s = series.get(id);
  if (!s) return null;
  const k = Math.floor(t);
  if (k < s.first) return null;
  if (liveNow) {
    const q = liveQuotes.get(id);
    if (q) return q.price;
  }
  const cur = closeOn(id, k)!;
  const prev = k - 1 >= s.first ? closeOn(id, k - 1)! : cur;
  if (prev === cur) return cur;
  const f = t - k;
  // сглаженный путь + шум (сумма синусов с детерминированными фазами)
  const ease = f * f * (3 - 2 * f);
  const base = prev + (cur - prev) * ease;
  const a = uniform(id, k * 3) * 6.283;
  const b = uniform(id, k * 3 + 1) * 6.283;
  const wiggle = Math.sin(Math.PI * f) * (0.6 * Math.sin(17 * f + a) + 0.4 * Math.sin(41 * f + b));
  const amp = Math.abs(base) * s.vol * 0.45;
  return base + wiggle * amp;
}

/** Изменение цены за период (в долях): priceAt(t) / close(t − days) − 1 */
export function changeOver(id: string, t: number, days: number, liveNow = false): number | null {
  const now = priceAt(id, t, liveNow);
  const s = series.get(id);
  if (now == null || !s) return null;
  const k = Math.max(s.first, Math.floor(t) - days);
  const then = closeOn(id, k);
  if (!then) return null;
  return now / then - 1;
}

/** Дневные свечи [from..to]; для текущего (незавершённого) дня close = текущая цена. */
export function candles(id: string, fromDay: number, t: number, liveNow = false): Candle[] {
  const s = series.get(id);
  if (!s) return [];
  const out: Candle[] = [];
  const to = Math.floor(t);
  const start = Math.max(s.first, Math.floor(fromDay));
  for (let k = start; k <= to; k++) {
    const w = new Date(k * 86_400_000).getUTCDay();
    if (!s.allDay && (w === 0 || w === 6)) continue;
    const prev = k - 1 >= s.first ? closeOn(id, k - 1)! : closeOn(id, k)!;
    const close = k === to ? priceAt(id, t, liveNow)! : closeOn(id, k)!;
    // гэп на открытии и тени — детерминированно от волатильности
    const gap = 1 + normal(id + ':g', k) * s.vol * 0.25;
    const open = k === s.first ? close : prev * gap;
    const progress = k === to ? Math.min(1, t - k + 0.05) : 1;
    const hiExt = Math.abs(normal(id + ':h', k)) * s.vol * 0.55 * progress;
    const loExt = Math.abs(normal(id + ':l', k)) * s.vol * 0.55 * progress;
    const hi = Math.max(open, close);
    const lo = Math.min(open, close);
    out.push({
      time: k * 86400,
      open,
      high: hi >= 0 ? hi * (1 + hiExt) : hi * (1 - hiExt),
      low: lo >= 0 ? lo * (1 - loExt) : lo * (1 + loExt),
      close,
    });
  }
  return out;
}

/** Закрытия по дням (для линейных графиков и мини-спарклайнов) */
export function closes(id: string, fromDay: number, toDay: number, step = 1): [number, number][] {
  const s = series.get(id);
  if (!s) return [];
  const out: [number, number][] = [];
  for (let k = Math.max(s.first, Math.floor(fromDay)); k <= Math.floor(toDay); k += step) out.push([k, closeOn(id, k)!]);
  return out;
}

// ---------------------------------------------------------------------------
// Корпоративные события
// ---------------------------------------------------------------------------
const SPLITS = new Map<string, Map<number, number>>(
  Object.entries(CORPORATE.splits).map(([id, arr]) => [id, new Map(arr.map(([d, r]) => [dayNum(d), r]))]),
);

export function splitOn(id: string, k: number): number | null {
  return SPLITS.get(id)?.get(k) ?? null;
}

export function splitsOf(id: string): [number, number][] {
  return [...(SPLITS.get(id)?.entries() ?? [])];
}

/** Дивиденд на акцию (номинальный) с экс-датой в день k */
export function dividendOn(id: string, k: number): number | null {
  return series.get(id)?.divs.get(k) ?? null;
}

/** Годовая дивидендная доходность по последним 4 кварталам (оценка) */
export function dividendYield(id: string, t: number): number {
  const s = series.get(id);
  if (!s) return 0;
  const k = Math.floor(t);
  let sum = 0;
  for (const [d, a] of s.divs) if (d <= k && d > k - 365) sum += a;
  const p = priceAt(id, t);
  return p ? sum / p : 0;
}

export function nextDividend(id: string, k: number): [number, number] | null {
  const s = series.get(id);
  if (!s) return null;
  let best: [number, number] | null = null;
  for (const [d, a] of s.divs) if (d >= k && (!best || d < best[0])) best = [d, a];
  return best;
}

/** Ближайшая дата квартального отчёта (по графику из corporate.json) */
export function nextEarnings(id: string, k: number): number | null {
  const e = CORPORATE.earnings[id];
  const s = series.get(id);
  if (!e || !s) return null;
  const y0 = new Date(k * 86_400_000).getUTCFullYear();
  for (let y = y0; y <= y0 + 1; y++) {
    for (const m of e.months) {
      let d = dayNum(`${y}-${String(m).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`);
      const w = new Date(d * 86_400_000).getUTCDay();
      if (w === 6) d += 2;
      if (w === 0) d += 1;
      if (d >= k && d >= s.first + 30) return d;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Макро: ставка ФРС, доходность 10Y, CPI, хешрейт и эмиссия BTC
// ---------------------------------------------------------------------------
const FED = RATES.fed.map(([d, r]) => [dayNum(d as string), (r as number) / 100] as [number, number]);

/** Верхняя граница ставки ФРС (доля) */
export function fedRate(day: number): number {
  let r = FED[0][1];
  for (const [d, v] of FED) {
    if (day >= d) r = v;
    else break;
  }
  return r;
}

function monthly(sr: MacroSeries | null | undefined, day: number): number | null {
  if (!sr) return null;
  const [y0, m0] = sr.first.split('-').map(Number);
  const d = new Date(Math.floor(day) * 86_400_000);
  const idx = (d.getUTCFullYear() - y0) * 12 + d.getUTCMonth() - (m0 - 1);
  if (idx < 0) return sr.v[0];
  return sr.v[Math.min(idx, sr.v.length - 1)];
}

/** Доходность 10-летних казначейских облигаций США (доля), реальные среднемесячные данные */
export function ust10y(day: number): number {
  const v = monthly(macro?.ust10y, day);
  return v != null ? v / 100 : 0.04;
}

/** Индекс потребительских цен (CPI-U) */
export function cpi(day: number): number {
  return monthly(macro?.cpi, day) ?? 300;
}

function weekly(sr: MacroSeries | null | undefined, day: number): { v: number; past: number } | null {
  if (!sr) return null;
  const start = dayNum(sr.first);
  const i = Math.floor((day - start) / (sr.step ?? 7));
  if (i < 0) return { v: sr.v[0], past: 0 };
  if (i >= sr.v.length) return { v: sr.v[sr.v.length - 1], past: day - (start + (sr.v.length - 1) * (sr.step ?? 7)) };
  return { v: sr.v[i], past: 0 };
}

/** Хешрейт сети BTC (TH/s): реальные данные, после их конца — рост ~45% в год */
export function btcHashrate(day: number): number {
  const w = weekly(macro?.btcHash, day);
  if (!w) return 1e9;
  return w.v * Math.pow(1.45, w.past / 365);
}

const HALVINGS: [number, number][] = [
  [dayNum('2012-11-28'), 25],
  [dayNum('2016-07-09'), 12.5],
  [dayNum('2020-05-11'), 6.25],
  [dayNum('2024-04-20'), 3.125],
  [dayNum('2028-04-15'), 1.5625],
];

/** Награда за блок на дату */
export function blockReward(day: number): number {
  let r = 50;
  for (const [d, v] of HALVINGS) if (day >= d) r = v;
  return r;
}

/** Эмиссия BTC в день: реальные данные CoinMetrics, после их конца — 144 блока × награда */
export function btcIssuance(day: number): number {
  const w = weekly(macro?.btcIssuance, day);
  if (!w || w.past > 0) return 144 * blockReward(day);
  return w.v;
}

// ---------------------------------------------------------------------------
// Живой режим
// ---------------------------------------------------------------------------
export function setLiveQuote(id: string, price: number, day: number) {
  if (!Number.isFinite(price) || price <= 0) return;
  liveQuotes.set(id, { price, ts: Date.now() });
  let m = liveCloses.get(id);
  if (!m) liveCloses.set(id, (m = new Map()));
  m.set(Math.floor(day), price);
}

export function liveQuote(id: string) {
  return liveQuotes.get(id) ?? null;
}

export function exportLiveCloses(): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = {};
  for (const [id, m] of liveCloses) out[id] = [...m.entries()].slice(-400);
  return out;
}

export function importLiveCloses(data: Record<string, [number, number][]> | null | undefined) {
  if (!data) return;
  for (const [id, arr] of Object.entries(data)) liveCloses.set(id, new Map(arr));
}

export function assetOf(id: string): AssetDef | undefined {
  return ASSET_BY_ID[id];
}
