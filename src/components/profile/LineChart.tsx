import { useEffect, useRef } from 'react';
import { ColorType, PriceScaleMode, createChart, type UTCTimestamp } from 'lightweight-charts';
import { fmtMoney } from '../../engine/format';

export interface LineSeries {
  name: string;
  color: string;
  points: [number, number][]; // [игровой день, значение]
  area?: boolean;
}

/** Линейный график (lightweight-charts) для статистики: капитал, портфель vs S&P 500 */
export function LineChart({ series, height = 220, log = false, percent = false }: { series: LineSeries[]; height?: number; log?: boolean; percent?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7d8899', fontFamily: 'Inter, system-ui', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.03)' } },
      rightPriceScale: { borderVisible: false, mode: log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal },
      timeScale: { borderVisible: false },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (p: number) => (percent ? `${p.toFixed(1)}%` : fmtMoney(p)) },
    });
    for (const s of series) {
      const opts = {
        lineWidth: 2 as const,
        priceFormat: percent ? { type: 'percent' as const } : { type: 'price' as const, precision: 0, minMove: 1 },
      };
      const ser = s.area
        ? chart.addAreaSeries({ ...opts, lineColor: s.color, topColor: s.color + '55', bottomColor: s.color + '00' })
        : chart.addLineSeries({ ...opts, color: s.color });
      const seen = new Set<number>();
      const data = s.points
        .filter(([, v]) => Number.isFinite(v) && (!log || v > 0))
        .map(([d, v]) => ({ time: (Math.floor(d) * 86400) as UTCTimestamp, value: v }))
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
        .sort((a, b) => a.time - b.time);
      ser.setData(data);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, log, percent]);
  return <div ref={el} style={{ height }} className="w-full" />;
}
