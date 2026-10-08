// Достижения и квесты.
import { ACHIEVEMENTS, ASSET_BY_ID, JOBS, QUESTS_DAILY, QUESTS_WEEKLY, RANKS, type AchievementDef, type QuestTemplate } from './config';
import { totalUnits } from './economy';
import { nextEarnings, priceAt } from './market';
import { holdingsValue } from './networth';
import { dayNum, localDayKey, localWeekKey } from './time';
import type { GameState, QuestProgress } from './types';
import { forbesFor } from './networth';
import { fmtMoney, fmtNum } from './format';

const D = (s: unknown) => dayNum(String(s));

function rankThresholdById(id: string, day: number): number {
  const r = RANKS.find((x) => x.id === id);
  if (!r) return Infinity;
  if (r.min != null) return r.min;
  const f = forbesFor(day);
  if (r.forbes === 100) return f.threshold100 * 1e9;
  if (r.forbes === 10) return f.top[9][1] * 1e9;
  return f.top[0][1] * 1e9;
}

export interface AchCtx {
  nw: number;
  liveNow: boolean;
}

/** Проверка «статических» достижений (по состоянию). Возвращает новые id. */
export function checkAchievements(s: GameState, ctx: AchCtx): string[] {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    if (evalAch(s, a, ctx)) got.push(a.id);
  }
  return got;
}

function evalAch(s: GameState, a: AchievementDef, ctx: AchCtx): boolean {
  const n = Number(a.n ?? 0);
  const h = a.asset ? s.holdings[String(a.asset)] : undefined;
  switch (a.type) {
    case 'clicks': return s.stats.totalClicks >= n;
    case 'crits': return s.stats.crits >= n;
    case 'combo': return s.stats.maxCombo >= n;
    case 'job': return JOBS.findIndex((j) => j.id === s.job) >= JOBS.findIndex((j) => j.id === a.job);
    case 'units': return totalUnits(s) >= n;
    case 'bizLevel': return (s.businesses[String(a.biz)]?.level ?? 0) >= n;
    case 'managers': return Object.values(s.businesses).filter((b) => b.manager).length >= n;
    case 'costUpgrades': return s.bizUpgrades.filter((u) => !/_mkt\d$/.test(u)).length >= n;
    case 'netWorth': return Math.max(ctx.nw, s.stats.maxNetWorth) >= n;
    case 'rank': return ctx.nw >= rankThresholdById(String(a.rank), s.day);
    case 'holdQty': return !!h && h.qty >= Number(a.qty);
    case 'holdValue': {
      if (!h || h.qty <= 0) return false;
      const p = priceAt(String(a.asset), s.day, ctx.liveNow) ?? 0;
      return h.qty * p >= Number(a.value);
    }
    case 'holdThrough': return !!h && h.qty > 0 && h.since <= D(a.from) && s.day >= D(a.to);
    case 'holdYears': return !!h && h.qty > 0 && s.day - h.since >= Number(a.years) * 365.25;
    case 'dividends': return s.stats.dividendsTotal >= n;
    case 'splits': return s.stats.splits >= n;
    case 'mined': return s.stats.minedBTC >= n;
    case 'rig': return (s.rigs[String(a.rig)] ?? 0) > 0;
    case 'properties': return s.properties.length >= n;
    case 'cities': return new Set(s.properties.map((p) => p.city)).size >= n;
    case 'city': return s.properties.some((p) => p.city === a.city);
    case 'propertyType': return s.properties.some((p) => p.type === a.ptype);
    case 'deposits': return s.deposits.length >= n;
    case 'bonds': return s.bonds.length >= n;
    case 'loan': return s.loan > 0;
    case 'reachDate': return s.day >= D(a.date);
    case 'live': return s.live;
    case 'lifestyle': return s.collection.length >= n;
    case 'item': return s.collection.includes(String(a.item));
    case 'ipo': return s.ipos >= n;
    case 'skills': return Object.values(s.skills).reduce((x, y) => x + y, 0) >= n;
    case 'streak': return s.dailyReward.streak >= n;
    case 'audits': return s.stats.audits >= n;
    case 'beatMarket': {
      const hist = s.stats.history.filter((x) => x[2] > 0 && x[3] > 0);
      const firstInv = hist.find((x) => x[2] !== 1);
      if (!firstInv) return false;
      const last = hist[hist.length - 1];
      if (last[0] - firstInv[0] < 365) return false;
      const start = hist.find((x) => x[0] >= firstInv[0] - 7) ?? firstInv;
      const portfolio = last[2] / start[2];
      const market = last[3] / start[3];
      return portfolio >= 2 * market && portfolio > 1;
    }
    default: return false;
  }
}

