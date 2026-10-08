import { ASSETS } from '../../engine/config';
import { changeOver, closes, firstDay, listedOn, marketOpen, priceAt } from '../../engine/market';
import { fmtMoney, fmtPrice, fmtQty } from '../../engine/format';
import type { AssetDef, AssetKind } from '../../engine/types';
import { useClock } from '../../hooks/useClock';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { Change, Sparkline, TickerLogo, cx } from '../ui';

function Row({ a }: { a: AssetDef }) {
  const s = useGame.getState().s;
  const open = useUi((u) => u.open);
  const listed = listedOn(a.id, s.day);
  const h = s.holdings[a.id];
  if (!listed) {
    const fd = firstDay(a.id);
    return (
      <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 opacity-50">
        <TickerLogo id={a.id} color={a.color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{a.id}</div>
          <div className="truncate text-xs text-ink-dim">{a.name}</div>
        </div>
        <div className="text-right text-xs text-ink-mute">{fd ? (a.kind === 'crypto' ? 'ещё не существует' : 'ещё не на бирже') : 'нет данных'}</div>
      </div>
    );
  }
  const p = priceAt(a.id, s.day, s.live) ?? 0;
  const ch = changeOver(a.id, s.day, 1, s.live);
  const spark = closes(a.id, Math.floor(s.day) - 30, Math.floor(s.day)).map(([, v]) => v);
  spark.push(p);
  const ghostDead = a.ghost && s.day > Math.floor(new Date(a.ghost).getTime() / 86400000);
  return (
    <button onClick={() => open({ type: 'asset', id: a.id })} className="press flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/[0.03]">
      <TickerLogo id={a.id} color={a.color} size={40} ghost={!!ghostDead} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-bold">
          {a.id === 'EURUSD' ? 'EUR/USD' : a.id}
          {!marketOpen(a.id, s.day) && <span className="text-[10px] font-semibold text-ink-mute">закрыта</span>}
        </div>
        <div className="truncate text-xs text-ink-dim">
          {h && h.qty > 0 ? (
            <span className="text-gold">
              {fmtQty(h.qty)} · {fmtMoney(h.qty * Math.max(0, p))}
            </span>
          ) : (
            a.name
          )}
        </div>
      </div>
      <Sparkline points={spark} className="hidden shrink-0 sm:block" />
      <div className="w-[92px] shrink-0 text-right">
        <div className="num text-sm font-bold">{fmtPrice(p)}</div>
        <Change value={ch} className="text-xs" />
      </div>
    </button>
  );
}

export function AssetGroup({ title, kinds }: { title: string; kinds: AssetKind[] }) {
  useClock(600);
  const list = ASSETS.filter((a) => kinds.includes(a.kind));
  const s = useGame.getState().s;
  // торгуемые наверху, не вышедшие на биржу — внизу
  const sorted = [...list].sort((x, y) => Number(listedOn(y.id, s.day)) - Number(listedOn(x.id, s.day)));
  return (
    <div className="glass mt-3 rounded-2xl p-1.5">
      <div className="px-3 pb-1 pt-2 text-[12px] font-bold uppercase tracking-wider text-ink-dim">{title}</div>
      {sorted.map((a) => (
        <Row key={a.id} a={a} />
      ))}
    </div>
  );
}

/** Сводка по портфелю выбранных классов активов */
export function PortfolioSummary({ kinds }: { kinds: AssetKind[] }) {
  useClock(500);
  const s = useGame.getState().s;
  let value = 0;
  let cost = 0;
  let day = 0;
  let realized = 0;
  let divs = 0;
  for (const a of ASSETS) {
    if (!kinds.includes(a.kind)) continue;
    const h = s.holdings[a.id];
    if (!h) continue;
    realized += h.realized;
    divs += h.dividends;
    if (h.qty <= 0) continue;
    const p = Math.max(0, priceAt(a.id, s.day, s.live) ?? 0);
    value += h.qty * p;
    cost += h.cost;
    const ch = changeOver(a.id, s.day, 1, s.live) ?? 0;
    day += (h.qty * p * ch) / (1 + ch);
  }
  const pnl = value - cost;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Портфель</div>
          <div className="num text-2xl font-extrabold">{fmtMoney(value)}</div>
          <div className={cx('num text-xs font-semibold', day >= 0 ? 'text-up' : 'text-down')}>
            {day >= 0 ? '+' : ''}
            {fmtMoney(day)} за день
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">P/L позиций</div>
          <div className={cx('num text-lg font-bold', pnl >= 0 ? 'text-up' : 'text-down')}>
            {pnl >= 0 ? '+' : ''}
            {fmtMoney(pnl)}
          </div>
          <div className={cx('num text-xs', pnl >= 0 ? 'text-up' : 'text-down')}>{cost > 0 ? `${pnl >= 0 ? '+' : ''}${((pnl / cost) * 100).toFixed(1)}%` : '—'}</div>
        </div>
      </div>
      {(realized !== 0 || divs > 0) && (
        <div className="mt-2 flex gap-4 text-xs text-ink-dim">
          <span>
            Зафиксировано: <span className={cx('num', realized >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(realized)}</span>
          </span>
          {divs > 0 && (
            <span>
              Дивиденды: <span className="num text-up">{fmtMoney(divs)}</span>
            </span>
          )}
        </div>
      )}
      <div className="mt-2 text-[11px] text-ink-mute">Биржа США работает по будням, крипта торгуется 24/7.</div>
    </div>
  );
}
