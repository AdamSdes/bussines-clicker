// Действия игрока. Все функции изменяют черновик состояния (immer) и возвращают
// результат для интерфейса: ok/ошибка и данные для тостов.
import {
  ASSET_BY_ID, BALANCE, BIZ_BY_ID, BIZ_UPGRADE_BY_ID, CLICK_UPGRADE_BY_ID, CLICK_UPGRADES, JOBS, LIFESTYLE_BY_ID,
  RATES, RIG_BY_ID, SKILL_BY_ID, TIME_MACHINE_YEARS, CITY_BY_ID,
} from './config';
import { bizUpgradeCost, bulkCost, managerCost, maxAffordable, nextMilestone, totalUnits, milestoneCount } from './economy';
import {
  bondValue, bondYears, bondYield, cityAvailable, depositRate, loanLimit, propertyQuote, propertyValue, rigAvailable, rigPrice, SELL_FEE,
} from './finance';
import { listedOn, marketOpen, priceAt } from './market';
import type { Mods } from './modifiers';
import { tradeAchievements, questEvent } from './progress';
import { ensureHolding, initNewsCursor } from './simulate';
import { rebirth } from './initial';
import { dayNum } from './time';
import { fmtMoney } from './format';
import type { GameState, Trade } from './types';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------------------
// Бизнесы
// ---------------------------------------------------------------------------
export function buyBusiness(s: GameState, id: string, want: number | 'max', mods: Mods): Result<{ bought: number; cost: number; milestone: number | null }> {
  const def = BIZ_BY_ID[id];
  if (!def) return fail('Нет такого бизнеса');
  const st = (s.businesses[id] ??= { level: 0, manager: false, progress: 0, running: false, invested: 0, earned: 0 });
  const k = want === 'max' ? maxAffordable(def, st.level, s.cash, mods) : want;
  if (k <= 0) return fail('Не хватает денег');
  const cost = bulkCost(def, st.level, k, mods);
  if (cost > s.cash * (1 + 1e-9)) return fail('Не хватает денег');
  const before = milestoneCount(st.level);
  s.cash -= cost;
  st.level += k;
  st.invested += cost;
  for (const q of questEvent(s, 'units', k)) void q;
  const after = milestoneCount(st.level);
  return { ok: true, bought: k, cost, milestone: after > before ? st.level : null };
}

/** Сколько стоит купить до следующей вехи (для кнопки «до x25») */
export function toNextMilestone(s: GameState, id: string, mods: Mods) {
  const def = BIZ_BY_ID[id];
  const lvl = s.businesses[id]?.level ?? 0;
  const next = nextMilestone(lvl);
  if (!next) return null;
  const k = next - lvl;
  return { k, cost: bulkCost(def, lvl, k, mods), target: next };
}

export function runBusiness(s: GameState, id: string): Result {
  const st = s.businesses[id];
  if (!st || st.level <= 0) return fail('Сначала открой точку');
  if (st.manager || st.running) return fail('Уже работает');
  st.running = true;
  st.progress = 0;
  return { ok: true };
}

export function hireManager(s: GameState, id: string, mods: Mods): Result<{ cost: number }> {
  const def = BIZ_BY_ID[id];
  const st = s.businesses[id];
  if (!def || !st || st.level <= 0) return fail('Сначала открой точку');
  if (st.manager) return fail('Менеджер уже есть');
  const cost = managerCost(def, mods);
  if (s.cash < cost) return fail('Не хватает денег');
  s.cash -= cost;
  st.manager = true;
  st.running = false;
  return { ok: true, cost };
}

export function buyBizUpgrade(s: GameState, upgradeId: string): Result<{ cost: number }> {
  const u = BIZ_UPGRADE_BY_ID[upgradeId];
  if (!u) return fail('Нет такого улучшения');
  if (s.bizUpgrades.includes(upgradeId)) return fail('Уже куплено');
  if ((s.businesses[u.biz]?.level ?? 0) <= 0) return fail('Сначала открой бизнес');
  const cost = bizUpgradeCost(upgradeId);
  if (s.cash < cost) return fail('Не хватает денег');
  s.cash -= cost;
  s.bizUpgrades.push(upgradeId);
  return { ok: true, cost };
}

