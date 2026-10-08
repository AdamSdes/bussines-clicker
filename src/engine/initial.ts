// Начальное состояние новой игры и сброс при IPO (престиж).
import { BALANCE, CAPITAL_LEVELS } from './config';
import { dayNum } from './time';
import type { GameState, Settings, Stats } from './types';

export const SAVE_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    sound: true,
    vibration: true,
    speed: 'x1',
    numberFormat: 'short',
    taxMode: 'historical',
    taxRate: BALANCE.tax.customDefault,
    particles: true,
    liveApi: true,
  };
}

export function emptyStats(): Stats {
  return {
    history: [],
    invIndex: 1,
    invLast: 0,
    invFlows: 0,
    splits: 0,
    questsDone: 0,
    dailiesDone: 0,
    maxNetWorth: 0,
    totalClicks: 0,
    crits: 0,
    maxCombo: 1,
    dividendsTotal: 0,
    rentTotal: 0,
    interestTotal: 0,
    minedBTC: 0,
    tradesCount: 0,
    playSeconds: 0,
    lifestyleSpent: 0,
    portfolioPeak: 0,
    maxDrawdownHeld: 0,
    lastSellDay: 0,
    randomEvents: 0,
    audits: 0,
  };
}

export function newGame(mode: 'story' | 'sandbox' = 'story', startDate = BALANCE.storyStart, nowMs = Date.now()): GameState {
  return {
    v: SAVE_VERSION,
    mode,
    startDate,
    day: dayNum(startDate),
    live: false,
    cash: 0,
    earnedLife: 0,
    earnedTotal: 0,
    clicksLife: 0,
    job: 'courier',
    clickUpgrades: [],
    businesses: {},
    bizUpgrades: [],
    holdings: {},
    trades: {},
    rigs: {},
    rigsBoughtValue: 0,
    properties: [],
    deposits: [],
    bonds: [],
    loan: 0,
    effects: [],
    pendingChoice: null,
    nextRandomAt: nowMs + 90_000,
    lifestyle: [],
    collection: [],
    reputation: 0,
    repEarned: 0,
    skills: {},
    ipos: 0,
    achievements: {},
    quests: { daily: [], weekly: [], dailyKey: '', weeklyKey: '' },
    dailyReward: { lastKey: '', streak: 0 },
    stats: emptyStats(),
    settings: defaultSettings(),
    lastSeen: nowMs,
    createdAt: nowMs,
    newsCursor: -1,
    seenEffects: [],
    flags: {},
  };
}

/**
 * Новая жизнь после IPO: прогресс и активы сбрасываются, остаются репутация,
 * навыки, достижения, коллекция, настройки и ежедневные серии.
 */
export function rebirth(prev: GameState, startDate: string, nowMs = Date.now()): GameState {
  const fresh = newGame(prev.mode, startDate, nowMs);
  const capital = CAPITAL_LEVELS[prev.skills.capital ?? 0] ?? 0;
  return {
    ...fresh,
    cash: capital,
    earnedTotal: prev.earnedTotal,
    reputation: prev.reputation,
    repEarned: prev.repEarned,
    skills: prev.skills,
    ipos: prev.ipos,
    achievements: prev.achievements,
    // задания перевыпускаются под новую жизнь (их цели и награды зависят от дохода)
    quests: fresh.quests,
    dailyReward: prev.dailyReward,
    settings: prev.settings,
    createdAt: prev.createdAt,
    flags: prev.flags,
    collection: prev.collection,
    stats: {
      ...fresh.stats,
      totalClicks: prev.stats.totalClicks,
      crits: prev.stats.crits,
      maxCombo: prev.stats.maxCombo,
      playSeconds: prev.stats.playSeconds,
      audits: prev.stats.audits,
      randomEvents: prev.stats.randomEvents,
      questsDone: prev.stats.questsDone,
      dailiesDone: prev.stats.dailiesDone,
    },
  };
}
