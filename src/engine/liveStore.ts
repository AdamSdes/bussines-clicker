// «Живой режим»: когда игровое время догнало реальность, котировки подтягиваются из API.
//  • Крипта — CoinGecko /simple/price (Demo-ключ: ~30–100 запросов/мин, 10 000 кредитов/мес)
//  • Акции/ETF — Finnhub /quote (бесплатный ключ: 60 запросов/мин), новости — Finnhub /news
// Ключи — в .env (VITE_COINGECKO_API_KEY, VITE_FINNHUB_API_KEY). Если ключей нет или API
// недоступен — цены продолжаются детерминированной симуляцией (см. market.ts → extend).
import { create } from 'zustand';
import { ASSETS } from './config';
import { setLiveQuote } from './market';

type Status = 'idle' | 'ok' | 'error' | 'nokey' | 'loading';

interface LiveState {
  crypto: Status;
  stocks: Status;
  news: Status;
  lastCrypto: number;
  lastStocks: number;
  headlines: { date: string; title: string; source: string; url?: string }[];
  error?: string;
}

export const useLive = create<LiveState>(() => ({
  crypto: 'idle',
  stocks: 'idle',
  news: 'idle',
  lastCrypto: 0,
  lastStocks: 0,
  headlines: [],
}));

const env = import.meta.env;
const CG_KEY = env.VITE_COINGECKO_API_KEY || '';
const FH_KEY = env.VITE_FINNHUB_API_KEY || '';
export const CRYPTO_POLL_MS = Math.max(60, Number(env.VITE_LIVE_CRYPTO_POLL_SEC || 300)) * 1000;
export const STOCKS_POLL_MS = Math.max(60, Number(env.VITE_LIVE_STOCKS_POLL_SEC || 120)) * 1000;

async function getJson(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function pollCrypto(day: number) {
  const coins = ASSETS.filter((a) => a.kind === 'crypto' && a.coingeckoId);
  const ids = coins.map((a) => a.coingeckoId).join(',');
  useLive.setState({ crypto: 'loading' });
  try {
    const base = CG_KEY ? 'https://api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
    const json = await getJson(`${base}/simple/price?ids=${ids}&vs_currencies=usd`, CG_KEY ? { 'x-cg-demo-api-key': CG_KEY } : undefined);
    let n = 0;
    for (const a of coins) {
      const p = json?.[a.coingeckoId!]?.usd;
      if (typeof p === 'number') {
        setLiveQuote(a.id, p, day);
        n++;
      }
    }
    useLive.setState({ crypto: n ? 'ok' : 'error', lastCrypto: Date.now(), error: n ? undefined : 'пустой ответ CoinGecko' });
  } catch (e) {
    useLive.setState({ crypto: CG_KEY ? 'error' : 'nokey', error: (e as Error).message });
  }
}

export async function pollStocks(day: number) {
  if (!FH_KEY) {
    useLive.setState({ stocks: 'nokey', news: 'nokey' });
    return;
  }
  useLive.setState({ stocks: 'loading' });
  const symbols = ASSETS.filter((a) => a.kind === 'stock' || a.kind === 'etf').map((a) => a.id);
  let n = 0;
  // 17 запросов за опрос — с запасом укладываемся в лимит 60/мин бесплатного Finnhub
  for (const sym of symbols) {
    try {
      const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FH_KEY}`);
      if (typeof q?.c === 'number' && q.c > 0) {
        setLiveQuote(sym, q.c, day);
        n++;
      }
    } catch {
      /* пропускаем символ */
    }
  }
  // Сырьё и валюта через OANDA-символы (может требовать платный тариф — тогда остаётся симуляция)
  for (const [id, sym] of [['XAU', 'OANDA:XAU_USD'], ['EURUSD', 'OANDA:EUR_USD'], ['WTI', 'OANDA:WTICO_USD']] as const) {
    try {
      const q = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FH_KEY}`);
      if (typeof q?.c === 'number' && q.c > 0) setLiveQuote(id, q.c, day);
    } catch {
      /* премиум-символ */
    }
  }
  useLive.setState({ stocks: n ? 'ok' : 'error', lastStocks: Date.now() });
  try {
    const news = await getJson(`https://finnhub.io/api/v1/news?category=general&token=${FH_KEY}`);
    if (Array.isArray(news)) {
      useLive.setState({
        news: 'ok',
        headlines: news.slice(0, 20).map((n: { datetime: number; headline: string; source: string; url: string }) => ({
          date: new Date(n.datetime * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          title: n.headline,
          source: n.source,
          url: n.url,
        })),
      });
    }
  } catch {
    useLive.setState({ news: 'error' });
  }
}

export const LIVE_KEYS = { coingecko: !!CG_KEY, finnhub: !!FH_KEY };
