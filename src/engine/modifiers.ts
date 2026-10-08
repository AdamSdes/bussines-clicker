// Сборка всех множителей игры из состояния: репутация, навыки, лайфстайл,
// достижения, временные эффекты событий и исторические периоды (COVID, инфляция…).
import {
  ACHIEVEMENT_BONUS, BALANCE, HIST_EFFECTS, LIFESTYLE_BY_ID, SKILL_BY_ID, type HistEffectDef,
} from './config';
import { dayNum } from './time';
import type { BizCategory, ExpenseKey, GameState } from './types';

export interface Mods {
  /** Итоговый множитель прибыли бизнесов (без исторических эффектов) */
  incomeMult: number;
  breakdown: { rep: number; skills: number; lifestyle: number; achievements: number; effects: number };
  /** Активные исторические периоды на текущую игровую дату */
  hist: HistEffectDef[];
  demand: (cat: BizCategory) => number;
  costMult: (cat: BizCategory, key: ExpenseKey) => number;
  /** Множитель от временных случайных событий для конкретного бизнеса */
  bizEffect: (bizId: string) => number;
  taxRate: number;
  baseTaxRate: number;
  /** Скидка на открытие точек (0..0.6) */
  discount: number;
  managerDiscount: number;
  clickMult: number;
  critChance: number;
  critMult: number;
  offlineHours: number;
  offlineEff: number;
  rentMult: number;
  electricityMult: number;
  depositBonus: number;
  loanDiscount: number;
  feeMult: number;
  insider: number;
}

const HIST_RANGES = HIST_EFFECTS.map((e) => ({ e, from: dayNum(e.from), to: dayNum(e.to) }));

export function activeHistorical(day: number): HistEffectDef[] {
  const d = Math.floor(day);
  return HIST_RANGES.filter((r) => d >= r.from && d <= r.to).map((r) => r.e);
}

export function skillLevel(s: GameState, id: string): number {
  return s.skills[id] ?? 0;
}

function skillEffect(s: GameState, id: string): number {
  return skillLevel(s, id) * (SKILL_BY_ID[id]?.effect ?? 0);
}

/** Историческая ставка налога на прибыль США: 35% до 2018, 21% — после реформы TCJA. */
export function historicalTax(day: number): number {
  let rate = BALANCE.tax.historical[0][1] as number;
  for (const [date, r] of BALANCE.tax.historical as [string, number][]) if (day >= dayNum(date)) rate = r;
  return rate;
}

export function computeMods(s: GameState, nowMs = Date.now()): Mods {
  // Репутация: каждое очко, заработанное на IPO, — +2% к прибыли навсегда
  const rep = 1 + s.repEarned * BALANCE.prestige.bonusPerRep;
  // MBA: +25% за уровень
  const skills = 1 + skillEffect(s, 'mba');
  let lifeIncome = 0;
  let lifeClick = 0;
  let lifeCrit = 0;
  let lifeDiscount = 0;
  let lifeOffline = 0;
  for (const id of s.lifestyle) {
    const b = LIFESTYLE_BY_ID[id]?.bonus;
    if (!b) continue;
    lifeIncome += b.income ?? 0;
    lifeClick += b.click ?? 0;
    lifeCrit += b.crit ?? 0;
    lifeDiscount += b.discount ?? 0;
    lifeOffline += b.offline ?? 0;
  }
  const lifestyle = 1 + lifeIncome;
  const achievements = 1 + Object.keys(s.achievements).length * ACHIEVEMENT_BONUS;

  // Временные эффекты (золотой клиент, статья в Forbes, поломка…)
  let effects = 1;
  let effClick = 1;
  const bizEff: Record<string, number> = {};
  for (const e of s.effects) {
    if (e.until <= nowMs) continue;
    if (e.incomeMult != null) effects *= e.incomeMult;
    if (e.clickMult != null) effClick *= e.clickMult;
    for (const [id, m] of Object.entries(e.bizMult ?? {})) bizEff[id] = (bizEff[id] ?? 1) * m;
  }

  const hist = activeHistorical(s.day);
  const demandCache = new Map<BizCategory, number>();
  const demand = (cat: BizCategory) => {
    let m = demandCache.get(cat);
    if (m == null) {
      m = 1;
      for (const h of hist) m *= (h.demand?.[cat] ?? 1) * (h.demand?.['*'] ?? 1);
      demandCache.set(cat, m);
    }
    return m;
  };
  const costMult = (cat: BizCategory, key: ExpenseKey) => {
    let m = 1;
    for (const h of hist) m *= (h.costs?.[cat]?.[key] ?? 1) * (h.costs?.['*']?.[key] ?? 1);
    return m;
  };

  const baseTaxRate = s.settings.taxMode === 'custom' ? s.settings.taxRate : historicalTax(s.day);
  const taxRate = baseTaxRate * Math.max(0, 1 - skillEffect(s, 'tax'));

  const offlineLvl = skillLevel(s, 'offline');
  return {
    incomeMult: rep * skills * lifestyle * achievements * effects,
    breakdown: { rep, skills, lifestyle, achievements, effects },
    hist,
    demand,
    costMult,
    bizEffect: (id) => bizEff[id] ?? 1,
    taxRate,
    baseTaxRate,
    discount: Math.min(0.6, skillEffect(s, 'franchising') + lifeDiscount),
    managerDiscount: Math.min(0.8, skillEffect(s, 'hr')),
    clickMult: (1 + skillEffect(s, 'charisma')) * (1 + lifeClick) * effClick,
    critChance: Math.min(0.5, BALANCE.crit.chance + skillEffect(s, 'luck') + lifeCrit),
    critMult: BALANCE.crit.mult,
    offlineHours: BALANCE.offline.baseHours + skillEffect(s, 'offline') + lifeOffline,
    offlineEff: Math.min(1, BALANCE.offline.efficiency + offlineLvl * 0.08),
    rentMult: 1 + skillEffect(s, 'realtor'),
    electricityMult: Math.max(0.2, 1 - skillEffect(s, 'energy')),
    depositBonus: skillEffect(s, 'banker'),
    loanDiscount: skillEffect(s, 'banker') * 2,
    feeMult: Math.max(0, 1 - skillEffect(s, 'broker')),
    insider: skillLevel(s, 'insider'),
  };
}
