// Игровой цикл: ход времени, обработка дней, начисления, бизнесы и офлайн-доход.
import { BALANCE, BUSINESSES, NEWS, RANDOM_EVENTS } from './config';
import { bizCycle, clickParts, comboMult, ownedSet, totalBizPerSec } from './economy';
import {
  depositRate, loanLimit, loanRate, miningPerDay, propertyRentPerDay,
} from './finance';
import { closeOn, dividendOn, splitOn, priceAt } from './market';
import { activeHistorical, computeMods, type Mods } from './modifiers';
import { holdingsValue, netWorth } from './networth';
import { dayAchievements, questEvent } from './progress';
import { applyRandomEffect, pickRandomEvent } from './randomEvents';
import { dayNum, fmtDate, realDay } from './time';
import { fmtMoney, fmtNum } from './format';
import type { GameState, Holding } from './types';
import { ASSET_BY_ID } from './config';

export type ToastKind = 'info' | 'good' | 'bad' | 'gold' | 'news';
export type GameEvent =
  | { type: 'toast'; kind: ToastKind; title: string; text?: string; emoji?: string }
  | { type: 'achievement'; id: string }
  | { type: 'questDone'; id: string }
  | { type: 'live' }
  | { type: 'confetti' }
  | { type: 'choice'; id: string };
export type Emit = (e: GameEvent) => void;

export function secPerDay(s: GameState): number {
  const sp = BALANCE.speeds.find((x) => x.id === s.settings.speed) ?? BALANCE.speeds[1];
  return sp.secPerDay;
}

/** Деньги, заработанные игроком (идут в счёт IPO) */
export function addIncome(s: GameState, amount: number) {
  s.cash += amount;
  if (amount > 0) {
    s.earnedLife += amount;
    s.earnedTotal += amount;
  }
}

export interface FlowTotals {
  rent: number;
  interest: number;
  coupons: number;
  mined: number;
  power: number;
  dividends: number;
  splits: string[];
  matured: number;
}

export function emptyTotals(): FlowTotals {
  return { rent: 0, interest: 0, coupons: 0, mined: 0, power: 0, dividends: 0, splits: [], matured: 0 };
}

export function ensureHolding(s: GameState, id: string, day: number): Holding {
  let h = s.holdings[id];
  if (!h) s.holdings[id] = h = { qty: 0, cost: 0, realized: 0, dividends: 0, since: day };
  if (h.qty <= 0) h.since = day;
  return h;
}

// ---------------------------------------------------------------------------
// Непрерывные начисления за отрезок dtDays игрового времени
// ---------------------------------------------------------------------------
export function accrue(s: GameState, dtDays: number, mods: Mods, totals?: FlowTotals) {
  if (dtDays <= 0) return;
  const day = s.day;
  // Вклады: накопительный — плавающая ставка с капитализацией; срочный — фиксированная, выплата в конце
  for (const d of s.deposits) {
    const r = d.kind === 'flex' ? depositRate('flex', day, mods) : d.rate;
    const inc = (d.amount * r * dtDays) / 365;
    if (d.kind === 'flex') {
      d.amount += inc;
      d.rate = r;
    }
    d.interest += inc;
    s.stats.interestTotal += inc;
    s.earnedLife += inc;
    s.earnedTotal += inc;
    if (totals) totals.interest += inc;
  }
  // Купоны облигаций начисляются непрерывно
  for (const b of s.bonds) {
    const c = (b.face * b.coupon * dtDays) / 365;
    addIncome(s, c);
    b.coupons += c;
    s.stats.interestTotal += c;
    if (totals) totals.coupons += c;
  }
  // Аренда недвижимости (за вычетом налога на имущество и обслуживания)
  for (const p of s.properties) {
    const r = propertyRentPerDay(p, day, mods) * dtDays;
    addIncome(s, r);
    p.rentEarned += r;
    s.stats.rentTotal += r;
    if (totals) totals.rent += r;
  }
  // Майнинг: если нечем платить за электричество — фермы простаивают
  const m = miningPerDay(s, day, mods);
  if (m.btc > 0) {
    const cost = m.power * dtDays;
    if (s.cash >= cost) {
      s.cash -= cost;
      const btc = m.btc * dtDays;
      const h = ensureHolding(s, 'BTC', day);
      h.qty += btc;
      h.cost += cost;
      s.stats.minedBTC += btc;
      if (totals) {
        totals.mined += btc;
        totals.power += cost;
      }
    }
  }
  // Проценты по кредиту капитализируются
  if (s.loan > 0) s.loan += (s.loan * loanRate(day, mods) * dtDays) / 365;
}

