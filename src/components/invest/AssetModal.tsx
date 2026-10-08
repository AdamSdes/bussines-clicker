import { useMemo, useState } from 'react';
import { ASSET_BY_ID, CORPORATE } from '../../engine/config';
import { maxBuyQty, tradeFee, execPrice } from '../../engine/actions';
import {
  changeOver, closeOn, dividendYield, firstDay, listedOn, marketOpen, nextDividend, nextEarnings, priceAt, seriesInfo, splitsOf,
} from '../../engine/market';
import { fmtMoney, fmtPct, fmtPrice, fmtQty } from '../../engine/format';
import { dayNum, fmtDate, yearOf } from '../../engine/time';
import { useClock } from '../../hooks/useClock';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { Badge, Button, Change, Modal, NumberInput, Segmented, Stat, TickerLogo, cx } from '../ui';
import { CandleChart } from './CandleChart';

const RANGES = [
  { value: 30, label: '1М' },
  { value: 90, label: '3М' },
  { value: 365, label: '1Г' },
  { value: 1825, label: '5Л' },
  { value: 0, label: 'Всё' },
];

/** «Инсайдерская интуиция»: подсказка о будущем тренде (навык из дерева) */
function InsiderHint({ id }: { id: string }) {
  const level = useGame((g) => g.s.skills.insider ?? 0);
  const s = useGame.getState().s;
  if (!level) return null;
  const k = Math.floor(s.day);
  const horizon = level >= 3 ? 90 : level === 2 ? 30 : 7;
  const now = priceAt(id, s.day) ?? 0;
  const fut = closeOn(id, k + horizon);
  if (!now || fut == null) return null;
  const ch = fut / now - 1;
  let crash = false;
  if (level >= 3) {
    for (let d = 1; d <= 90; d++) {
      const c = closeOn(id, k + d);
      if (c != null && c < now * 0.75) crash = true;
    }
  }
  const strong = Math.abs(ch) > 0.15;
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-[rgba(124,140,255,0.1)] px-3 py-2 text-sm">
      <span>🔮</span>
      <span className="text-ink-dim">
        Чутьё на {horizon} дн.:{' '}
        <span className={cx('font-bold', ch >= 0 ? 'text-up' : 'text-down')}>
          {ch >= 0 ? (strong ? 'сильный рост' : 'рост') : strong ? 'сильное падение' : 'падение'}
          {level >= 2 && ` (${fmtPct(ch, 0)})`}
        </span>
        {crash && <span className="ml-1 font-bold text-down">· ⚠️ впереди обвал</span>}
      </span>
    </div>
  );
}

