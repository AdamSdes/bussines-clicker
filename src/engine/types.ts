// ============================================================================
// Типы конфигов (src/config/*.json) и состояния игры (сохраняется в localStorage)
// ============================================================================

export type BizCategory =
  | 'food_takeaway'
  | 'food_dinein'
  | 'food_fast'
  | 'auto_service'
  | 'fuel'
  | 'retail_grocery'
  | 'tech'
  | 'logistics'
  | 'manufacturing'
  | 'finance'
  | 'airline'
  | 'energy'
  | 'space';

export type ExpenseKey = 'cogs' | 'rent' | 'salaries';

export interface BusinessDef {
  id: string;
  name: string;
  emoji: string;
  category: BizCategory;
  baseCost: number;
  costGrowth: number;
  cycleSec: number;
  revenue: number;
  expenses: Record<ExpenseKey, number>;
  managerCost: number;
  managerName: string;
  desc: string;
  fact: string;
}

export interface BizUpgradeDef {
  id: string;
  biz: string;
  type: ExpenseKey | 'revenue';
  value: number;
  costMult: number;
  name: string;
  desc: string;
}

export interface JobDef {
  id: string;
  name: string;
  emoji: string;
  hourly: number;
  cost: number;
  clicks: number;
  needUnits?: number;
  desc: string;
}

export interface ClickUpgradeDef {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  mult?: number;
  incomeShare?: number;
  desc: string;
}

export type AssetKind = 'stock' | 'etf' | 'commodity' | 'fx' | 'crypto';

export interface AssetDef {
  id: string;
  kind: AssetKind;
  name: string;
  /** Как называется единица: акция, унция, баррель, монета */
  unit: string;
  color: string;
  sector?: string;
  desc: string;
  founded?: number;
  hq?: string;
  /** Годовая выручка, млрд $ (для карточки «Фундаментал») */
  revenue?: Record<string, number>;
  /** Год/дата IPO, для подсказок */
  ipo?: string;
  /** «Призрак» — актив, который историческо обвалился (LUNA, FTT) */
  ghost?: string;
  /** Ожидаемая годовая доходность для симуляции после конца данных */
  drift?: number;
  coingeckoId?: string;
}

export interface CorporateConfig {
  splits: Record<string, [string, number][]>;
  dividends: Record<string, { months: number[]; day: number; from?: string; to?: string; dps: Record<string, number> }>;
  earnings: Record<string, { months: number[]; day: number }>;
}

export interface Candle {
  time: number; // unix seconds (UTC midnight)
  open: number;
  high: number;
  low: number;
  close: number;
}

// ---------------------------------------------------------------------------
// Состояние игры
// ---------------------------------------------------------------------------

export interface BizState {
  level: number;
  manager: boolean;
  /** Прошедшие секунды текущего цикла */
  progress: number;
  /** Запущен ли цикл вручную (без менеджера) */
  running: boolean;
  /** Всего потрачено на точки (балансовая стоимость) */
  invested: number;
  /** Заработано этим бизнесом за жизнь */
  earned: number;
}

export interface Holding {
  qty: number;
  /** Суммарная стоимость покупки текущей позиции (для средней цены) */
  cost: number;
  realized: number;
  dividends: number;
  /** День первой покупки текущей позиции */
  since: number;
}

export interface Trade {
  id: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  day: number;
  /** Реализованный P/L для продаж */
  pnl?: number;
  pnlPct?: number;
}

export interface Property {
  uid: string;
  city: string;
  type: string;
  area: number;
  boughtDay: number;
  /** Цена покупки, $ */
  cost: number;
  /** Накоплено аренды */
  rentEarned: number;
}

export interface Deposit {
  uid: string;
  kind: 'flex' | 'term';
  amount: number;
  /** Годовая ставка, доля */
  rate: number;
  openDay: number;
  /** Для срочного вклада — день окончания */
  endDay?: number;
  interest: number;
}

export interface Bond {
  uid: string;
  kind: string;
  face: number;
  /** Купонная доходность, доля в год */
  coupon: number;
  buyDay: number;
  maturityDay: number;
  coupons: number;
}

export interface ActiveEffect {
  id: string;
  /** Реальное время окончания (ms) */
  until: number;
  name: string;
  emoji: string;
  incomeMult?: number;
  bizMult?: Record<string, number>;
  clickMult?: number;
}

export interface PendingChoice {
  id: string;
  createdAt: number;
}

export interface QuestProgress {
  id: string;
  template: string;
  target: number;
  progress: number;
  reward: { cash?: number; rep?: number; boostMin?: number };
  done: boolean;
  claimed: boolean;
  /** Произвольные данные шаблона (тикер и т.п.) */
  data?: Record<string, string | number>;
  baseline?: number;
}

export interface Settings {
  sound: boolean;
  vibration: boolean;
  speed: string;
  numberFormat: 'short' | 'scientific' | 'full';
  taxMode: 'historical' | 'custom';
  taxRate: number;
  particles: boolean;
  liveApi: boolean;
}

export interface Stats {
  /** [игровой день, капитал, S&P 500 бенчмарк (SPY-эквивалент капитала)] */
  history: [number, number, number][];
  maxNetWorth: number;
  totalClicks: number;
  crits: number;
  maxCombo: number;
  dividendsTotal: number;
  rentTotal: number;
  interestTotal: number;
  minedBTC: number;
  tradesCount: number;
  bestTrade?: { id: string; pnl: number; pnlPct: number; day: number };
  worstTrade?: { id: string; pnl: number; pnlPct: number; day: number };
  playSeconds: number;
  /** Сколько потрачено на лайфстайл */
  lifestyleSpent: number;
  /** Пики/просадки портфеля для «Diamond hands» */
  portfolioPeak: number;
  maxDrawdownHeld: number;
  /** День последней продажи актива */
  lastSellDay: number;
  /** Количество «сломанных» случайных событий и т.п. */
  randomEvents: number;
  audits: number;
}

export interface GameState {
  v: number;
  mode: 'story' | 'sandbox';
  startDate: string;
  /** Игровой день — дробное число дней от 1970-01-01 (UTC) */
  day: number;
  live: boolean;
  cash: number;
  earnedLife: number;
  earnedTotal: number;
  clicksLife: number;
  job: string;
  clickUpgrades: string[];
  businesses: Record<string, BizState>;
  bizUpgrades: string[];
  holdings: Record<string, Holding>;
  trades: Record<string, Trade[]>;
  rigs: Record<string, number>;
  rigsBoughtValue: number;
  properties: Property[];
  deposits: Deposit[];
  bonds: Bond[];
  loan: number;
  effects: ActiveEffect[];
  pendingChoice: PendingChoice | null;
  nextRandomAt: number;
  lifestyle: string[];
  /** Коллекция карточек: всё, что когда-либо покупалось (не сбрасывается) */
  collection: string[];
  reputation: number;
  repEarned: number;
  skills: Record<string, number>;
  ipos: number;
  achievements: Record<string, number>;
  quests: { daily: QuestProgress[]; weekly: QuestProgress[]; dailyKey: string; weeklyKey: string };
  dailyReward: { lastKey: string; streak: number };
  stats: Stats;
  settings: Settings;
  /** Реальное время последнего тика, ms */
  lastSeen: number;
  createdAt: number;
  /** Индекс последней показанной исторической новости */
  newsCursor: number;
  /** Какие исторические эффекты уже анонсированы */
  seenEffects: string[];
  /** Флаги однократных событий (туториал и т.п.) */
  flags: Record<string, boolean>;
}