// ---------------------------------------------------------------------------
// Начало нового игрового дня d
// ---------------------------------------------------------------------------
export function processDay(s: GameState, d: number, _mods: Mods, emit: Emit, quiet: boolean, totals?: FlowTotals, liveNow = false) {
  // Сплиты: количество акций умножается, средняя цена делится
  for (const [id, h] of Object.entries(s.holdings)) {
    if (h.qty <= 0) continue;
    const r = splitOn(id, d);
    if (r) {
      h.qty *= r;
      s.stats.splits++;
      totals?.splits.push(`${id} ${r}:1`);
      if (!quiet) emit({ type: 'toast', kind: 'gold', emoji: '✂️', title: `Сплит ${id} ${r % 1 ? r.toFixed(1) : r} к 1`, text: `Теперь у тебя ${fmtNum(h.qty, 2)} акций. Стоимость позиции не изменилась.` });
    }
  }
  // Дивиденды: на каждую акцию в экс-дату
  let divSum = 0;
  const divNames: string[] = [];
  for (const [id, h] of Object.entries(s.holdings)) {
    if (h.qty <= 0) continue;
    const a = dividendOn(id, d);
    if (!a) continue;
    const amount = a * h.qty;
    addIncome(s, amount);
    h.dividends += amount;
    s.stats.dividendsTotal += amount;
    divSum += amount;
    divNames.push(id);
    questEvent(s, 'dividends', 1);
  }
  if (totals) totals.dividends += divSum;
  if (divSum > 0 && !quiet) emit({ type: 'toast', kind: 'good', emoji: '🧾', title: `Дивиденды +${fmtMoney(divSum)}`, text: divNames.join(', ') });

  // Погашение облигаций и срочных вкладов
  s.bonds = s.bonds.filter((b) => {
    if (d < b.maturityDay) return true;
    s.cash += b.face;
    if (totals) totals.matured += b.face;
    if (!quiet) emit({ type: 'toast', kind: 'info', emoji: '📜', title: 'Облигации погашены', text: `+${fmtMoney(b.face)} номинала вернулись на счёт` });
    return false;
  });
  s.deposits = s.deposits.filter((dep) => {
    if (dep.kind !== 'term' || dep.endDay == null || d < dep.endDay) return true;
    s.cash += dep.amount + dep.interest;
    if (totals) totals.matured += dep.amount + dep.interest;
    if (!quiet) emit({ type: 'toast', kind: 'good', emoji: '🔓', title: 'Срочный вклад закрыт', text: `+${fmtMoney(dep.amount + dep.interest)} (проценты ${fmtMoney(dep.interest)})` });
    return false;
  });

  // Маржин-колл по кредиту: если долг превысил лимит залога на 10%, банк списывает наличные
  if (s.loan > 0) {
    const limit = loanLimit(s);
    if (s.loan > limit * 1.1 && s.cash > 0) {
      const pay = Math.min(s.cash, s.loan - limit);
      s.cash -= pay;
      s.loan -= pay;
      if (!quiet) emit({ type: 'toast', kind: 'bad', emoji: '⚠️', title: 'Маржин-колл', text: `Банк списал ${fmtMoney(pay)} в погашение кредита` });
    }
  }

  // Исторические новости дня
  while (s.newsCursor + 1 < NEWS.length && dayNum(NEWS[s.newsCursor + 1].d) <= d) {
    s.newsCursor++;
    const n = NEWS[s.newsCursor];
    if (!quiet && n.big) emit({ type: 'toast', kind: 'news', emoji: '📰', title: fmtDate(d), text: n.t });
  }
  // Исторические периоды, влияющие на бизнесы
  for (const h of activeHistorical(d)) {
    if (s.seenEffects.includes(h.id)) continue;
    s.seenEffects.push(h.id);
    if (!quiet) emit({ type: 'toast', kind: 'bad', emoji: h.emoji, title: h.name, text: h.desc });
  }

  for (const id of dayAchievements(s, d)) {
    s.achievements[id] = Date.now();
    emit({ type: 'achievement', id });
  }
  for (const q of questEvent(s, 'days', 1)) emit({ type: 'questDone', id: q.id });

  // Замер капитала и доходности портфеля (TWR) для статистики
  if (d % BALANCE.netWorthSampleDays === 0) sampleStats(s, d, liveNow);
}