/** Достижения, которые проверяются в момент сделки. */
export function tradeAchievements(s: GameState, asset: string, side: 'buy' | 'sell', price: number, day: number, pnlPct?: number): string[] {
  const got: string[] = [];
  const kind = ASSET_BY_ID[asset]?.kind;
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    let ok = false;
    switch (a.type) {
      case 'buyBelow': ok = side === 'buy' && a.asset === asset && price < Number(a.price); break;
      case 'buyBefore': ok = side === 'buy' && a.asset === asset && day <= D(a.date); break;
      case 'buyBetween': ok = side === 'buy' && a.asset === asset && day >= D(a.from) && day <= D(a.to); break;
      case 'buyKindBetween': ok = side === 'buy' && kind === a.kind && day >= D(a.from) && day <= D(a.to); break;
      case 'sellBetween': ok = side === 'sell' && a.asset === asset && day >= D(a.from) && day <= D(a.to); break;
      case 'sellAbove': ok = side === 'sell' && a.asset === asset && price > Number(a.price); break;
      case 'tradePct': ok = side === 'sell' && (pnlPct ?? 0) >= Number(a.pct); break;
    }
    if (ok) got.push(a.id);
  }
  return got;
}

/** Достижения «владей X в день D» и «майнил во время халвинга» — проверяются при смене дня. */
export function dayAchievements(s: GameState, day: number): string[] {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.achievements[a.id]) continue;
    if (a.type === 'holdOn' && D(a.date) === day) {
      const h = s.holdings[String(a.asset)];
      if (h && h.qty >= Number(a.qty)) got.push(a.id);
    }
    if (a.type === 'halving' && Object.values(s.rigs).some((n) => n > 0)) {
      if (['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'].some((d) => D(d) === day)) got.push(a.id);
    }
    if (a.type === 'mineBefore' && s.stats.minedBTC > 0 && day <= D(a.date)) got.push(a.id);
  }
  return got;
}

// ---------------------------------------------------------------------------
// Квесты
// ---------------------------------------------------------------------------
export interface QuestCtx {
  incomePerSec: number;
  nw: number;
  miningPerDay: number;
  portfolio: number;
}

function hashKey(k: string): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeQuest(t: QuestTemplate, rand: () => number, s: GameState, ctx: QuestCtx, idx: number, key: string): QuestProgress {
  let target = t.targets[Math.floor(rand() * t.targets.length)];
  if (t.scale === 'incomeSec') target = Math.max(t.minTarget ?? 0, target * ctx.incomePerSec);
  if (t.scale === 'miningDays') target = Math.max(1e-6, target * ctx.miningPerDay);
  const q: QuestProgress = {
    id: `${key}-${t.id}-${idx}`,
    template: t.id,
    target,
    progress: 0,
    reward: { rep: t.reward.rep },
    done: false,
    claimed: false,
  };
  if (t.id === 'earn' || t.id === 'earn_big') q.baseline = s.earnedLife;
  if (t.id === 'networth_x2') q.baseline = Math.max(1000, ctx.nw);
  if (t.id === 'mine') q.baseline = s.stats.minedBTC;
  if (t.id === 'hold_drop') q.data = { peak: ctx.portfolio };
  return q;
}

