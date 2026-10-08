// Случайные бытовые события: золотой клиент, налоговая проверка, поломка и т.д.
import { BIZ_BY_ID, RANDOM_BY_ID, RANDOM_EVENTS, type RandomEffect, type RandomEventDef } from './config';
import type { Mods } from './modifiers';
import type { ActiveEffect, GameState } from './types';
import { fmtMoney } from './format';

export function pickRandomEvent(s: GameState, mods: Mods, rand = Math.random): RandomEventDef | null {
  const owned = Object.entries(s.businesses).filter(([, b]) => b.level > 0).map(([id]) => id);
  if (!owned.length) return null;
  // «Удача» повышает вес хороших событий
  const luck = 1 + (s.skills.luck ?? 0) * 0.25;
  const pool = RANDOM_EVENTS.filter((e) => !e.needBiz || e.needBiz.some((b) => owned.includes(b)));
  const weights = pool.map((e) => e.weight * (e.good ? luck : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  void mods;
  return pool[pool.length - 1];
}

export interface EffectOutcome {
  text: string;
  good: boolean;
}

/**
 * Применяет эффект события.
 * incomePerSec — текущий доход (для эффектов «N секунд дохода»).
 */
export function applyRandomEffect(
  s: GameState,
  ev: RandomEventDef,
  effect: RandomEffect,
  incomePerSec: number,
  nowMs: number,
  rand = Math.random,
): EffectOutcome {
  if (effect.chance != null) {
    const ok = rand() < effect.chance + (s.skills.luck ?? 0) * 0.03;
    const sub = ok ? effect.win : effect.fail;
    const base: RandomEffect = { ...effect, chance: undefined, win: undefined, fail: undefined };
    const first = applyRandomEffect(s, ev, base, incomePerSec, nowMs, rand);
    if (!sub) return { text: ok ? `${first.text} Сработало!`.trim() : first.text, good: ok };
    const second = applyRandomEffect(s, ev, sub, incomePerSec, nowMs, rand);
    return { text: [first.text, ok ? 'Сработало!' : 'Не повезло.', second.text].filter(Boolean).join(' '), good: ok };
  }
  const parts: string[] = [];
  let good = true;
  const inc = Math.max(incomePerSec, 1);
  if (effect.cashIncomeSec) {
    const amount = Math.max(effect.minCash ?? 0, inc * effect.cashIncomeSec);
    s.cash += amount;
    s.earnedLife += amount;
    s.earnedTotal += amount;
    parts.push(`+${fmtMoney(amount)}`);
  }
  if (effect.payIncomeSec) {
    const amount = Math.min(Math.max(0, s.cash), inc * effect.payIncomeSec);
    s.cash -= amount;
    parts.push(`−${fmtMoney(amount)}`);
    good = false;
  }
  if (effect.cashPct) {
    // Налоговая оптимизация снижает штрафы
    const reduce = 1 - Math.min(0.8, (s.skills.tax ?? 0) * 0.15);
    const amount = Math.max(0, s.cash) * Math.abs(effect.cashPct) * (effect.cashPct < 0 ? reduce : 1);
    s.cash += effect.cashPct < 0 ? -amount : amount;
    parts.push(`${effect.cashPct < 0 ? '−' : '+'}${fmtMoney(amount)}`);
    good = effect.cashPct > 0;
  }
  const push = (e: Omit<ActiveEffect, 'id' | 'name' | 'emoji'>) =>
    s.effects.push({ id: `${ev.id}-${nowMs}-${s.effects.length}`, name: ev.name, emoji: ev.emoji, ...e });
  if (effect.incomeMult) {
    push({ until: nowMs + effect.incomeMult.sec * 1000, incomeMult: effect.incomeMult.mult });
    parts.push(`доход ×${effect.incomeMult.mult} на ${effect.incomeMult.sec} с`);
    if (effect.incomeMult.mult < 1) good = false;
  }
  if (effect.clickMult) {
    push({ until: nowMs + effect.clickMult.sec * 1000, clickMult: effect.clickMult.mult });
    parts.push(`клик ×${effect.clickMult.mult} на ${effect.clickMult.sec} с`);
  }
  if (effect.bizMult) {
    const owned = Object.entries(s.businesses).filter(([, b]) => b.level > 0).map(([id]) => id);
    let targets = effect.bizMult.targets.filter((t) => t !== 'random' && owned.includes(t));
    if (effect.bizMult.targets.includes('random') && owned.length) targets = [owned[Math.floor(rand() * owned.length)]];
    if (targets.length) {
      push({ until: nowMs + effect.bizMult.sec * 1000, bizMult: Object.fromEntries(targets.map((t) => [t, effect.bizMult!.mult])) });
      const names = targets.map((t) => BIZ_BY_ID[t]?.name).join(', ');
      parts.push(effect.bizMult.mult === 0 ? `${names} простаивает ${effect.bizMult.sec} с` : `${names} ×${effect.bizMult.mult} на ${effect.bizMult.sec} с`);
      if (effect.bizMult.mult < 1) good = false;
    }
  }
  return { text: parts.join(', '), good };
}

export function resolveChoice(s: GameState, optionIndex: number, incomePerSec: number, nowMs: number): (EffectOutcome & { ev: RandomEventDef }) | null {
  const pc = s.pendingChoice;
  if (!pc) return null;
  const ev = RANDOM_BY_ID[pc.id];
  s.pendingChoice = null;
  if (!ev) return null;
  const opt = ev.options[Math.min(optionIndex, ev.options.length - 1)];
  const out = applyRandomEffect(s, ev, opt.effect, incomePerSec, nowMs);
  if (ev.id === 'tax_audit') s.stats.audits++;
  return { ...out, ev };
}