export function sampleStats(s: GameState, d: number, liveNow: boolean) {
  const st = s.stats;
  const v = holdingsValue(s, liveNow);
  if (st.invLast > 0) st.invIndex *= Math.max(0.0001, (v - st.invFlows) / st.invLast);
  st.invLast = v;
  st.invFlows = 0;
  const nw = netWorth(s, liveNow);
  st.history.push([d, nw, st.invIndex, closeOn('SPY', d) ?? 0]);
  if (st.history.length > 1500) {
    // прореживаем старую половину, чтобы сейв не рос бесконечно
    const half = Math.floor(st.history.length / 2);
    st.history = [...st.history.slice(0, half).filter((_, i) => i % 2 === 0), ...st.history.slice(half)];
  }
}

/** Двигает игровое время до target, обрабатывая каждую полночь. */
export function advanceTo(s: GameState, target: number, mods: Mods, emit: Emit, quiet: boolean, totals?: FlowTotals, liveNow = false) {
  let guard = 0;
  while (s.day < target && guard++ < 200_000) {
    const boundary = Math.floor(s.day) + 1;
    const segEnd = Math.min(target, boundary);
    accrue(s, segEnd - s.day, mods, totals);
    s.day = segEnd;
    if (segEnd === boundary) processDay(s, boundary, mods, emit, quiet, totals, liveNow);
  }
}

// ---------------------------------------------------------------------------
// Бизнесы: циклы производства
// ---------------------------------------------------------------------------
export function runBusinesses(s: GameState, dt: number, mods: Mods): number {
  const owned = ownedSet(s);
  let income = 0;
  for (const def of BUSINESSES) {
    const st = s.businesses[def.id];
    if (!st || st.level <= 0) continue;
    if (!st.manager && !st.running) continue;
    st.progress += dt;
    const cycleSec = def.cycleSec;
    if (st.progress >= cycleSec) {
      const c = bizCycle(def, st.level, owned, mods);
      const n = st.manager ? Math.floor(st.progress / cycleSec) : 1;
      const gain = c.net * n;
      st.progress = st.manager ? st.progress - n * cycleSec : 0;
      if (!st.manager) st.running = false;
      income += gain;
      st.earned += gain;
    }
  }
  return income;
}

// ---------------------------------------------------------------------------
// Клик
// ---------------------------------------------------------------------------
export interface ClickRuntime {
  streak: number;
  lastClickAt: number;
}

export function doClick(s: GameState, rt: ClickRuntime, nowMs: number, mods: Mods, bizPerSec: number, rand = Math.random) {
  // Комбо растёт, если клики идут чаще, чем раз в 0,9 с
  rt.streak = nowMs - rt.lastClickAt <= BALANCE.combo.windowMs ? rt.streak + 1 : 0;
  rt.lastClickAt = nowMs;
  const combo = comboMult(rt.streak);
  const crit = rand() < mods.critChance;
  const parts = clickParts(s, mods, bizPerSec);
  const value = parts.base * combo * (crit ? mods.critMult : 1);
  addIncome(s, value);
  s.clicksLife++;
  s.stats.totalClicks++;
  if (crit) s.stats.crits++;
  if (combo > s.stats.maxCombo) s.stats.maxCombo = combo;
  return { value, crit, combo };
}

// ---------------------------------------------------------------------------
// Тик (100 мс)
// ---------------------------------------------------------------------------
export function tick(s: GameState, dt: number, nowMs: number, emit: Emit) {
  s.stats.playSeconds += dt;
  const mods = computeMods(s, nowMs);
  const real = realDay(nowMs);
  let target = s.day;
  if (s.live) target = Math.max(s.day, real);
  else {
    const spd = secPerDay(s);
    if (spd > 0) target = s.day + dt / spd;
    if (target >= real) {
      target = real;
      s.live = true;
      emit({ type: 'live' });
    }
  }
  advanceTo(s, target, mods, emit, false, undefined, s.live);
  const income = runBusinesses(s, dt, mods);
  addIncome(s, income);
  if (s.effects.length) s.effects = s.effects.filter((e) => e.until > nowMs);
  s.lastSeen = nowMs;
  return mods;
}

