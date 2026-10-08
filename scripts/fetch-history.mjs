#!/usr/bin/env node
// Загрузка реальных исторических цен из публичных источников в data/raw/*.json.
//
// Запуск:  npm run data:fetch            (затем npm run data:build)
// За прокси: NODE_USE_ENV_PROXY=1 npm run data:fetch   (Node >= 22.21)
//
// Источники (все бесплатные, без ключа, кроме CoinGecko):
//  • Yahoo Finance chart API v8 — дневные котировки акций/ETF + сплиты + дивиденды
//  • Stooq CSV — запасной источник для акций
//  • CoinMetrics Community Data (GitHub) — дневные цены криптовалют, хешрейт и эмиссия BTC
//  • CoinGecko /market_chart — SOL и LUNA (нужен бесплатный Demo-ключ COINGECKO_API_KEY)
//  • GitHub datasets/* (Open Knowledge): нефть WTI, золото, EUR/USD, S&P 500, VIX, 10Y, CPI
//
// Каждый источник необязателен: если загрузка не удалась, build-history.mjs
// использует опорные точки из scripts/anchors (приближённые исторические закрытия).

import { RAW_DIR, START, dayNum, dayStr, writeJson } from './lib/common.mjs';
import { STOCKS } from './anchors/stocks.mjs';

const UA = { 'User-Agent': 'Mozilla/5.0 (empire-from-zero data script)' };
const results = [];

