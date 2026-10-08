// Главное хранилище игры (Zustand + Immer).
// s  — сохраняемое состояние (GameState), rt — вычисляемые на лету значения.
import { create } from 'zustand';
import { produce } from 'immer';
import * as A from '../engine/actions';
import { ACHIEVEMENTS, BALANCE, BIZ_BY_ID, LIFESTYLE_BY_ID, SKILL_BY_ID } from '../engine/config';
const B = BALANCE;
import { clickParts, totalBizPerSec } from '../engine/economy';
import { miningPerDay, propertyRentPerDay, depositRate } from '../engine/finance';
import { computeMods, type Mods } from '../engine/modifiers';
import { holdingsValue, netWorth, rankFor } from '../engine/networth';
import { priceAt } from '../engine/market';
import { checkAchievements, ensureQuests, questContinuous, questEvent, questReward } from '../engine/progress';
import { resolveChoice } from '../engine/randomEvents';
import { exportSave, importSave, loadActive, loadSlot, saveGame } from '../engine/save';
import {
  applyOffline, doClick, initNewsCursor, maybeRandomEvent, secPerDay, tick, type AwaySummary, type ClickRuntime, type GameEvent,
} from '../engine/simulate';
import { newGame } from '../engine/initial';
import { localDayKey } from '../engine/time';
import { fmtMoney } from '../engine/format';
import { setNumberFormat } from '../engine/format';
import { configureFeedback, sfx } from '../audio/sfx';
import type { GameState } from '../engine/types';
import { useUi } from './ui';

export interface Runtime {
  mods: Mods;
  /** Доход автоматизированных бизнесов, $/с */
  bizPerSec: number;
  /** Доход всех бизнесов, если крутить вручную, $/с */
  bizPotential: number;
  /** Пассивный доход инвестиций в реальную секунду (аренда, проценты, майнинг) */
  investPerSec: number;
  clickBase: number;
  netWorth: number;
  portfolio: number;
  combo: number;
  rankId: string;
}

interface GameStore {
  ready: boolean;
  s: GameState;
  rt: Runtime;
  away: AwaySummary | null;
  boot: () => void;
  step: (dt: number) => void;
  save: () => void;
  act: <T>(fn: (d: GameState, mods: Mods) => T) => T;
  click: () => { value: number; crit: boolean; combo: number };
  buyBiz: (id: string, qty: number | 'max') => void;
  runBiz: (id: string) => void;
  hire: (id: string) => void;
  upgradeBiz: (id: string) => void;
  promote: () => void;
  buyClick: (id: string) => void;
  trade: (id: string, side: 'buy' | 'sell', qty: number) => boolean;
  buyRig: (id: string, n: number) => void;
  sellRig: (id: string, n: number) => void;
  buyProperty: (city: string, type: string) => void;
  sellProperty: (uid: string) => void;
  openDeposit: (kind: 'flex' | 'term', amount: number) => void;
  closeDeposit: (uid: string, amount?: number) => void;
  buyBond: (kind: string, amount: number) => void;
  sellBond: (uid: string) => void;
  borrow: (amount: number) => void;
  repay: (amount: number) => void;
  buyLifestyle: (id: string) => void;
  buySkill: (id: string) => void;
  ipo: (year: number) => void;
  claimDaily: () => void;
  claimQuest: (id: string) => void;
  choose: (option: number) => void;
  setSetting: <K extends keyof GameState['settings']>(k: K, v: GameState['settings'][K]) => void;
  exportSave: () => string;
  importSave: (text: string) => void;
  resetAll: () => void;
  startSandbox: (year: number) => void;
  switchMode: (mode: 'story' | 'sandbox') => void;
  dismissAway: () => void;
}

const clickRt: ClickRuntime = { streak: 0, lastClickAt: 0 };
let secAcc = 0;
let minuteAcc = 0;