/** Случайное событие по реальному таймеру. Возвращает событие, если оно требует выбора. */
export function maybeRandomEvent(s: GameState, nowMs: number, mods: Mods, emit: Emit) {
  if (nowMs < s.nextRandomAt || s.pendingChoice) return;
  const { minSec, maxSec } = BALANCE.randomEvents;
  s.nextRandomAt = nowMs + (minSec + Math.random() * (maxSec - minSec)) * 1000;
  const ev = pickRandomEvent(s, mods);
  if (!ev) return;
  s.stats.randomEvents++;
  if (ev.options.length === 1) {
    const income = Math.max(totalBizPerSec(s, mods, true), clickParts(s, mods, 0).base);
    const out = applyRandomEffect(s, ev, ev.options[0].effect, income, nowMs);
    emit({ type: 'toast', kind: ev.good ? 'gold' : 'bad', emoji: ev.emoji, title: ev.name, text: `${ev.text} ${out.text}` });
  } else {
    s.pendingChoice = { id: ev.id, createdAt: nowMs };
    emit({ type: 'choice', id: ev.id });
  }
}

export const RANDOM_COUNT = RANDOM_EVENTS.length;

// ---------------------------------------------------------------------------
// Офлайн: «Пока тебя не было»
// ---------------------------------------------------------------------------
export interface AwaySummary {
  elapsedSec: number;
  countedSec: number;
  bizIncome: number;
  fromDay: number;
  toDay: number;
  nwBefore: number;
  nwAfter: number;
  portfolioBefore: number;
  portfolioAfter: number;
  totals: FlowTotals;
  movers: { id: string; change: number; held: boolean }[];
  news: { d: string; t: string }[];
  becameLive: boolean;
}

export function applyOffline(s: GameState, nowMs: number): AwaySummary | null {
  const elapsedSec = (nowMs - s.lastSeen) / 1000;
  if (!(elapsedSec >= BALANCE.offline.minSeconds)) return null;
  const mods = computeMods(s, nowMs);
  const counted = Math.min(elapsedSec, mods.offlineHours * 3600);
  const fromDay = s.day;
  const nwBefore = netWorth(s, s.live);
  const portfolioBefore = holdingsValue(s, s.live);
  const newsFrom = s.newsCursor;

  // Бизнесы с менеджерами работают офлайн с эффективностью 60%+ (навык «Офлайн-часы» повышает)
  const bizIncome = totalBizPerSec(s, mods, true) * counted * mods.offlineEff;
  addIncome(s, bizIncome);
  for (const st of Object.values(s.businesses)) if (!st.manager) {
    st.running = false;
    st.progress = 0;
  }

  // Игровое время: в живом режиме — реальное, иначе по выбранной скорости (в пределах лимита офлайна)
  const real = realDay(nowMs);
  let toDay = s.day;
  if (s.live) toDay = real;
  else {
    const spd = secPerDay(s);
    if (spd > 0) toDay = Math.min(real, s.day + counted / spd);
  }
  const wasLive = s.live;
  if (toDay >= real - 1e-9) s.live = true;
  const totals = emptyTotals();
  advanceTo(s, toDay, mods, () => undefined, true, totals, s.live);
  s.effects = s.effects.filter((e) => e.until > nowMs);
  s.lastSeen = nowMs;

  // Самые сильные движения рынка за время отсутствия
  const movers: AwaySummary['movers'] = [];
  for (const a of Object.values(ASSET_BY_ID)) {
    const p0 = priceAt(a.id, fromDay);
    const p1 = priceAt(a.id, s.day, s.live);
    if (p0 == null || p1 == null || p0 <= 0) continue;
    movers.push({ id: a.id, change: p1 / p0 - 1, held: (s.holdings[a.id]?.qty ?? 0) > 0 });
  }
  movers.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  const news = NEWS.slice(newsFrom + 1, s.newsCursor + 1).map((n) => ({ d: n.d, t: n.t }));
  return {
    elapsedSec,
    countedSec: counted,
    bizIncome,
    fromDay,
    toDay: s.day,
    nwBefore,
    nwAfter: netWorth(s, s.live),
    portfolioBefore,
    portfolioAfter: holdingsValue(s, s.live),
    totals,
    movers: [...movers.filter((m) => m.held), ...movers.filter((m) => !m.held)].slice(0, 8),
    news,
    becameLive: !wasLive && s.live,
  };
}

/** Индекс последней новости до даты старта — чтобы не показывать всю историю тостами. */
export function initNewsCursor(s: GameState) {
  const start = Math.floor(s.day);
  let i = -1;
  while (i + 1 < NEWS.length && dayNum(NEWS[i + 1].d) < start) i++;
  s.newsCursor = i;
}

export { computeMods };