async function get(url, opts = {}) {
  const res = await fetch(url, { headers: { ...UA, ...(opts.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return opts.json ? res.json() : res.text();
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const row = {};
    head.forEach((h, i) => (row[h] = cells[i]));
    return row;
  });
}

/** Превращает пары [дата, значение] в плотный дневной массив от START. */
function toDaily(pairs) {
  const start = dayNum(START);
  const values = [];
  for (const [d, v] of pairs) {
    const i = dayNum(d) - start;
    if (i < 0 || !Number.isFinite(v)) continue;
    values[i] = v;
  }
  for (let i = 0; i < values.length; i++) if (values[i] === undefined) values[i] = null;
  return { start: START, values };
}

async function step(name, fn) {
  try {
    const info = await fn();
    results.push(`✔ ${name}${info ? ' — ' + info : ''}`);
  } catch (e) {
    results.push(`✘ ${name} — ${e.message}`);
  }
}

const GH = 'https://raw.githubusercontent.com';

// ---------- 1. Макро и сырьё (GitHub datasets) ----------
await step('WTI daily (datasets/oil-prices)', async () => {
  const rows = parseCsv(await get(`${GH}/datasets/oil-prices/main/data/wti-daily.csv`));
  const d = toDaily(rows.map((r) => [r.Date, Number(r.Price)]));
  writeJson(`${RAW_DIR}/WTI.json`, { id: 'WTI', source: 'EIA via github.com/datasets/oil-prices', ...d });
  return `${rows.length} строк`;
});

await step('Gold monthly (datasets/gold-prices)', async () => {
  const rows = parseCsv(await get(`${GH}/datasets/gold-prices/main/data/monthly.csv`));
  const points = rows
    .filter((r) => r.Date >= '1999-01')
    .map((r) => [`${r.Date}-15`, Number(r.Price)]);
  writeJson(`${RAW_DIR}/XAU-monthly.json`, { id: 'XAU', source: 'github.com/datasets/gold-prices (monthly avg)', points });
  return `${points.length} мес.`;
});

await step('EUR/USD daily (datasets/exchange-rates)', async () => {
  const rows = parseCsv(await get(`${GH}/datasets/exchange-rates/main/data/daily.csv`));
  // В наборе — евро за доллар; переворачиваем в EUR/USD
  const pairs = rows
    .filter((r) => r.Country === 'Euro' && Number(r['Exchange rate']) > 0)
    .map((r) => [r.Date, 1 / Number(r['Exchange rate'])]);
  writeJson(`${RAW_DIR}/EURUSD.json`, { id: 'EURUSD', source: 'FRED via github.com/datasets/exchange-rates', ...toDaily(pairs) });
  return `${pairs.length} дней`;
});

await step('S&P 500 monthly (datasets/s-and-p-500)', async () => {
  const rows = parseCsv(await get(`${GH}/datasets/s-and-p-500/main/data/data.csv`));
  const points = rows.filter((r) => r.Date >= '1999-01-01').map((r) => [r.Date.slice(0, 8) + '15', Number(r.SP500)]);
  writeJson(`${RAW_DIR}/SPX-monthly.json`, { id: 'SPX', source: 'Shiller via github.com/datasets/s-and-p-500 (monthly avg)', points });
  return `${points.length} мес.`;
});

await step('VIX daily (datasets/finance-vix)', async () => {
  const rows = parseCsv(await get(`${GH}/datasets/finance-vix/main/data/vix-daily.csv`));
  const d = toDaily(rows.map((r) => [r.DATE, Number(r.CLOSE)]));
  writeJson(`${RAW_DIR}/VIX.json`, { id: 'VIX', source: 'CBOE via github.com/datasets/finance-vix', ...d });
  return `${rows.length} строк`;
});

await step('US 10Y yield monthly (datasets/bond-yields-us-10y)', async () => {
  const rows = parseCsv(await get(`${GH}/datasets/bond-yields-us-10y/main/data/monthly.csv`));
  const points = rows.filter((r) => r.Date >= '1999-01-01').map((r) => [r.Date, Number(r.Rate)]);
  writeJson(`${RAW_DIR}/UST10Y-monthly.json`, { id: 'UST10Y', source: 'FRED via github.com/datasets/bond-yields-us-10y', points });
  return `${points.length} мес.`;
});

await step('US CPI monthly (datasets/cpi-us)', async () => {
  const rows = parseCsv(await get(`${GH}/datasets/cpi-us/main/data/cpiai.csv`));
  const points = rows.filter((r) => r.Date >= '1999-01-01').map((r) => [r.Date, Number(r.Index)]);
  writeJson(`${RAW_DIR}/CPI-monthly.json`, { id: 'CPI', source: 'BLS via github.com/datasets/cpi-us', points });
  return `${points.length} мес.`;
});

// ---------- 2. Криптовалюты (CoinMetrics Community) ----------
const CM = { BTC: 'btc', ETH: 'eth', BNB: 'bnb', XRP: 'xrp', DOGE: 'doge', LTC: 'ltc', FTT: 'ftt', SOL: 'sol', LUNA: 'luna' };
for (const [sym, asset] of Object.entries(CM)) {
  await step(`${sym} (CoinMetrics)`, async () => {
    const rows = parseCsv(await get(`${GH}/coinmetrics/data/master/csv/${asset}.csv`));
    const pairs = rows.filter((r) => r.PriceUSD).map((r) => [r.time, Number(r.PriceUSD)]);
    if (pairs.length < 30) throw new Error('нет истории PriceUSD');
    writeJson(`${RAW_DIR}/${sym}.json`, { id: sym, source: 'CoinMetrics Community Data', ...toDaily(pairs) });
    if (sym === 'BTC') {
      const hash = rows.filter((r) => r.HashRate).map((r) => [r.time, Number(r.HashRate)]);
      const iss = rows.filter((r) => r.IssTotNtv).map((r) => [r.time, Number(r.IssTotNtv)]);
      writeJson(`${RAW_DIR}/BTC-hashrate.json`, { id: 'BTC-hashrate', unit: 'TH/s', source: 'CoinMetrics', ...toDaily(hash) });
      writeJson(`${RAW_DIR}/BTC-issuance.json`, { id: 'BTC-issuance', unit: 'BTC/day', source: 'CoinMetrics', ...toDaily(iss) });
    }
    return `${pairs.length} дней, до ${pairs.at(-1)[0]}`;
  });
}

// SOL и LUNA: в Community-наборе нет PriceUSD — пробуем CoinGecko (Demo-ключ)
const CG_KEY = process.env.COINGECKO_API_KEY || process.env.VITE_COINGECKO_API_KEY;
for (const [sym, id] of [['SOL', 'solana'], ['LUNA', 'terra-luna']]) {
  await step(`${sym} (CoinGecko)`, async () => {
    if (!CG_KEY) throw new Error('нет COINGECKO_API_KEY — будут опорные точки');
    const json = await get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=max&interval=daily`, {
      json: true,
      headers: { 'x-cg-demo-api-key': CG_KEY },
    });
    const pairs = json.prices.map(([t, p]) => [dayStr(Math.floor(t / 86_400_000)), p]);
    writeJson(`${RAW_DIR}/${sym}.json`, { id: sym, source: 'CoinGecko', ...toDaily(pairs) });
    return `${pairs.length} дней`;
  });
}

// ---------- 3. Акции и ETF (Yahoo → Stooq) ----------
const p1 = Math.floor(Date.UTC(1999, 11, 1) / 1000);
const p2 = Math.floor(Date.now() / 1000);
for (const sym of Object.keys(STOCKS)) {
  await step(`${sym} (Yahoo Finance)`, async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
    const json = await get(url, { json: true });
    const r = json.chart.result[0];
    const ts = r.timestamp;
    const close = r.indicators.quote[0].close; // скорректировано только на сплиты
    const splits = Object.values(r.events?.splits ?? {}).map((s) => ({
      date: dayStr(Math.floor(s.date / 86400)),
      ratio: s.numerator / s.denominator,
    }));
    const dividends = Object.values(r.events?.dividends ?? {}).map((d) => ({
      date: dayStr(Math.floor(d.date / 86400)),
      amount: d.amount, // на акцию, скорректировано на сплиты
    }));
    const pairs = ts.map((t, i) => [dayStr(Math.floor(t / 86400)), close[i]]).filter((p) => p[1] != null);
    writeJson(`${RAW_DIR}/${sym}.json`, { id: sym, source: 'Yahoo Finance', adjusted: 'splits', splits, dividends, ...toDaily(pairs) });
    return `${pairs.length} дней`;
  }).then(async () => {
    if (!results.at(-1).startsWith('✘')) return;
    await step(`${sym} (Stooq)`, async () => {
      const rows = parseCsv(await get(`https://stooq.com/q/d/l/?s=${sym.toLowerCase()}.us&i=d`));
      const pairs = rows.filter((r) => r.Close).map((r) => [r.Date, Number(r.Close)]);
      if (pairs.length < 100) throw new Error('пустой ответ');
      writeJson(`${RAW_DIR}/${sym}.json`, { id: sym, source: 'Stooq', adjusted: 'splits', ...toDaily(pairs) });
      return `${pairs.length} дней`;
    });
  });
}

console.log('\nИтог загрузки:\n' + results.join('\n'));
console.log('\nТеперь запустите: npm run data:build');