function computeRuntime(s: GameState, mods?: Mods): Runtime {
  const m = mods ?? computeMods(s);
  const bizPerSec = totalBizPerSec(s, m, true);
  const bizPotential = totalBizPerSec(s, m, false);
  const nw = netWorth(s, s.live);
  // Пассивные доходы инвестиций начисляются по игровым дням → в реальную секунду
  const spd = s.live ? 86400 : secPerDay(s);
  let perDay = 0;
  for (const p of s.properties) perDay += propertyRentPerDay(p, s.day, m);
  for (const d of s.deposits) perDay += (d.amount * (d.kind === 'flex' ? depositRate('flex', s.day, m) : d.rate)) / 365;
  for (const b of s.bonds) perDay += (b.face * b.coupon) / 365;
  const mine = miningPerDay(s, s.day, m);
  perDay += mine.btc * Math.max(0, priceAt('BTC', s.day, s.live) ?? 0) - mine.power;
  const investPerSec = spd > 0 ? perDay / spd : 0;
  return {
    mods: m,
    bizPerSec,
    bizPotential,
    investPerSec,
    clickBase: clickParts(s, m, bizPerSec).base,
    netWorth: nw,
    portfolio: holdingsValue(s, s.live),
    combo: 1,
    rankId: rankFor(nw, s.day).rank.id,
  };
}

/** Маршрутизация игровых событий в интерфейс */
function route(e: GameEvent) {
  const ui = useUi.getState();
  switch (e.type) {
    case 'toast':
      ui.toast({ kind: e.kind, title: e.title, text: e.text, emoji: e.emoji });
      if (e.kind === 'news') sfx.news();
      if (e.kind === 'bad') sfx.bad();
      break;
    case 'achievement': {
      const a = ACHIEVEMENTS.find((x) => x.id === e.id);
      if (a) ui.toast({ kind: 'gold', emoji: a.emoji, title: `Достижение: ${a.name}`, text: `${a.desc} · +0,5% к прибыли` });
      sfx.achievement();
      break;
    }
    case 'questDone':
      ui.toast({ kind: 'good', emoji: '✅', title: 'Задание выполнено', text: 'Забери награду в Профиле → Задания' });
      break;
    case 'live':
      ui.toast({ kind: 'gold', emoji: '📡', title: 'Живой режим!', text: 'Игровое время догнало реальность. Теперь рынок идёт в реальном времени.', ttl: 8000 });
      ui.celebrate();
      break;
    case 'confetti':
      ui.celebrate();
      break;
    case 'choice':
      ui.open({ type: 'choice' });
      break;
  }
}

function applySettingsSideEffects(s: GameState) {
  setNumberFormat(s.settings.numberFormat);
  configureFeedback(s.settings.sound, s.settings.vibration);
}

const initial = newGame();