// ---------------------------------------------------------------------------
// Карьера и клик
// ---------------------------------------------------------------------------
export function nextJob(s: GameState) {
  const i = JOBS.findIndex((j) => j.id === s.job);
  return JOBS[i + 1] ?? null;
}

export function jobRequirements(s: GameState) {
  const j = nextJob(s);
  if (!j) return null;
  const units = totalUnits(s);
  return {
    job: j,
    clicksOk: s.clicksLife >= j.clicks,
    unitsOk: units >= (j.needUnits ?? 0),
    cashOk: s.cash >= j.cost,
    units,
  };
}

export function promote(s: GameState): Result<{ job: string }> {
  const r = jobRequirements(s);
  if (!r) return fail('Ты уже на вершине карьеры');
  if (!r.clicksOk) return fail(`Нужно ${r.job.clicks} кликов опыта`);
  if (!r.unitsOk) return fail(`Нужно ${r.job.needUnits} точек бизнеса`);
  if (!r.cashOk) return fail('Не хватает денег на обучение');
  s.cash -= r.job.cost;
  s.job = r.job.id;
  return { ok: true, job: r.job.id };
}

export function nextClickUpgrade(s: GameState) {
  return CLICK_UPGRADES.find((u) => !s.clickUpgrades.includes(u.id)) ?? null;
}

export function buyClickUpgrade(s: GameState, id: string): Result<{ cost: number }> {
  const u = CLICK_UPGRADE_BY_ID[id];
  if (!u || s.clickUpgrades.includes(id)) return fail('Недоступно');
  if (s.cash < u.cost) return fail('Не хватает денег');
  s.cash -= u.cost;
  s.clickUpgrades.push(id);
  return { ok: true, cost: u.cost };
}

// ---------------------------------------------------------------------------
// Торговля
// ---------------------------------------------------------------------------
export function tradeFee(id: string, amount: number, mods: Pick<Mods, 'feeMult'>): number {
  const kind = ASSET_BY_ID[id]?.kind;
  const rate = kind === 'crypto' ? BALANCE.trading.cryptoFee : BALANCE.trading.stockFee;
  return Math.max(BALANCE.trading.minFee, amount * rate) * mods.feeMult;
}

/** Исполнимая цена: ниже $0.01 не продаём/не покупаем (нефть в минусе 20.04.2020 — по $0.01) */
export function execPrice(id: string, day: number, liveNow: boolean): number | null {
  const p = priceAt(id, day, liveNow);
  if (p == null) return null;
  return Math.max(p, 0.01);
}

export function maxBuyQty(s: GameState, id: string, liveNow: boolean, mods: Mods): number {
  const p = execPrice(id, s.day, liveNow);
  if (!p || s.cash <= 0) return 0;
  const kind = ASSET_BY_ID[id]?.kind;
  const rate = (kind === 'crypto' ? BALANCE.trading.cryptoFee : BALANCE.trading.stockFee) * mods.feeMult;
  let q = (s.cash - BALANCE.trading.minFee * mods.feeMult) / (p * (1 + rate));
  if (kind !== 'crypto' && kind !== 'fx' && kind !== 'commodity') q = Math.floor(q * 1e4) / 1e4;
  return Math.max(0, q);
}

export interface TradeResult {
  trade: Trade;
  fee: number;
  achievements: string[];
}

