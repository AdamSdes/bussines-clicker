/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COINGECKO_API_KEY?: string;
  readonly VITE_FINNHUB_API_KEY?: string;
  readonly VITE_LIVE_CRYPTO_POLL_SEC?: string;
  readonly VITE_LIVE_STOCKS_POLL_SEC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