function pickTemplates(pool: QuestTemplate[], n: number, rand: () => number, s: GameState, ctx: QuestCtx): QuestTemplate[] {
  const ok = pool.filter((t) => {
    if (t.id === 'mine') return ctx.miningPerDay > 0;
    if (t.id === 'dividends') return Object.keys(s.holdings).length > 0 || s.day > dayNum('2009-01-01');
    return true;
  });
  const out: QuestTemplate[] = [];
  const copy = [...ok];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

/** Обновляет набор ежедневных/еженедельных квестов при смене реального дня/недели. */
export function ensureQuests(s: GameState, ctx: QuestCtx, nowMs = Date.now()): boolean {
  let changed = false;
  const dk = localDayKey(nowMs);
  const wk = localWeekKey(nowMs);
  if (s.quests.dailyKey !== dk) {
    const rand = seeded(hashKey(dk + s.createdAt));
    s.quests.daily = pickTemplates(QUESTS_DAILY, 3, rand, s, ctx).map((t, i) => makeQuest(t, rand, s, ctx, i, dk));
    s.quests.dailyKey = dk;
    changed = true;
  }
  if (s.quests.weeklyKey !== wk) {
    const rand = seeded(hashKey(wk + s.createdAt + 'w'));
    s.quests.weekly = pickTemplates(QUESTS_WEEKLY, 3, rand, s, ctx).map((t, i) => makeQuest(t, rand, s, ctx, i, wk));
    s.quests.weeklyKey = wk;
    changed = true;
  }
  return changed;
}

function all(s: GameState) {
  return [...s.quests.daily, ...s.quests.weekly];
}

/** Событие для квестов: clicks, crits, combo, units, trades, earnings_buy, dividends, days, property, sell, dailies */
export function questEvent(s: GameState, type: string, amount = 1, extra?: { asset?: string; day?: number }): QuestProgress[] {
  const completed: QuestProgress[] = [];
  for (const q of all(s)) {
    if (q.done) continue;
    let hit = false;
    if (type === 'sell' && q.template === 'hold_drop') {
      // продажа сбрасывает «переживи обвал»
      q.progress = 0;
      q.data = { peak: 0 };
      continue;
    }
    if (type === 'buy_stock' && q.template === 'earnings_buy' && extra?.asset && extra.day != null) {
      const next = nextEarnings(extra.asset, Math.floor(extra.day));
      if (next != null && next - extra.day <= 10) hit = true;
    } else if (q.template === type || (type === 'days' && q.template === 'game_year')) {
      hit = true;
    }
    if (!hit) continue;
    if (q.template === 'combo') q.progress = Math.max(q.progress, amount >= 5 ? 1 : 0);
    else q.progress += amount;
    if (q.progress >= q.target) {
      q.done = true;
      completed.push(q);
    }
  }
  return completed;
}

/** Квесты, прогресс которых считается по состоянию (заработок, капитал, майнинг, просадка). */
export function questContinuous(s: GameState, ctx: QuestCtx): QuestProgress[] {
  const completed: QuestProgress[] = [];
  for (const q of all(s)) {
    if (q.done) continue;
    switch (q.template) {
      case 'earn':
      case 'earn_big':
        q.progress = s.earnedLife - (q.baseline ?? 0);
        break;
      case 'networth_x2':
        q.progress = ctx.nw / (q.baseline ?? 1);
        break;
      case 'mine':
        q.progress = s.stats.minedBTC - (q.baseline ?? 0);
        break;
      case 'hold_drop': {
        const v = ctx.portfolio;
        if (v < 1000) break;
        const peak = Math.max(Number(q.data?.peak ?? 0), v);
        q.data = { peak };
        q.progress = Math.max(q.progress, ((peak - v) / peak) * 100);
        break;
      }
      default:
        continue;
    }
    if (q.progress >= q.target) {
      q.done = true;
      completed.push(q);
    }
  }
  return completed;
}

export function questReward(q: QuestProgress, incomePerSec: number): { cash: number; rep: number } {
  const t = [...QUESTS_DAILY, ...QUESTS_WEEKLY].find((x) => x.id === q.template);
  if (!t) return { cash: 0, rep: 0 };
  return { cash: Math.max(t.reward.minCash, t.reward.cashSec * incomePerSec), rep: t.reward.rep ?? 0 };
}

export function questText(q: QuestProgress): { name: string; desc: string; emoji: string; progressText: string } {
  const t = [...QUESTS_DAILY, ...QUESTS_WEEKLY].find((x) => x.id === q.template);
  if (!t) return { name: q.template, desc: '', emoji: '❔', progressText: '' };
  const money = q.template === 'earn' || q.template === 'earn_big';
  const tgt = money ? fmtMoney(q.target) : q.template === 'mine' ? `${fmtNum(q.target, 4)}` : fmtNum(q.target, 0);
  const desc = t.desc.replace('{target}', tgt);
  const cur = money ? fmtMoney(Math.min(q.progress, q.target)) : q.template === 'networth_x2' ? `×${q.progress.toFixed(2)}` : q.template === 'hold_drop' ? `${q.progress.toFixed(1)}%` : q.template === 'mine' ? fmtNum(q.progress, 4) : fmtNum(Math.min(q.progress, q.target), 0);
  const of = q.template === 'networth_x2' ? '×2' : q.template === 'hold_drop' ? `${q.target}%` : tgt;
  return { name: t.name, desc, emoji: t.emoji, progressText: `${cur} / ${of}` };
}

export function portfolioValue(s: GameState, liveNow: boolean) {
  return holdingsValue(s, liveNow);
}