export function trade(s: GameState, id: string, side: 'buy' | 'sell', qty: number, mods: Mods, liveNow: boolean): Result<TradeResult> {
  const a = ASSET_BY_ID[id];
  if (!a) return fail('Нет такого актива');
  if (!listedOn(id, s.day)) return fail('Актив ещё не торгуется на эту дату');
  if (!marketOpen(id, s.day)) return fail('Биржа закрыта: выходные. Крипта торгуется 24/7');
  if (!(qty > 0) || !Number.isFinite(qty)) return fail('Укажи количество');
  const price = execPrice(id, s.day, liveNow)!;
  const amount = price * qty;
  const fee = tradeFee(id, amount, mods);
  const day = s.day;
  let pnl: number | undefined;
  let pnlPct: number | undefined;
  if (side === 'buy') {
    if (amount + fee > s.cash * (1 + 1e-9)) return fail('Не хватает денег');
    s.cash -= amount + fee;
    const h = ensureHolding(s, id, day);
    h.qty += qty;
    h.cost += amount + fee;
    s.stats.invFlows += amount + fee;
    questEvent(s, 'trades', 1);
    if (a.kind === 'stock') questEvent(s, 'buy_stock', 1, { asset: id, day });
  } else {
    const h = s.holdings[id];
    if (!h || h.qty <= 0) return fail('Нечего продавать');
    const q = Math.min(qty, h.qty);
    const proceeds = price * q - tradeFee(id, price * q, mods);
    const basis = (h.cost * q) / h.qty;
    pnl = proceeds - basis;
    pnlPct = basis > 0 ? pnl / basis : 0;
    h.qty -= q;
    h.cost -= basis;
    h.realized += pnl;
    if (h.qty <= 1e-12) {
      h.qty = 0;
      h.cost = 0;
    }
    s.cash += proceeds;
    // реализованная прибыль считается заработком для IPO
    if (pnl > 0) {
      s.earnedLife += pnl;
      s.earnedTotal += pnl;
    }
    s.stats.invFlows -= proceeds;
    s.stats.lastSellDay = day;
    questEvent(s, 'trades', 1);
    questEvent(s, 'sell', 1);
    qty = q;
  }
  const t: Trade = { id: uid(), side, qty, price, day, pnl, pnlPct };
  (s.trades[id] ??= []).push(t);
  if (s.trades[id].length > 60) s.trades[id] = s.trades[id].slice(-60);
  s.stats.tradesCount++;
  if (pnl != null && pnlPct != null) {
    if (!s.stats.bestTrade || pnl > s.stats.bestTrade.pnl) s.stats.bestTrade = { id, pnl, pnlPct, day };
    if (!s.stats.worstTrade || pnl < s.stats.worstTrade.pnl) s.stats.worstTrade = { id, pnl, pnlPct, day };
  }
  const achievements = tradeAchievements(s, id, side, priceAt(id, day, liveNow) ?? price, day, pnlPct);
  return { ok: true, trade: t, fee, achievements };
}

// ---------------------------------------------------------------------------
// Майнинг
// ---------------------------------------------------------------------------
export function buyRig(s: GameState, rigId: string, n: number): Result<{ cost: number }> {
  if (!RIG_BY_ID[rigId]) return fail('Нет такого оборудования');
  if (!rigAvailable(rigId, s.day)) return fail('Это оборудование ещё не выпущено');
  const cost = rigPrice(rigId, s.day) * n;
  if (s.cash < cost) return fail('Не хватает денег');
  s.cash -= cost;
  s.rigs[rigId] = (s.rigs[rigId] ?? 0) + n;
  s.rigsBoughtValue += cost;
  return { ok: true, cost };
}

export function sellRig(s: GameState, rigId: string, n: number): Result<{ proceeds: number }> {
  const have = s.rigs[rigId] ?? 0;
  const k = Math.min(have, n);
  if (k <= 0) return fail('Нечего продавать');
  const proceeds = rigPrice(rigId, s.day) * 0.7 * k;
  s.rigs[rigId] = have - k;
  s.cash += proceeds;
  return { ok: true, proceeds };
}

