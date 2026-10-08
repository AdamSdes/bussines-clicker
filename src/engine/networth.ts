// Капитал игрока (чистые активы) и звания по реальным состояниям.
import { FORBES, RANKS, type RankDef } from './config';
import { bizBookValue, bondValue, depositValue, propertiesValue, rigsValue } from './finance';
import { priceAt } from './market';
import { yearOf } from './time';
import type { GameState } from './types';

export function holdingsValue(s: GameState, liveNow = false): number {
  let v = 0;
  for (const [id, h] of Object.entries(s.holdings)) {
    if (h.qty <= 0) continue;
    const p = priceAt(id, s.day, liveNow);
    if (p != null) v += h.qty * Math.max(0, p);
  }
  return v;
}

export interface NetWorthParts {
  cash: number;
  business: number;
  investments: number;
  property: number;
  bank: number;
  rigs: number;
  loan: number;
  total: number;
}

/** Капитал = наличные + бизнесы (по вложениям) + инвестиции + недвижимость + вклады и облигации + оборудование − долг */
export function netWorthParts(s: GameState, liveNow = false): NetWorthParts {
  const business = bizBookValue(s);
  const investments = holdingsValue(s, liveNow);
  const property = propertiesValue(s);
  let bank = 0;
  for (const d of s.deposits) bank += depositValue(d);
  for (const b of s.bonds) bank += bondValue(b, s.day);
  const rigs = rigsValue(s, s.day);
  const total = s.cash + business + investments + property + bank + rigs - s.loan;
  return { cash: s.cash, business, investments, property, bank, rigs, loan: s.loan, total };
}

export function netWorth(s: GameState, liveNow = false): number {
  return netWorthParts(s, liveNow).total;
}

/** Ближайший снимок списка Forbes не позже года игры */
export function forbesFor(day: number) {
  const y = yearOf(day);
  let snap = FORBES[0];
  for (const f of FORBES) if (f.year <= y) snap = f;
  return snap;
}

function rankThreshold(r: RankDef, day: number): number {
  if (r.min != null) return r.min;
  const f = forbesFor(day);
  if (r.forbes === 100) return f.threshold100 * 1e9;
  if (r.forbes === 10) return f.top[9][1] * 1e9;
  return f.top[0][1] * 1e9 * 1.0001;
}

export function rankFor(nw: number, day: number) {
  // Звания идут по возрастанию порога; Forbes-пороги зависят от года
  const sorted = RANKS.map((r) => ({ r, min: rankThreshold(r, day) })).sort((a, b) => a.min - b.min);
  let cur = sorted[0];
  let next: (typeof sorted)[number] | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (nw >= sorted[i].min) cur = sorted[i];
    else {
      next = sorted[i];
      break;
    }
  }
  return { rank: cur.r, min: cur.min, next: next?.r ?? null, nextMin: next?.min ?? null };
}

/** Место в списке Forbes года (если капитал выше №10 — точное место, иначе «топ-100» или null) */
export function forbesPlace(nw: number, day: number): { place: number | null; above: string | null; below: string | null } {
  const f = forbesFor(day);
  const top = f.top;
  for (let i = 0; i < top.length; i++) {
    if (nw >= top[i][1] * 1e9) return { place: i + 1, above: i > 0 ? top[i - 1][0] : null, below: top[i][0] };
  }
  if (nw >= f.threshold100 * 1e9) return { place: 100, above: top[9][0], below: null };
  return { place: null, above: null, below: null };
}
