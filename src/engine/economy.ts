// Экономика бизнесов и кликов. Все формулы — с пояснениями.
import {
  BIZ_BY_ID, BIZ_UPGRADES, BIZ_UPGRADE_BY_ID, BUSINESSES, CLICK_UPGRADE_BY_ID, JOB_BY_ID, MILESTONES, MILESTONE_MULT, BALANCE,
} from './config';
import type { Mods } from './modifiers';
import type { BizState, BusinessDef, ExpenseKey, GameState } from './types';

// ---------------------------------------------------------------------------
// Вехи: на 25/50/100/200/… точках прибыль бизнеса удваивается
// ---------------------------------------------------------------------------
export function milestoneCount(level: number): number {
  let n = 0;
  for (const m of MILESTONES) if (level >= m) n++;
  return n;
}

/** Множитель вех = 2^(число пройденных вех) */
export function milestoneMult(level: number): number {
  return Math.pow(MILESTONE_MULT, milestoneCount(level));
}

export function nextMilestone(level: number): number | null {
  return MILESTONES.find((m) => m > level) ?? null;
}

// ---------------------------------------------------------------------------
// Цена точек: геометрическая прогрессия
//   цена n-й точки   = base · g^n · (1 − скидка)
//   цена k точек     = base · g^n · (g^k − 1)/(g − 1) · (1 − скидка)
// ---------------------------------------------------------------------------
export function unitCost(def: BusinessDef, level: number, mods: Pick<Mods, 'discount'>): number {
  return def.baseCost * Math.pow(def.costGrowth, level) * (1 - mods.discount);
}

export function bulkCost(def: BusinessDef, level: number, k: number, mods: Pick<Mods, 'discount'>): number {
  const g = def.costGrowth;
  return def.baseCost * Math.pow(g, level) * ((Math.pow(g, k) - 1) / (g - 1)) * (1 - mods.discount);
}

/** Сколько точек можно купить на cash: k = floor(log_g(cash·(g−1)/(base·g^n·(1−d)) + 1)) */
export function maxAffordable(def: BusinessDef, level: number, cash: number, mods: Pick<Mods, 'discount'>): number {
  const g = def.costGrowth;
  const first = def.baseCost * Math.pow(g, level) * (1 - mods.discount);
  if (cash < first) return 0;
  const k = Math.floor(Math.log((cash * (g - 1)) / first + 1) / Math.log(g));
  return Math.max(0, Math.min(k, 100000));
}

export function managerCost(def: BusinessDef, mods: Pick<Mods, 'managerDiscount'>): number {
  return def.managerCost * (1 - mods.managerDiscount);
}

export function bizUpgradeCost(upgradeId: string): number {
  const u = BIZ_UPGRADE_BY_ID[upgradeId];
  return u.costMult * BIZ_BY_ID[u.biz].baseCost;
}

export function upgradesFor(bizId: string) {
  return BIZ_UPGRADES.filter((u) => u.biz === bizId);
}

/** Произведение маркетинговых множителей выручки */
export function revenueMult(bizId: string, owned: ReadonlySet<string>): number {
  let m = 1;
  for (const u of BIZ_UPGRADES) if (u.biz === bizId && u.type === 'revenue' && owned.has(u.id)) m *= u.value;
  return m;
}

/**
 * Доли расходов в выручке после оптимизаций и исторических эффектов.
 * Оптимизация снижает статью на value (например, −15% себестоимости),
 * исторический эффект умножает (инфляция 2022: зарплаты ×1,08).
 */
export function expenseShares(def: BusinessDef, owned: ReadonlySet<string>, mods: Pick<Mods, 'costMult'>): Record<ExpenseKey, number> {
  const out = { ...def.expenses };
  for (const u of BIZ_UPGRADES) {
    if (u.biz !== def.id || u.type === 'revenue' || !owned.has(u.id)) continue;
    out[u.type] *= 1 - u.value;
  }
  for (const k of Object.keys(out) as ExpenseKey[]) out[k] *= mods.costMult(def.category, k);
  return out;
}

export interface CycleEcon {
  revenue: number;
  cogs: number;
  rent: number;
  salaries: number;
  preTax: number;
  tax: number;
  net: number;
  cycleSec: number;
  margin: number;
}

/**
 * Экономика одного цикла бизнеса:
 *   выручка = revenue · точки · 2^вехи · маркетинг · общий множитель · спрос эпохи · эффекты
 *   прибыль до налога = выручка · (1 − себестоимость − аренда − зарплаты)
 *   налог = max(0, прибыль) · ставка
 *   чистая прибыль = прибыль до налога − налог
 */
export function bizCycle(def: BusinessDef, level: number, owned: ReadonlySet<string>, mods: Mods): CycleEcon {
  const revenue =
    def.revenue * level * milestoneMult(level) * revenueMult(def.id, owned) * mods.incomeMult * mods.demand(def.category) * mods.bizEffect(def.id);
  const sh = expenseShares(def, owned, mods);
  const cogs = revenue * sh.cogs;
  const rent = revenue * sh.rent;
  const salaries = revenue * sh.salaries;
  const preTax = revenue - cogs - rent - salaries;
  const tax = Math.max(0, preTax) * mods.taxRate;
  const net = preTax - tax;
  return { revenue, cogs, rent, salaries, preTax, tax, net, cycleSec: def.cycleSec, margin: revenue > 0 ? net / revenue : 0 };
}

export function ownedSet(s: GameState): Set<string> {
  return new Set(s.bizUpgrades);
}

/** Чистая прибыль бизнеса в секунду (если цикл крутится непрерывно). */
export function bizNetPerSec(def: BusinessDef, st: BizState | undefined, owned: ReadonlySet<string>, mods: Mods): number {
  if (!st || st.level <= 0) return 0;
  const c = bizCycle(def, st.level, owned, mods);
  return c.net / c.cycleSec;
}

/** Доход бизнесов в секунду (по умолчанию — только автоматизированные менеджерами). */
export function totalBizPerSec(s: GameState, mods: Mods, onlyManaged = true): number {
  const owned = ownedSet(s);
  let sum = 0;
  for (const def of BUSINESSES) {
    const st = s.businesses[def.id];
    if (!st || st.level <= 0) continue;
    if (onlyManaged && !st.manager) continue;
    sum += bizNetPerSec(def, st, owned, mods);
  }
  return sum;
}

export function totalUnits(s: GameState): number {
  let n = 0;
  for (const st of Object.values(s.businesses)) n += st.level;
  return n;
}

// ---------------------------------------------------------------------------
// Клик = почасовая ставка профессии × улучшения × навыки + доля от дохода/сек
// ---------------------------------------------------------------------------
export function clickParts(s: GameState, mods: Mods, bizPerSec: number) {
  const job = JOB_BY_ID[s.job] ?? JOB_BY_ID.courier;
  let mult = 1;
  let share = 0;
  for (const id of s.clickUpgrades) {
    const u = CLICK_UPGRADE_BY_ID[id];
    if (!u) continue;
    mult *= u.mult ?? 1;
    share += u.incomeShare ?? 0;
  }
  const wage = job.hourly * mult * mods.clickMult;
  const fromIncome = share * bizPerSec * mods.clickMult;
  return { wage, fromIncome, base: wage + fromIncome, share, mult };
}

/** Комбо: +4% за каждый быстрый клик подряд, максимум ×5 */
export function comboMult(streak: number): number {
  return Math.min(BALANCE.combo.max, 1 + streak * BALANCE.combo.perClick);
}
