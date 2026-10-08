import { useEffect } from 'react';
import { BALANCE } from '../engine/config';
import { pollCrypto, pollStocks, CRYPTO_POLL_MS, STOCKS_POLL_MS } from '../engine/liveStore';
import { useGame } from '../store/game';

/** Игровой цикл 100 мс + автосейв каждые 10 с + сохранение при уходе со страницы. */
export function useGameLoop(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      // если вкладка спала, большой разрыв обработает офлайн-логика при возвращении
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      useGame.getState().step(dt);
    }, BALANCE.tickMs);
    const save = window.setInterval(() => useGame.getState().save(), BALANCE.autosaveSec * 1000);
    const onHide = () => useGame.getState().save();
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide();
      else {
        last = performance.now();
        useGame.getState().boot();
      }
    };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      clearInterval(save);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);
}

/** Опрос API в живом режиме (только когда вкладка видима и режим включён в настройках). */
export function useLivePolling(enabled: boolean) {
  const live = useGame((g) => g.s.live);
  const allowed = useGame((g) => g.s.settings.liveApi);
  useEffect(() => {
    if (!enabled || !live || !allowed) return;
    const run = (fn: (day: number) => Promise<void>) => () => {
      if (document.visibilityState === 'visible') void fn(useGame.getState().s.day);
    };
    const c = run(pollCrypto);
    const st = run(pollStocks);
    c();
    st();
    const a = window.setInterval(c, CRYPTO_POLL_MS);
    const b = window.setInterval(st, STOCKS_POLL_MS);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [enabled, live, allowed]);
}