// ---------------------------------------------------------------------------
// Недвижимость
// ---------------------------------------------------------------------------
export function buyProperty(s: GameState, cityId: string, typeId: string): Result<{ cost: number }> {
  if (!CITY_BY_ID[cityId]) return fail('Нет такого города');
  if (!cityAvailable(cityId, s.day)) return fail('Рынок ещё недоступен иностранцам');
  const q = propertyQuote(cityId, typeId, s.day);
  if (s.cash < q.total) return fail('Не хватает денег');
  s.cash -= q.total;
  s.properties.push({ uid: uid(), city: cityId, type: typeId, area: q.area, boughtDay: s.day, cost: q.total, rentEarned: 0 });
  questEvent(s, 'property', 1);
  return { ok: true, cost: q.total };
}

export function sellProperty(s: GameState, propUid: string): Result<{ proceeds: number; pnl: number }> {
  const i = s.properties.findIndex((p) => p.uid === propUid);
  if (i < 0) return fail('Нет такого объекта');
  const p = s.properties[i];
  const proceeds = propertyValue(p, s.day) * (1 - SELL_FEE);
  const pnl = proceeds - p.cost;
  s.properties.splice(i, 1);
  s.cash += proceeds;
  if (pnl > 0) {
    s.earnedLife += pnl;
    s.earnedTotal += pnl;
  }
  return { ok: true, proceeds, pnl };
}

// ---------------------------------------------------------------------------
// Банк
// ---------------------------------------------------------------------------
export function openDeposit(s: GameState, kind: 'flex' | 'term', amount: number, mods: Mods): Result {
  if (!(amount > 0) || amount > s.cash) return fail('Некорректная сумма');
  const p = RATES.deposits.find((d) => d.id === kind)!;
  const rate = depositRate(kind, s.day, mods);
  s.cash -= amount;
  if (kind === 'flex') {
    const ex = s.deposits.find((d) => d.kind === 'flex');
    if (ex) {
      ex.amount += amount;
      return { ok: true };
    }
  }
  s.deposits.push({ uid: uid(), kind, amount, rate, openDay: s.day, endDay: p.days ? Math.floor(s.day) + p.days : undefined, interest: 0 });
  return { ok: true };
}

export function closeDeposit(s: GameState, depUid: string, amount?: number): Result<{ paid: number; lost: number }> {
  const i = s.deposits.findIndex((d) => d.uid === depUid);
  if (i < 0) return fail('Нет такого вклада');
  const d = s.deposits[i];
  if (d.kind === 'flex') {
    const take = Math.min(d.amount, amount ?? d.amount);
    d.amount -= take;
    s.cash += take;
    if (d.amount < 0.01) s.deposits.splice(i, 1);
    return { ok: true, paid: take, lost: 0 };
  }
  // досрочное закрытие срочного вклада — проценты сгорают
  s.cash += d.amount;
  s.deposits.splice(i, 1);
  return { ok: true, paid: d.amount, lost: d.interest };
}

export function buyBond(s: GameState, kind: string, amount: number): Result {
  if (!(amount > 0) || amount > s.cash) return fail('Некорректная сумма');
  const years = bondYears(kind);
  s.cash -= amount;
  s.bonds.push({
    uid: uid(),
    kind,
    face: amount,
    coupon: bondYield(kind, s.day),
    buyDay: s.day,
    maturityDay: Math.floor(s.day + years * 365.25),
    coupons: 0,
  });
  return { ok: true };
}

export function sellBond(s: GameState, bondUid: string): Result<{ proceeds: number; pnl: number }> {
  const i = s.bonds.findIndex((b) => b.uid === bondUid);
  if (i < 0) return fail('Нет такой облигации');
  const b = s.bonds[i];
  const proceeds = bondValue(b, s.day);
  s.bonds.splice(i, 1);
  s.cash += proceeds;
  return { ok: true, proceeds, pnl: proceeds - b.face };
}