function Fundamentals({ id }: { id: string }) {
  const a = ASSET_BY_ID[id];
  const day = useGame((g) => Math.floor(g.s.day / 30));
  const year = yearOf(day * 30);
  const rows = Object.entries(a.revenue ?? {})
    .map(([y, v]) => [Number(y), v] as [number, number])
    .filter(([y]) => y < year)
    .slice(-10);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <div className="mt-4">
      <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-dim">Выручка по годам, млрд $</div>
      <div className="flex h-28 items-end gap-1.5">
        {rows.map(([y, v], i) => {
          const prev = rows[i - 1]?.[1];
          const up = prev == null || v >= prev;
          return (
            <div key={y} className="flex flex-1 flex-col items-center gap-1">
              <div className="num text-[9px] text-ink-dim">{v >= 100 ? v.toFixed(0) : v.toFixed(1)}</div>
              <div className={cx('w-full rounded-t-md', up ? 'bg-up/70' : 'bg-down/70')} style={{ height: `${Math.max(4, (v / max) * 80)}px` }} />
              <div className="num text-[9px] text-ink-mute">{String(y).slice(2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TradePanel({ id }: { id: string }) {
  const s = useGame((g) => g.s);
  const mods = useGame((g) => g.rt.mods);
  const trade = useGame((g) => g.trade);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qtyStr, setQtyStr] = useState('');
  const a = ASSET_BY_ID[id];
  const h = s.holdings[id];
  const price = execPrice(id, s.day, s.live) ?? 0;
  const maxBuy = maxBuyQty(s, id, s.live, mods);
  const maxSell = h?.qty ?? 0;
  const qty = Number(qtyStr) || 0;
  const amount = qty * price;
  const fee = qty > 0 ? tradeFee(id, amount, mods) : 0;
  const open = marketOpen(id, s.day);
  const listed = listedOn(id, s.day);
  const max = side === 'buy' ? maxBuy : maxSell;
  const valid = qty > 0 && qty <= max * (1 + 1e-9) && open && listed;
  const setPct = (p: number) => {
    const q = max * p;
    setQtyStr(q > 0 ? String(a.kind === 'crypto' || q < 1 ? +q.toPrecision(6) : Math.floor(q * 10000) / 10000) : '');
  };
  return (
    <div className="mt-4 rounded-2xl bg-white/[0.03] p-3">
      <Segmented
        size="sm"
        value={side}
        onChange={(v) => {
          setSide(v);
          setQtyStr('');
        }}
        options={[
          { value: 'buy', label: 'Купить' },
          { value: 'sell', label: 'Продать' },
        ]}
      />
      <div className="mt-3 flex gap-2">
        <NumberInput value={qtyStr} onChange={setQtyStr} placeholder={`Количество, ${a.unit}`} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {[0.1, 0.25, 0.5, 1].map((p) => (
          <button key={p} onClick={() => setPct(p)} className="press h-9 rounded-lg bg-white/[0.05] text-xs font-semibold text-ink-dim hover:text-ink">
            {p === 1 ? 'MAX' : `${p * 100}%`}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-1 text-xs text-ink-dim">
        <div className="flex justify-between">
          <span>Цена</span>
          <span className="num text-ink">{fmtPrice(price)}</span>
        </div>
        <div className="flex justify-between">
          <span>Сумма</span>
          <span className="num text-ink">{fmtMoney(amount)}</span>
        </div>
        <div className="flex justify-between">
          <span>Комиссия ({a.kind === 'crypto' ? '0,5%' : '0,1%'}, мин. $1)</span>
          <span className="num">{fmtMoney(fee)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>Доступно</span>
          <span className="num">{side === 'buy' ? `${fmtMoney(s.cash)} → до ${fmtQty(maxBuy)} ${a.unit}` : `${fmtQty(maxSell)} ${a.unit}`}</span>
        </div>
      </div>
      <Button
        className="mt-3 w-full"
        size="lg"
        variant={side === 'buy' ? 'green' : 'red'}
        disabled={!valid}
        onClick={() => {
          if (trade(id, side, Math.min(qty, max))) setQtyStr('');
        }}
      >
        {!listed ? 'Ещё не торгуется' : !open ? 'Биржа закрыта — выходной' : side === 'buy' ? `Купить ${qty > 0 ? fmtMoney(amount + fee) : ''}` : `Продать ${qty > 0 ? fmtMoney(amount - fee) : ''}`}
      </Button>
    </div>
  );
}

function Position({ id }: { id: string }) {
  const h = useGame((g) => g.s.holdings[id]);
  const s = useGame.getState().s;
  if (!h || (h.qty <= 0 && h.realized === 0 && h.dividends === 0)) return null;
  const p = Math.max(0, priceAt(id, s.day, s.live) ?? 0);
  const value = h.qty * p;
  const pnl = value - h.cost;
  const avg = h.qty > 0 ? h.cost / h.qty : 0;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="В портфеле" value={`${fmtQty(h.qty)} ${ASSET_BY_ID[id].unit}`} sub={h.qty > 0 ? `с ${fmtDate(h.since)}` : undefined} />
      <Stat label="Стоимость" value={fmtMoney(value)} sub={h.qty > 0 ? `средняя ${fmtPrice(avg)}` : undefined} />
      <Stat
        label="P/L"
        value={<span className={pnl >= 0 ? 'text-up' : 'text-down'}>{h.qty > 0 ? `${pnl >= 0 ? '+' : ''}${fmtMoney(pnl)}` : '—'}</span>}
        sub={h.qty > 0 && h.cost > 0 ? <span className={pnl >= 0 ? 'text-up' : 'text-down'}>{fmtPct(pnl / h.cost, 1)}</span> : undefined}
      />
      <Stat label="Зафикс. / дивиденды" value={<span className={h.realized >= 0 ? 'text-up' : 'text-down'}>{fmtMoney(h.realized)}</span>} sub={h.dividends > 0 ? `+${fmtMoney(h.dividends)} дивидендов` : undefined} />
    </div>
  );
}

function Info({ id }: { id: string }) {
  const s = useGame.getState().s;
  const a = ASSET_BY_ID[id];
  const k = Math.floor(s.day);
  const earn = nextEarnings(id, k);
  const div = nextDividend(id, k);
  const dy = dividendYield(id, s.day);
  const splits = splitsOf(id).filter(([d]) => d <= k);
  const info = seriesInfo(id);
  const src = info?.src.filter(([d]) => dayNum(d) <= k).at(-1) ?? info?.src[0];
  const trades = (s.trades[id] ?? []).slice(-5).reverse();
  return (
    <div className="mt-4 space-y-3 text-sm">
      <div className="text-ink-dim">{a.ghost && a.preGhost && k < dayNum(a.ghost) ? a.preGhost : a.desc}</div>
      <div className="flex flex-wrap gap-1.5">
        {a.sector && <Badge>{a.sector}</Badge>}
        {a.founded && <Badge>осн. {a.founded}</Badge>}
        {a.hq && <Badge>{a.hq}</Badge>}
        {earn != null && a.kind === 'stock' && (
          <Badge tone={earn - k <= 10 ? 'gold' : 'dim'}>
            📅 отчёт {earn === k ? 'сегодня' : `через ${earn - k} дн.`} ({fmtDate(earn)})
          </Badge>
        )}
        {dy > 0 && <Badge tone="up">дивдоходность {(dy * 100).toFixed(2)}%</Badge>}
        {div && CORPORATE.dividends[id] && div[0] - k <= 120 && <Badge tone="up">дивиденд ${div[1].toFixed(3)} · {fmtDate(div[0])}</Badge>}
      </div>
      {splits.length > 0 && (
        <div className="text-xs text-ink-dim">
          ✂️ Сплиты: {splits.map(([d, r]) => `${fmtDate(d)} — ${r}:1`).join(' · ')}
        </div>
      )}
      <Fundamentals id={id} />
      {trades.length > 0 && (
        <div>
          <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-dim">Мои сделки</div>
          {trades.map((t) => (
            <div key={t.id} className="flex justify-between py-0.5 text-xs">
              <span className={t.side === 'buy' ? 'text-up' : 'text-down'}>
                {t.side === 'buy' ? 'Покупка' : 'Продажа'} {fmtQty(t.qty)} по {fmtPrice(t.price)}
              </span>
              <span className="text-ink-mute">
                {fmtDate(t.day)}
                {t.pnl != null && <span className={cx('ml-2 num', t.pnl >= 0 ? 'text-up' : 'text-down')}>{fmtPct(t.pnlPct ?? 0, 0)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {src && (
        <div className="text-[11px] text-ink-mute">
          Данные: {src[1] === 'real' ? 'реальные дневные цены' : 'исторические опорные точки + модель'} — {src[2]}
          {info && k > info.last && ' · после конца данных — симуляция'}
        </div>
      )}
    </div>
  );
}

export function AssetModal() {
  const modal = useUi((u) => u.modal);
  const close = useUi((u) => u.close);
  const [range, setRange] = useState(365);
  useClock(500);
  const id = modal?.type === 'asset' ? modal.id : null;
  const s = useGame.getState().s;
  const a = id ? ASSET_BY_ID[id] : null;
  const headline = useMemo(() => {
    if (!id) return null;
    const p = priceAt(id, s.day, s.live);
    return { p, d1: changeOver(id, s.day, 1, s.live), dr: range ? changeOver(id, s.day, range, s.live) : (() => {
      const f = firstDay(id);
      const c = f != null ? closeOn(id, f) : null;
      return p != null && c ? p / c - 1 : null;
    })() };
  }, [id, s.day, s.live, range]);
  return (
    <Modal open={!!a} onClose={close} wide>
      {a && id && headline && (
        <div>
          <div className="flex items-start gap-3">
            <TickerLogo id={id} color={a.color} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-lg font-extrabold">{id === 'EURUSD' ? 'EUR/USD' : id}</div>
                {a.ghost && <Badge tone="down">👻 призрак</Badge>}
              </div>
              <div className="truncate text-sm text-ink-dim">{a.name}</div>
            </div>
            <div className="text-right">
              <div className="num text-xl font-extrabold">{headline.p != null ? fmtPrice(headline.p) : '—'}</div>
              <div className="flex justify-end gap-2 text-xs">
                <Change value={headline.d1} />
                <span className="text-ink-mute">день</span>
              </div>
            </div>
            <button onClick={close} className="press -mr-2 -mt-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-dim hover:bg-white/[0.06]" aria-label="Закрыть">
              ✕
            </button>
          </div>
          {listedOn(id, s.day) ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-2">
                <Segmented size="sm" className="flex-1" value={range} onChange={setRange} options={RANGES} />
                <div className="w-20 text-right text-xs">
                  <Change value={headline.dr} />
                </div>
              </div>
              <div className="mt-2 rounded-2xl bg-white/[0.02] p-1">
                <CandleChart id={id} rangeDays={range} />
              </div>
              <InsiderHint id={id} />
              <Position id={id} />
              <TradePanel id={id} />
            </>
          ) : (
            <div className="mt-6 rounded-2xl bg-white/[0.03] p-6 text-center text-sm text-ink-dim">
              {a.kind === 'crypto' ? 'Этого актива ещё не существует. Подожди — история всё расставит по местам.' : 'Компания ещё не вышла на биржу.'}
            </div>
          )}
          <Info id={id} />
        </div>
      )}
    </Modal>
  );
}
