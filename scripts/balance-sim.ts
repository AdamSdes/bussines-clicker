// Симулятор баланса: «жадный» игрок покупает то, что окупается быстрее всего.
// Запуск: npm run sim  [-- --minutes 180 --cps 4 --rep 0]
// Печатает время ключевых вех, чтобы проверить темп: первая покупка 10–20 с,
// первый бизнес 1–2 мин, первое IPO 1–2 ч.
import { BUSINESSES, BIZ_UPGRADES, CLICK_UPGRADES, JOBS, BALANCE } from '../src/engine/config';
import { bizCycle, bizUpgradeCost, clickParts, managerCost, ownedSet, totalUnits, unitCost } from '../src/engine/economy';
import { computeMods } from '../src/engine/modifiers';
import { newGame } from '../src/engine/initial';
import type { GameState } from '../src/engine/types';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const MINUTES = Number(args.minutes ?? 150);
const REP = Number(args.rep ?? 0);
const MBA = Number(args.mba ?? 0);

const s: GameState = newGame('story');
s.repEarned = REP;
s.skills.mba = MBA;
const log: string[] = [];
const seen = new Set<string>();
const mark = (key: string, t: number, extra = '') => {
  if (seen.has(key)) return;
  seen.add(key);
  log.push(`${fmtT(t).padStart(8)}  ${key}${extra ? '  ' + extra : ''}`);
};
function fmtT(t: number) {
  const m = Math.floor(t / 60);
  const sec = Math.round(t % 60);
  return m >= 60 ? `${Math.floor(m / 60)}ч${String(m % 60).padStart(2, '0')}м` : `${m}м${String(sec).padStart(2, '0')}с`;
}
const money = (x: number) => (x >= 1e12 ? (x / 1e12).toFixed(2) + 'T' : x >= 1e9 ? (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'K' : x.toFixed(0));

/** Клики в секунду: игрок активно кликает первые 10 минут, потом реже */
const cps = (t: number) => (t < 600 ? Number(args.cps ?? 4) : t < 1800 ? 2 : 1);
/** Без менеджера игрок сам запускает циклы — считаем эффективность 50% */
const MANUAL_EFF = 0.5;

const avgCrit = 1 + BALANCE.crit.chance * (BALANCE.crit.mult - 1);
const avgCombo = 2.0;

function bizIncome(id: string, level: number, mods: ReturnType<typeof computeMods>, owned: Set<string>, manager: boolean) {
  const def = BUSINESSES.find((b) => b.id === id)!;
  if (level <= 0) return 0;
  const c = bizCycle(def, level, owned, mods);
  return (c.net / c.cycleSec) * (manager ? 1 : MANUAL_EFF);
}

let ipoAt = -1;
for (let t = 0; t <= MINUTES * 60; t++) {
  const mods = computeMods(s, 0);
  const owned = ownedSet(s);
  let income = 0;
  for (const def of BUSINESSES) {
    const st = s.businesses[def.id];
    if (st) income += bizIncome(def.id, st.level, mods, owned, st.manager);
  }
  const click = clickParts(s, mods, income).base * avgCrit * avgCombo;
  const gain = income + click * cps(t);
  s.cash += gain;
  s.earnedLife += gain;
  s.clicksLife += cps(t);
  if (s.earnedLife >= 1e6) mark('заработано $1M', t);
  if (s.earnedLife >= 1e9) {
    mark('заработано $1B (IPO доступно)', t);
    if (ipoAt < 0) ipoAt = t;
  }
  if (s.earnedLife >= 1e12) mark('заработано $1T', t);

  // Кандидаты на покупку: [окупаемость, цена, действие, метка]
  for (let guard = 0; guard < 50; guard++) {
    const cands: [number, number, () => void, string][] = [];
    const curJobIdx = JOBS.findIndex((j) => j.id === s.job);
    const next = JOBS[curJobIdx + 1];
    if (next && s.clicksLife >= next.clicks && totalUnits(s) >= (next.needUnits ?? 0)) {
      const d = (next.hourly - JOBS[curJobIdx].hourly) * clickParts(s, mods, income).mult * mods.clickMult * avgCrit * avgCombo * cps(t);
      cands.push([next.cost / Math.max(1e-9, d), next.cost, () => (s.job = next.id), `работа: ${next.name}`]);
    }
    for (const u of CLICK_UPGRADES) {
      if (s.clickUpgrades.includes(u.id)) continue;
      const before = clickParts(s, mods, income).base;
      s.clickUpgrades.push(u.id);
      const after = clickParts(s, mods, income).base;
      s.clickUpgrades.pop();
      const d = (after - before) * avgCrit * avgCombo * cps(t);
      cands.push([u.cost / Math.max(1e-9, d), u.cost, () => s.clickUpgrades.push(u.id), `клик: ${u.name}`]);
      break; // только следующее по порядку
    }
    for (const def of BUSINESSES) {
      const st = (s.businesses[def.id] ??= { level: 0, manager: false, progress: 0, running: false, invested: 0, earned: 0 });
      const cost = unitCost(def, st.level, mods);
      const d = bizIncome(def.id, st.level + 1, mods, owned, st.manager) - bizIncome(def.id, st.level, mods, owned, st.manager);
      cands.push([cost / Math.max(1e-9, d), cost, () => { st.level++; st.invested += cost; }, `точка: ${def.name} #${st.level + 1}`]);
      if (st.level > 0 && !st.manager) {
        const mc = managerCost(def, mods);
        const dm = bizIncome(def.id, st.level, mods, owned, true) - bizIncome(def.id, st.level, mods, owned, false);
        cands.push([mc / Math.max(1e-9, dm), mc, () => (st.manager = true), `менеджер: ${def.name}`]);
      }
      if (st.level > 0) {
        for (const u of BIZ_UPGRADES.filter((x) => x.biz === def.id && !owned.has(x.id))) {
          const uc = bizUpgradeCost(u.id);
          const before = bizIncome(def.id, st.level, mods, owned, st.manager);
          owned.add(u.id);
          const after = bizIncome(def.id, st.level, mods, owned, st.manager);
          owned.delete(u.id);
          cands.push([uc / Math.max(1e-9, after - before), uc, () => s.bizUpgrades.push(u.id), `улучшение: ${def.name} — ${u.name}`]);
        }
      }
    }
    cands.sort((a, b) => a[0] - b[0]);
    const best = cands[0];
    // покупаем лучшее, если по карману; иначе — что-то почти такое же хорошее и доступное
    const pick = best[1] <= s.cash ? best : cands.find((c) => c[1] <= s.cash && c[0] < best[0] * 1.6);
    if (!pick) break;
    s.cash -= pick[1];
    pick[2]();
    if (pick[3].startsWith('клик') || pick[3].startsWith('работа')) mark(pick[3], t, `$${money(pick[1])}`);
    if (pick[3].startsWith('точка') && pick[3].endsWith('#1')) mark(pick[3], t, `$${money(pick[1])}`);
    if (pick[3].startsWith('менеджер')) mark(pick[3], t, `$${money(pick[1])}`);
    if (!seen.has('первая покупка')) mark('первая покупка', t, pick[3]);
  }
  if (t % 1800 === 0 && t > 0) {
    log.push(`  … ${fmtT(t)}: доход ${money(income)}/с, клик ${money(click)}, заработано ${money(s.earnedLife)}, точек ${totalUnits(s)}`);
  }
}
console.log(log.join('\n'));
const repGain = Math.floor(BALANCE.prestige.coef * Math.sqrt(s.earnedLife / BALANCE.prestige.base));
console.log(`\nИтог за ${MINUTES} мин: заработано $${money(s.earnedLife)}, IPO дало бы ${repGain} репутации (+${(repGain * BALANCE.prestige.bonusPerRep * 100).toFixed(0)}%)`);
