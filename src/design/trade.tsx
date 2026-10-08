import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { Photo, cx } from './primitives';

/* ---------- Объект клика ---------- */

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
}

/**
 * Реальный предмет текущей профессии. Нажатие — scale 0.97 и тихий щелчок,
 * заработок всплывает маленьким моноширинным числом и исчезает за 600 мс.
 */
export function ClickObject({ photo, alt, onPress, caption }: { photo: string; alt: string; onPress: () => string | null; caption?: ReactNode }) {
  const [floats, setFloats] = useState<Floater[]>([]);
  const seq = useRef(0);
  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    const text = onPress();
    if (!text) return;
    const r = e.currentTarget.getBoundingClientRect();
    const id = ++seq.current;
    const x = e.clientX ? e.clientX - r.left : r.width / 2;
    const y = e.clientY ? e.clientY - r.top : r.height / 2;
    setFloats((f) => [...f.slice(-12), { id, x, y, text }]);
    window.setTimeout(() => setFloats((f) => f.filter((v) => v.id !== id)), 620);
  };
  return (
    <figure className="np-clicker">
      <button className="np-clicker__hit" onPointerDown={press} aria-label={`Работать: ${alt}`}>
        <Photo k={photo} alt={alt} cutout className="np-clicker__photo" eager />
        {floats.map((f) => (
          <span key={f.id} className="np-float" style={{ left: f.x, top: f.y - 10 }}>
            {f.text}
          </span>
        ))}
      </button>
      {caption && <figcaption className="np-clicker__caption">{caption}</figcaption>}
    </figure>
  );
}

/* ---------- График цены ---------- */

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function cssVar(el: HTMLElement, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Свечной график в цветах газеты: бумага, чернила, линии 1px. edition — чтобы перекрасить при смене выпуска. */
export function PriceChart({ data, height = 280, edition, precision = 2 }: { data: ChartCandle[]; height?: number; edition?: string; precision?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!el.current) return;
    // ссылка на TradingView (требование лицензии) — в подвале и на экране «Авторы», а не значком на графике
    const c = createChart(el.current, { autoSize: true, handleScale: { axisPressedMouseMove: false }, layout: { attributionLogo: false } });
    chart.current = c;
    series.current = c.addCandlestickSeries({ borderVisible: false });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    const s = series.current;
    const node = el.current;
    if (!c || !s || !node) return;
    const ink = cssVar(node, '--ink');
    const ink2 = cssVar(node, '--ink-2');
    const ink3 = cssVar(node, '--ink-3');
    const rule = cssVar(node, '--rule');
    const gain = cssVar(node, '--gain');
    const loss = cssVar(node, '--loss');
    const paper = cssVar(node, '--paper');
    c.applyOptions({
      layout: { background: { type: ColorType.Solid, color: paper }, textColor: ink2, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: rule, style: LineStyle.Solid } },
      rightPriceScale: { borderColor: ink, borderVisible: true },
      timeScale: { borderColor: ink, borderVisible: true, rightOffset: 2 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: ink3, style: LineStyle.Dashed, width: 1, labelBackgroundColor: ink },
        horzLine: { color: ink3, style: LineStyle.Dashed, width: 1, labelBackgroundColor: ink },
      },
    });
    s.applyOptions({
      upColor: gain,
      downColor: loss,
      wickUpColor: gain,
      wickDownColor: loss,
      priceLineColor: ink3,
      priceFormat: { type: 'price', precision, minMove: Math.pow(10, -precision) },
    });
  }, [edition, precision]);

  useEffect(() => {
    series.current?.setData(data.map((d) => ({ ...d, time: d.time as UTCTimestamp })));
    chart.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={el} className="np-chart" style={{ height }} />;
}

/* ---------- Заявка «Купить / Продать» ---------- */

export function OrderTicket({
  ticker,
  price,
  cash,
  held,
  fmt,
  onSubmit,
}: {
  ticker: string;
  price: number;
  cash: number;
  held: number;
  fmt: (v: number) => string;
  onSubmit?: (side: 'buy' | 'sell', qty: number) => void;
}) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('1000');
  const usd = Math.max(0, Number(amount.replace(/[^\d.]/g, '')) || 0);
  const qty = price > 0 ? usd / price : 0;
  const max = side === 'buy' ? cash : held * price;
  const ok = usd > 0 && usd <= max + 1e-9;
  const presets = [0.1, 0.25, 0.5, 1];
  return (
    <div className="np-ticket">
      <div className="np-ticket__side" role="group" aria-label="Сторона сделки">
        <button data-side="buy" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
          Купить
        </button>
        <button data-side="sell" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
          Продать
        </button>
      </div>
      <div className="np-ticket__body">
        <label className="np-label" htmlFor={`amt-${ticker}`}>
          Сумма, USD
        </label>
        <input id={`amt-${ticker}`} className="np-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="np-ticket__presets">
          {presets.map((p) => (
            <button key={p} className="np-btn np-btn--sm" onClick={() => setAmount(String(Math.floor(max * p * 100) / 100))} disabled={max <= 0}>
              {p === 1 ? 'Всё' : `${p * 100}%`}
            </button>
          ))}
        </div>
        <div className="np-kv">
          <span>Количество</span>
          <span>
            {qty.toLocaleString('ru-RU', { maximumFractionDigits: qty < 1 ? 6 : 2 })} {ticker}
          </span>
        </div>
        <div className="np-kv">
          <span>{side === 'buy' ? 'Доступно' : 'Можно продать'}</span>
          <span>{fmt(max)}</span>
        </div>
        <button
          className={cx('np-btn np-btn--block', side === 'buy' ? 'np-btn--buy' : 'np-btn--sell')}
          disabled={!ok}
          onClick={() => onSubmit?.(side, qty)}
          style={{ marginTop: 10 }}
        >
          {side === 'buy' ? 'Купить' : 'Продать'} {ticker} на {fmt(usd)}
        </button>
      </div>
    </div>
  );
}