export const useGame = create<GameStore>((set, get) => ({
  ready: false,
  s: initial,
  rt: computeRuntime(initial),
  away: null,

  boot: () => {
    const now = Date.now();
    let s = loadActive();
    let away: AwaySummary | null = null;
    if (!s) {
      s = produce(newGame('story', B.storyStart, now), (d) => initNewsCursor(d));
    } else {
      s = produce(s, (d) => {
        away = applyOffline(d, now);
      });
    }
    s = produce(s, (d) => {
      const mods = computeMods(d, now);
      ensureQuests(d, { incomePerSec: totalBizPerSec(d, mods, true), nw: netWorth(d), miningPerDay: miningPerDay(d, d.day, mods).btc, portfolio: holdingsValue(d) }, now);
    });
    applySettingsSideEffects(s);
    set({ s, rt: computeRuntime(s), ready: true, away });
    if (away) useUi.getState().open({ type: 'away' });
    else if (s.dailyReward.lastKey !== localDayKey(now) && s.stats.playSeconds > 60) useUi.getState().open({ type: 'daily' });
  },

  step: (dt) => {
    const now = Date.now();
    let mods: Mods | undefined;
    const events: GameEvent[] = [];
    const emit = (e: GameEvent) => events.push(e);
    secAcc += dt;
    minuteAcc += dt;
    const next = produce(get().s, (d) => {
      mods = tick(d, dt, now, emit);
      if (secAcc >= 1) {
        // Раз в секунду: случайные события, достижения, квесты, рекорды
        const nw = netWorth(d, d.live);
        if (nw > d.stats.maxNetWorth) d.stats.maxNetWorth = nw;
        // случайные события не перебивают открытое окно (сделку, IPO, сводку)
        if (!useUi.getState().modal) maybeRandomEvent(d, now, mods, emit);
        for (const id of checkAchievements(d, { nw, liveNow: d.live })) {
          d.achievements[id] = now;
          emit({ type: 'achievement', id });
        }
        const qctx = { incomePerSec: totalBizPerSec(d, mods, true), nw, miningPerDay: miningPerDay(d, d.day, mods).btc, portfolio: holdingsValue(d, d.live) };
        for (const q of questContinuous(d, qctx)) emit({ type: 'questDone', id: q.id });
        if (minuteAcc >= 30) {
          ensureQuests(d, qctx, now);
          minuteAcc = 0;
        }
      }
    });
    const rt = computeRuntime(next, mods);
    rt.combo = now - clickRt.lastClickAt <= BALANCE.combo.windowMs ? Math.min(BALANCE.combo.max, 1 + clickRt.streak * BALANCE.combo.perClick) : 1;
    if (secAcc >= 1) secAcc = 0;
    set({ s: next, rt });
    events.forEach(route);
  },

  save: () => {
    saveGame(get().s);
  },

  act: (fn) => {
    let out: ReturnType<typeof fn> | undefined;
    const now = Date.now();
    const next = produce(get().s, (d) => {
      out = fn(d, computeMods(d, now));
    });
    set({ s: next, rt: { ...computeRuntime(next), combo: get().rt.combo } });
    return out as ReturnType<typeof fn>;
  },

  click: () => {
    const now = Date.now();
    let res = { value: 0, crit: false, combo: 1 };
    const events: GameEvent[] = [];
    const next = produce(get().s, (d) => {
      const mods = computeMods(d, now);
      res = doClick(d, clickRt, now, mods, totalBizPerSec(d, mods, true));
      for (const q of questEvent(d, 'clicks', 1)) events.push({ type: 'questDone', id: q.id });
      if (res.crit) for (const q of questEvent(d, 'crits', 1)) events.push({ type: 'questDone', id: q.id });
      if (res.combo >= 5) for (const q of questEvent(d, 'combo', 5)) events.push({ type: 'questDone', id: q.id });
    });
    set({ s: next, rt: { ...get().rt, combo: res.combo } });
    events.forEach(route);
    return res;
  },

  buyBiz: (id, qty) => {
    const r = get().act((d, m) => A.buyBusiness(d, id, qty, m));
    if (!r.ok) return fail(r.error);
    sfx.buy();
    if (r.milestone) {
      sfx.milestone();
      useUi.getState().celebrate();
      useUi.getState().toast({ kind: 'gold', emoji: '🎉', title: `Веха: ${r.milestone} точек`, text: `${BIZ_BY_ID[id].name}: прибыль ×2!` });
    }
  },
  runBiz: (id) => {
    get().act((d) => A.runBusiness(d, id));
  },
  hire: (id) => {
    const r = get().act((d, m) => A.hireManager(d, id, m));
    if (!r.ok) return fail(r.error);
    sfx.buy();
    useUi.getState().toast({ kind: 'good', emoji: '🧑‍💼', title: `${BIZ_BY_ID[id].managerName} в команде`, text: `${BIZ_BY_ID[id].name} работает сам — даже когда ты офлайн` });
  },
  upgradeBiz: (id) => {
    const r = get().act((d) => A.buyBizUpgrade(d, id));
    if (!r.ok) return fail(r.error);
    sfx.buy();
  },
  promote: () => {
    const r = get().act((d) => A.promote(d));
    if (!r.ok) return fail(r.error);
    sfx.milestone();
    useUi.getState().celebrate();
    useUi.getState().toast({ kind: 'gold', emoji: '📈', title: 'Повышение!', text: 'Каждый клик теперь стоит дороже' });
  },
  buyClick: (id) => {
    const r = get().act((d) => A.buyClickUpgrade(d, id));
    if (!r.ok) return fail(r.error);
    sfx.buy();
  },
  trade: (id, side, qty) => {
    const r = get().act((d, m) => {
      const res = A.trade(d, id, side, qty, m, d.live);
      if (res.ok) for (const a of res.achievements) d.achievements[a] = Date.now();
      return res;
    });
    if (!r.ok) {
      fail(r.error);
      return false;
    }
    sfx.cash();
    for (const a of r.achievements) route({ type: 'achievement', id: a });
    return true;
  },
  buyRig: (id, n) => {
    const r = get().act((d) => A.buyRig(d, id, n));
    if (!r.ok) return fail(r.error);
    sfx.buy();
  },
  sellRig: (id, n) => {
    const r = get().act((d) => A.sellRig(d, id, n));
    if (!r.ok) return fail(r.error);
    sfx.cash();
  },
  buyProperty: (city, type) => {
    const r = get().act((d) => A.buyProperty(d, city, type));
    if (!r.ok) return fail(r.error);
    sfx.buy();
    useUi.getState().toast({ kind: 'good', emoji: '🔑', title: 'Объект куплен', text: `Потрачено ${fmtMoney(r.cost)} с учётом сборов` });
  },
  sellProperty: (uid) => {
    const r = get().act((d) => A.sellProperty(d, uid));
    if (!r.ok) return fail(r.error);
    sfx.cash();
    useUi.getState().toast({ kind: r.pnl >= 0 ? 'good' : 'bad', emoji: '🏷️', title: 'Объект продан', text: `${fmtMoney(r.proceeds)} (${r.pnl >= 0 ? '+' : ''}${fmtMoney(r.pnl)})` });
  },
  openDeposit: (kind, amount) => {
    const r = get().act((d, m) => A.openDeposit(d, kind, amount, m));
    if (!r.ok) return fail(r.error);
    sfx.cash();
  },
  closeDeposit: (uid, amount) => {
    const r = get().act((d) => A.closeDeposit(d, uid, amount));
    if (!r.ok) return fail(r.error);
    if (r.lost > 0) useUi.getState().toast({ kind: 'bad', emoji: '🔥', title: 'Проценты сгорели', text: `Досрочное закрытие: потеряно ${fmtMoney(r.lost)}` });
    sfx.cash();
  },
  buyBond: (kind, amount) => {
    const r = get().act((d) => A.buyBond(d, kind, amount));
    if (!r.ok) return fail(r.error);
    sfx.cash();
  },
  sellBond: (uid) => {
    const r = get().act((d) => A.sellBond(d, uid));
    if (!r.ok) return fail(r.error);
    sfx.cash();
  },
  borrow: (amount) => {
    const r = get().act((d) => A.borrow(d, amount));
    if (!r.ok) return fail(r.error);
    sfx.cash();
  },
  repay: (amount) => {
    const r = get().act((d) => A.repay(d, amount));
    if (!r.ok) return fail(r.error);
    sfx.cash();
  },
  buyLifestyle: (id) => {
    const r = get().act((d) => A.buyLifestyle(d, id));
    if (!r.ok) return fail(r.error);
    sfx.milestone();
    useUi.getState().celebrate();
    useUi.getState().toast({ kind: 'gold', emoji: LIFESTYLE_BY_ID[id].emoji, title: `Новая карточка: ${LIFESTYLE_BY_ID[id].name}`, text: 'Добавлено в коллекцию' });
  },
  buySkill: (id) => {
    const r = get().act((d) => A.buySkill(d, id));
    if (!r.ok) return fail(r.error);
    sfx.achievement();
    useUi.getState().toast({ kind: 'gold', emoji: SKILL_BY_ID[id].emoji, title: `${SKILL_BY_ID[id].name}: уровень ${get().s.skills[id]}` });
  },
  ipo: (year) => {
    const r = A.doIpo(get().s, year);
    if (!r.ok) return fail(r.error);
    const next = produce(r.next, (d) => {
      const mods = computeMods(d);
      ensureQuests(d, { incomePerSec: 0, nw: d.cash, miningPerDay: 0, portfolio: 0 });
      void mods;
    });
    saveGame(next);
    set({ s: next, rt: computeRuntime(next) });
    useUi.getState().close();
    useUi.getState().setTab('work');
    useUi.getState().celebrate();
    sfx.milestone();
    useUi.getState().toast({ kind: 'gold', emoji: '🔔', title: `IPO! +${r.gain} репутации`, text: 'Новая жизнь начинается. Ты помнишь, что будет дальше…', ttl: 8000 });
  },
  claimDaily: () => {
    const key = localDayKey();
    const st = get().s;
    if (st.dailyReward.lastKey === key) return;
    const yesterday = localDayKey(Date.now() - 86_400_000);
    const streak = st.dailyReward.lastKey === yesterday ? st.dailyReward.streak + 1 : 1;
    const mult = BALANCE.dailyRewards[(streak - 1) % BALANCE.dailyRewards.length];
    const income = Math.max(get().rt.bizPerSec, get().rt.clickBase);
    const cash = Math.max(500 * mult, income * 60 * mult);
    get().act((d) => {
      d.dailyReward = { lastKey: key, streak };
      d.cash += cash;
      d.earnedLife += cash;
      d.earnedTotal += cash;
      if (streak % 7 === 0) d.reputation += 1;
    });
    sfx.cash();
    useUi.getState().celebrate();
    useUi.getState().toast({ kind: 'gold', emoji: '🎁', title: `День ${streak}: +${fmtMoney(cash)}`, text: streak % 7 === 0 ? '+1 репутация за неделю подряд!' : 'Заходи завтра — награда растёт' });
    useUi.getState().close();
  },
  claimQuest: (id) => {
    const income = Math.max(get().rt.bizPerSec, get().rt.clickBase);
    let reward = { cash: 0, rep: 0 };
    let daily = false;
    get().act((d) => {
      const q = [...d.quests.daily, ...d.quests.weekly].find((x) => x.id === id);
      if (!q || !q.done || q.claimed) return;
      reward = questReward(q, income);
      q.claimed = true;
      d.cash += reward.cash;
      d.earnedLife += reward.cash;
      d.earnedTotal += reward.cash;
      d.reputation += reward.rep;
      d.stats.questsDone++;
      daily = d.quests.daily.some((x) => x.id === id);
      if (daily) {
        d.stats.dailiesDone++;
        questEvent(d, 'dailies', 1);
      }
    });
    if (reward.cash > 0) {
      sfx.cash();
      useUi.getState().toast({ kind: 'gold', emoji: '🏅', title: `Награда: +${fmtMoney(reward.cash)}`, text: reward.rep ? `и +${reward.rep} репутации` : undefined });
    }
  },
  choose: (option) => {
    const income = Math.max(get().rt.bizPerSec, get().rt.clickBase);
    const out = get().act((d) => resolveChoice(d, option, income, Date.now()));
    useUi.getState().close();
    if (out) {
      useUi.getState().toast({ kind: out.good ? 'good' : 'bad', emoji: out.ev.emoji, title: out.ev.name, text: out.text || 'Решено' });
      (out.good ? sfx.cash : sfx.bad)();
    }
  },
  setSetting: (k, v) => {
    get().act((d) => {
      d.settings[k] = v;
    });
    applySettingsSideEffects(get().s);
  },
  exportSave: () => exportSave(get().s),
  importSave: (text) => {
    const s = importSave(text);
    saveGame(s);
    applySettingsSideEffects(s);
    set({ s, rt: computeRuntime(s) });
    useUi.getState().toast({ kind: 'good', emoji: '💾', title: 'Сохранение загружено' });
  },
  resetAll: () => {
    const s = produce(newGame(get().s.mode, get().s.mode === 'story' ? B.storyStart : get().s.startDate), (d) => {
      initNewsCursor(d);
      d.settings = get().s.settings;
    });
    saveGame(s);
    set({ s, rt: computeRuntime(s) });
    useUi.getState().close();
    useUi.getState().setTab('work');
  },
  startSandbox: (year) => {
    saveGame(get().s);
    const s = produce(newGame('sandbox', `${year}-01-01`), (d) => {
      initNewsCursor(d);
      d.settings = { ...get().s.settings, speed: 'x6' };
      ensureQuests(d, { incomePerSec: 0, nw: 0, miningPerDay: 0, portfolio: 0 });
    });
    saveGame(s);
    set({ s, rt: computeRuntime(s) });
    useUi.getState().close();
    useUi.getState().setTab('work');
    useUi.getState().toast({ kind: 'gold', emoji: '🧪', title: `Песочница: ${year} год`, text: 'Отдельное сохранение. Основная история не затронута.' });
  },
  switchMode: (mode) => {
    saveGame(get().s);
    let s = loadSlot(mode);
    if (!s) {
      if (mode === 'sandbox') return useUi.getState().open({ type: 'sandbox' });
      s = produce(newGame('story'), (d) => initNewsCursor(d));
    }
    s = produce(s, (d) => {
      d.lastSeen = Date.now();
    });
    saveGame(s);
    applySettingsSideEffects(s);
    set({ s, rt: computeRuntime(s) });
    useUi.getState().close();
  },
  dismissAway: () => {
    set({ away: null });
    useUi.getState().close();
    const s = get().s;
    if (s.dailyReward.lastKey !== localDayKey()) setTimeout(() => useUi.getState().open({ type: 'daily' }), 400);
  },
}));

function fail(msg: string) {
  sfx.error();
  useUi.getState().toast({ kind: 'bad', emoji: '⛔', title: msg, ttl: 2500, urgent: true });
}

export const useS = <T,>(sel: (s: GameState) => T) => useGame((st) => sel(st.s));
export const useRt = <T,>(sel: (rt: Runtime) => T) => useGame((st) => sel(st.rt));