export function borrow(s: GameState, amount: number): Result {
  const room = loanLimit(s) - s.loan;
  if (!(amount > 0)) return fail('Укажи сумму');
  if (amount > room) return fail(`Лимит кредита: ${fmtMoney(Math.max(0, room))}`);
  s.loan += amount;
  s.cash += amount;
  return { ok: true };
}

export function repay(s: GameState, amount: number): Result {
  const pay = Math.min(amount, s.loan, s.cash);
  if (!(pay > 0)) return fail('Нечем гасить');
  s.loan -= pay;
  s.cash -= pay;
  if (s.loan < 0.01) s.loan = 0;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Лайфстайл, навыки, IPO
// ---------------------------------------------------------------------------
export function buyLifestyle(s: GameState, id: string): Result<{ cost: number }> {
  const it = LIFESTYLE_BY_ID[id];
  if (!it) return fail('Нет такого предмета');
  if (s.lifestyle.includes(id)) return fail('Уже есть');
  if (s.cash < it.price) return fail('Не хватает денег');
  s.cash -= it.price;
  s.lifestyle.push(id);
  if (!s.collection.includes(id)) s.collection.push(id);
  s.stats.lifestyleSpent += it.price;
  return { ok: true, cost: it.price };
}

export function skillCost(s: GameState, id: string): number {
  const sk = SKILL_BY_ID[id];
  const lvl = s.skills[id] ?? 0;
  return Math.ceil(sk.base * Math.pow(sk.growth, lvl));
}

export function canBuySkill(s: GameState, id: string): string | null {
  const sk = SKILL_BY_ID[id];
  if (!sk) return 'Нет такого навыка';
  if ((s.skills[id] ?? 0) >= sk.max) return 'Максимальный уровень';
  if (sk.requires && !(s.skills[sk.requires] > 0)) return `Сначала изучи «${SKILL_BY_ID[sk.requires].name}»`;
  if (s.reputation < skillCost(s, id)) return 'Не хватает репутации';
  return null;
}

export function buySkill(s: GameState, id: string): Result {
  const err = canBuySkill(s, id);
  if (err) return fail(err);
  s.reputation -= skillCost(s, id);
  s.skills[id] = (s.skills[id] ?? 0) + 1;
  return { ok: true };
}

/** Репутация за все жизни: floor(coef · sqrt(заработано / base)); прирост — сверх уже полученной */
export function totalRepFor(earnedTotal: number): number {
  const p = BALANCE.prestige;
  return Math.floor(p.coef * Math.sqrt(Math.max(0, earnedTotal) / p.base));
}

export function ipoGain(s: GameState): number {
  return Math.max(0, totalRepFor(s.earnedTotal) - s.repEarned);
}

export function canIpo(s: GameState): boolean {
  return s.earnedLife >= BALANCE.prestige.minEarnings && ipoGain(s) > 0;
}

export function availableStartYears(s: GameState): number[] {
  return TIME_MACHINE_YEARS[Math.min(s.skills.timemachine ?? 0, TIME_MACHINE_YEARS.length - 1)];
}

export function doIpo(s: GameState, startYear: number): Result<{ gain: number; next: GameState }> {
  if (!canIpo(s)) return fail(`IPO возможно после заработка ${fmtMoney(BALANCE.prestige.minEarnings)} за жизнь`);
  const gain = ipoGain(s);
  const years = s.mode === 'sandbox' ? [startYear] : availableStartYears(s);
  const year = years.includes(startYear) ? startYear : years[0];
  const startDate = s.mode === 'sandbox' ? s.startDate : year === 2009 ? BALANCE.storyStart : `${year}-01-01`;
  const prev = { ...s, reputation: s.reputation + gain, repEarned: s.repEarned + gain, ipos: s.ipos + 1 };
  const next = rebirth(prev, startDate);
  initNewsCursor(next);
  return { ok: true, gain, next };
}

export function sandboxStart(year: number) {
  return `${year}-01-01`;
}

export const DAY = dayNum;
