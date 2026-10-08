import { useEffect, useRef } from 'react';
import { ColorType, CrosshairMode, createChart, type IChartApi, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { NEWS } from '../../engine/config';
import { candles, splitsOf } from '../../engine/market';
import { dayNum } from '../../engine/time';
import type { Candle } from '../../engine/types';
import { useGame } from '../../store/game';

/** Свечи по неделям для длинных периодов (иначе 6 000 дневных свечей сливаются) */
function aggregate(c: Candle[], days: number): Candle[] {
  if (days <= 0) return c;
  const out: Candle[] = [];
  for (const x of c) {
    const bucket = Math.floor(x.time / 86400 / days);
    const last = out[out.length - 1];
    if (last && Math.floor(last.time / 86400 / days) === bucket) {
      last.high = Math.max(last.high, x.high);
      last.low = Math.min(last.low, x.low);
      last.close = x.close;
    } else out.push({ ...x });
  }
  return out;
}

function precisionFor(price: number) {
  const a = Math.abs(price);
  if (a >= 100) return 2;
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  if (a >= 0.0001) return 6;
  return 8;
}

const toLw = (c: Candle) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });

export function CandleChart({ id, rangeDays, height = 280 }: { id: string; rangeDays: number; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7d8899', fontFamily: 'Inter, system-ui', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(255,255,255,0.035)' }, horzLines: { color: 'rgba(255,255,255,0.035)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 3 },
      crosshair: { mode: CrosshairMode.Normal },
      handleScale: { axisPressedMouseMove: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: '#22d17b',
      downColor: '#ff4d5e',
      borderVisible: false,
      wickUpColor: '#22d17b',
      wickDownColor: '#ff4d5e',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Полная перерисовка при смене актива/периода и раз в игровой день
  useEffect(() => {
    let lastDay = -1;
    let bucket = rangeDays > 1500 ? 7 : rangeDays > 400 ? 3 : 0;
    const draw = (full: boolean) => {
      const s = useGame.getState().s;
      const series = seriesRef.current;
      if (!series) return;
      const day = s.day;
      const from = rangeDays > 0 ? Math.floor(day) - rangeDays : 0;
      if (full || Math.floor(day) !== lastDay) {
        lastDay = Math.floor(day);
        const raw = candles(id, from, day, s.live);
        const data = aggregate(raw, bucket).map(toLw);
        if (data.length) {
          const p = data[data.length - 1].close;
          const prec = precisionFor(p);
          series.applyOptions({ priceFormat: { type: 'price', precision: prec, minMove: Math.pow(10, -prec) } });
        }
        series.setData(data);
        // маркеры: сплиты и крупные новости о компании (привязываем к свече, в которую попадает дата)
        const times = data.map((x) => x.time as number);
        const candleAt = (d: number): number | null => {
          const t = d * 86400;
          let lo = 0;
          let hi = times.length - 1;
          let ans = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (times[mid] <= t) {
              ans = mid;
              lo = mid + 1;
            } else hi = mid - 1;
          }
          return ans >= 0 ? times[ans] : null;
        };
        const markers: SeriesMarker<Time>[] = [];
        for (const [d, r] of splitsOf(id)) {
          const t = d <= day ? candleAt(d) : null;
          if (t != null && d * 86400 >= times[0]) markers.push({ time: t as UTCTimestamp, position: 'aboveBar', color: '#f5c451', shape: 'arrowDown', text: `сплит ${r}:1` });
        }
        for (const n of NEWS) {
          if (!n.assets?.includes(id) || !n.big) continue;
          const d = dayNum(n.d);
          const t = d <= day && d * 86400 >= times[0] ? candleAt(d) : null;
          if (t != null) markers.push({ time: t as UTCTimestamp, position: 'belowBar', color: '#7c8cff', shape: 'circle', text: '' });
        }
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        series.setMarkers(markers);
        if (full) chartRef.current?.timeScale().fitContent();
      } else {
        // обновляем текущую свечу
        const raw = candles(id, Math.floor(day) - (bucket || 1) - 1, day, s.live);
        const agg = aggregate(raw, bucket);
        const last = agg[agg.length - 1];
        if (last) series.update(toLw(last));
      }
    };
    bucket = rangeDays > 1500 ? 7 : rangeDays > 400 ? 3 : 0;
    draw(true);
    const t = setInterval(() => draw(false), 400);
    return () => clearInterval(t);
  }, [id, rangeDays]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
