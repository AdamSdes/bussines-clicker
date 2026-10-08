// Типизированный доступ к JSON-конфигам из src/config.
import balanceJson from '../config/balance.json';
import businessesJson from '../config/businesses.json';
import jobsJson from '../config/jobs.json';
import assetsJson from '../config/assets.json';
import corporateJson from '../config/corporate.json';
import ratesJson from '../config/rates.json';
import realEstateJson from '../config/realEstate.json';
import miningJson from '../config/mining.json';
import eventsJson from '../config/events.json';
import newsJson from '../config/news.json';
import lifestyleJson from '../config/lifestyle.json';
import ranksJson from '../config/ranks.json';
import skillsJson from '../config/skills.json';
import achievementsJson from '../config/achievements.json';
import questsJson from '../config/quests.json';
import type {
  AssetDef, BizCategory, BizUpgradeDef, BusinessDef, ClickUpgradeDef, CorporateConfig, ExpenseKey, JobDef,
} from './types';

export const BALANCE = balanceJson;

export const BUSINESSES = businessesJson.businesses as BusinessDef[];
export const BIZ_BY_ID = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
export const BIZ_UPGRADES = businessesJson.upgrades as BizUpgradeDef[];
export const BIZ_UPGRADE_BY_ID = Object.fromEntries(BIZ_UPGRADES.map((u) => [u.id, u]));
export const MILESTONES = businessesJson.milestones;
export const MILESTONE_MULT = businessesJson.milestoneMult;

export const JOBS = jobsJson.jobs as JobDef[];
export const JOB_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));
export const CLICK_UPGRADES = jobsJson.clickUpgrades as ClickUpgradeDef[];
export const CLICK_UPGRADE_BY_ID = Object.fromEntries(CLICK_UPGRADES.map((u) => [u.id, u]));

export const ASSETS = assetsJson.assets as AssetDef[];
export const ASSET_BY_ID: Record<string, AssetDef> = Object.fromEntries(ASSETS.map((a) => [a.id, a]));
export const CORPORATE = corporateJson as unknown as CorporateConfig;

export interface FedPoint { day: number; rate: number }
export const RATES = ratesJson;

export interface CityDef {
  id: string;
  name: string;
  flag: string;
  district: string;
  yield: number;
  costs: number;
  fact: string;
  price: Record<string, number>;
}
export interface PropertyTypeDef { id: string; name: string; emoji: string; area: number; premium: number; yieldAdj: number }
export const CITIES = realEstateJson.cities as unknown as CityDef[];
export const CITY_BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c]));
export const PROPERTY_TYPES = realEstateJson.types as PropertyTypeDef[];
export const PROPERTY_TYPE_BY_ID = Object.fromEntries(PROPERTY_TYPES.map((t) => [t.id, t]));
export const RE_TRANSACTION = realEstateJson.transaction;

export interface RigDef { id: string; name: string; emoji: string; from: string; hashrate: number; power: number; price: number; desc: string }
export const MINING = miningJson;
export const RIGS = miningJson.rigs as RigDef[];
export const RIG_BY_ID = Object.fromEntries(RIGS.map((r) => [r.id, r]));

export interface HistEffectDef {
  id: string;
  from: string;
  to: string;
  emoji: string;
  name: string;
  desc: string;
  demand?: Partial<Record<BizCategory | '*', number>>;
  costs?: Partial<Record<BizCategory | '*', Partial<Record<ExpenseKey, number>>>>;
}
export interface RandomEffect {
  cashIncomeSec?: number;
  minCash?: number;
  cashPct?: number;
  payIncomeSec?: number;
  incomeMult?: { mult: number; sec: number };
  bizMult?: { targets: string[]; mult: number; sec: number };
  clickMult?: { mult: number; sec: number };
  chance?: number;
  win?: RandomEffect;
  fail?: RandomEffect;
}
export interface RandomEventDef {
  id: string;
  emoji: string;
  name: string;
  good: boolean;
  weight: number;
  text: string;
  needBiz?: string[];
  options: { label: string; effect: RandomEffect }[];
}
export const HIST_EFFECTS = eventsJson.historical as HistEffectDef[];
export const RANDOM_EVENTS = eventsJson.random as RandomEventDef[];
export const RANDOM_BY_ID = Object.fromEntries(RANDOM_EVENTS.map((e) => [e.id, e]));

export interface NewsDef { d: string; t: string; assets?: string[]; big?: boolean }
export const NEWS = (newsJson.news as NewsDef[]).slice().sort((a, b) => a.d.localeCompare(b.d));

export interface LifestyleItemDef {
  id: string;
  cat: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  bonus: { income?: number; click?: number; crit?: number; discount?: number; offline?: number };
}
export const LIFESTYLE_CATEGORIES = lifestyleJson.categories;
export const LIFESTYLE = lifestyleJson.items as LifestyleItemDef[];
export const LIFESTYLE_BY_ID = Object.fromEntries(LIFESTYLE.map((i) => [i.id, i]));

export interface RankDef { id: string; name: string; emoji: string; min?: number; forbes?: number }
export interface ForbesSnapshot { year: number; threshold100: number; top: [string, number][] }
export const RANKS = ranksJson.ranks as RankDef[];
export const FORBES = ranksJson.forbes as ForbesSnapshot[];

export interface SkillDef {
  id: string;
  branch: string;
  name: string;
  emoji: string;
  max: number;
  base: number;
  growth: number;
  effect: number;
  requires?: string;
  desc: string;
}
export const SKILL_BRANCHES = skillsJson.branches;
export const SKILLS = skillsJson.skills as SkillDef[];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const CAPITAL_LEVELS = skillsJson.capitalLevels;
export const TIME_MACHINE_YEARS = skillsJson.timeMachineYears;

export interface AchievementDef {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  type: string;
  [k: string]: unknown;
}
export const ACHIEVEMENTS = achievementsJson.list as AchievementDef[];
export const ACHIEVEMENT_BONUS = achievementsJson.bonusPerAchievement;

export interface QuestTemplate {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  targets: number[];
  scale?: string;
  minTarget?: number;
  reward: { cashSec: number; minCash: number; rep?: number };
}
export const QUESTS_DAILY = questsJson.daily as QuestTemplate[];
export const QUESTS_WEEKLY = questsJson.weekly as QuestTemplate[];
