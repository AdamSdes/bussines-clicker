import { useMemo } from 'react';
import { NEWS } from '../../engine/config';
import { dayNum, fmtDate } from '../../engine/time';
import { useGame } from '../../store/game';
import { useLive } from '../../engine/liveStore';

/** Бегущая строка: реальные события до текущей игровой даты (в живом режиме — реальные заголовки Finnhub) */
export function NewsTicker() {
  const cursor = useGame((g) => g.s.newsCursor);
  const live = useGame((g) => g.s.live);
  const headlines = useLive((l) => l.headlines);
  const items = useMemo(() => {
    if (live && headlines.length) return headlines.slice(0, 12).map((h) => ({ d: h.date, t: h.title }));
    const out = NEWS.slice(Math.max(0, cursor - 9), cursor + 1).reverse();
    return out.map((n) => ({ d: fmtDate(dayNum(n.d)), t: n.t }));
  }, [cursor, live, headlines]);
  if (!items.length) return null;
  const line = items.map((n, i) => (
    <span key={i} className="mx-6 inline-flex items-center gap-2 whitespace-nowrap">
      <span className="num text-gold">{n.d}</span>
      <span className="text-ink-dim">{n.t}</span>
    </span>
  ));
  return (
    <div className="mx-auto mt-2 max-w-5xl px-3">
      <div className="glass flex h-9 items-center overflow-hidden rounded-xl text-[12.5px]">
        <div className="z-10 flex h-full shrink-0 items-center gap-1.5 bg-[#121926] pl-3 pr-3 font-bold text-gold shadow-[8px_0_12px_#121926]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
          {live ? 'LIVE' : 'НОВОСТИ'}
        </div>
        <div className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
          <div className="flex animate-ticker" style={{ animationDuration: `${Math.max(40, items.length * 9)}s` }}>
            <div className="flex">{line}</div>
            <div className="flex" aria-hidden>
              {line}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
