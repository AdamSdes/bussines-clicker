// Дымовой тест движка без браузера: npm run test:engine
import fs from 'node:fs';
import path from 'node:path';
import { produce } from 'immer';
import { registerSeries, priceAt, closeOn, btcIssuance, btcHashrate, fedRate, ust10y } from '../src/engine/market';
import { newGame } from '../src/engine/initial';
import { tick, applyOffline, initNewsCursor, advanceTo, emptyTotals } from '../src/engine/simulate';
import { computeMods } from '../src/engine/modifiers';
import * as A from '../src/engine/actions';
import { netWorth } from '../src/engine/networth';
import { dayNum, dayStr } from '../src/engine/time';
import type { GameState } from '../src/engine/types';

const dir = path.resolve('src/data/history');
const macro = JSON.parse(fs.readFileSync('src/data/macro.json', 'utf8'));
for (const f of fs.readdirSync(dir)) if (f !== 'index.json') registerSeries(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), macro);

let failures = 0;
const check = (name: string, cond: boolean, info = '') => {
  console.log(`${cond ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`);
  if (!cond) failures++;
};

// Цены и макро
check('BTC до 5 окт 2009 не торгуется', priceAt('BTC', dayNum('2009-09-01')) == null);
check('BTC 22.05.2010 ≈ $0.004', Math.abs((closeOn('BTC', dayNum('2010-05-22')) ?? 0) - 0.0041) < 0.001);
check('Ставка ФРС 2009 = 0.25%', Math.abs(fedRate(dayNum('2009-06-01')) - 0.0025) < 1e-9);
check('Ставка ФРС 2023-08 = 5.5%', Math.abs(fedRate(dayNum('2023-08-01')) - 0.055) < 1e-9);
check('10Y в 2020-08 < 1%', ust10y(dayNum('2020-08-15')) < 0.01, String(ust10y(dayNum('2020-08-15'))));
check('Эмиссия BTC 2009 ≈ 50×блоки', btcIssuance(dayNum('2009-06-01')) > 1000);
check('Хешрейт 2024 > 1e8 TH/s', btcHashrate(dayNum('2024-06-01')) > 1e8);
check('Цена после конца данных существует', (priceAt('AAPL', dayNum('2027-01-05')) ?? 0) > 0);

// Сплит AAPL 2014 и дивиденды
let s: GameState = produce(newGame('sandbox', '2014-06-02'), (d) => initNewsCursor(d));
s = produce(s, (d) => {
  d.cash = 1e6;
  const mods = computeMods(d);
  const r = A.trade(d, 'AAPL', 'buy', 10, mods, false);
  check('Покупка AAPL', r.ok);
  advanceTo(d, dayNum('2014-06-12'), mods, () => undefined, true, emptyTotals());
  check('Сплит 7:1 → 70 акций', Math.abs(d.holdings.AAPL.qty - 70) < 1e-9, String(d.holdings.AAPL.qty));
  advanceTo(d, dayNum('2014-12-31'), mods, () => undefined, true, emptyTotals());
  check('Дивиденды получены', d.holdings.AAPL.dividends > 0, d.holdings.AAPL.dividends.toFixed(2));
});

// Майнинг в 2009
s = produce(newGame('story'), (d) => {
  initNewsCursor(d);
  d.cash = 10000;
  const mods = computeMods(d);
  check('CPU-майнер недоступен до генезис-блока', !A.buyRig(d, 'cpu', 1).ok);
  advanceTo(d, dayNum('2009-01-03'), mods, () => undefined, true, emptyTotals());
  check('Покупка CPU-майнера', A.buyRig(d, 'cpu', 1).ok);
  advanceTo(d, dayNum('2009-02-01'), mods, () => undefined, true, emptyTotals());
  check('Намайнено BTC в январе 2009', d.stats.minedBTC > 100, d.stats.minedBTC.toFixed(0));
});

// Бизнес, тики и офлайн
s = produce(newGame('story'), (d) => {
  initNewsCursor(d);
  d.cash = 2e5;
  const mods = computeMods(d);
  check('Покупка кофе-точки', A.buyBusiness(d, 'coffee_cart', 5, mods).ok);
  check('Найм менеджера', A.hireManager(d, 'coffee_cart', computeMods(d)).ok);
  const t0 = Date.now();
  const cash0 = d.cash;
  for (let i = 0; i < 100; i++) tick(d, 0.1, t0 + i * 100, () => undefined);
  check('Бизнес приносит деньги', d.cash > cash0, `+${(d.cash - cash0).toFixed(0)}`);
  check('Время идёт (x1: 10 с ≈ 1/6 дня)', Math.abs(d.day - dayNum('2009-01-01') - 10 / 60) < 0.01, dayStr(d.day));
  d.lastSeen = t0 - 3600_000;
  const away = applyOffline(d, t0);
  check('Офлайн-сводка', !!away && away.bizIncome > 0, away ? `+$${away.bizIncome.toFixed(0)}, ${(away.toDay - away.fromDay).toFixed(1)} дн.` : '');
  check('Капитал > 0', netWorth(d) > 0);
});

// IPO
s = produce(s, (d) => {
  d.earnedLife = 5e9;
  d.earnedTotal = 5e9;
});
const ipo = A.doIpo(s, 2009);
check('IPO даёт репутацию', ipo.ok && ipo.gain > 0, ipo.ok ? `+${ipo.gain}` : ipo.error);
if (ipo.ok) check('Новая жизнь с 2009', dayStr(ipo.next.day) === '2009-01-01' && ipo.next.repEarned === ipo.gain);

console.log(failures ? `\n${failures} проверок не прошло` : '\nВсе проверки пройдены');
process.exit(failures ? 1 : 0);
