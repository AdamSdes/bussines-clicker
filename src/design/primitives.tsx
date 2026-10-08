import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { imageLabel, imageOf, imageUrl, USE_REAL_LOGOS } from './images';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/**
 * Реальная фотография объекта. Пока файл не загрузился или его нет —
 * заглушка цвета бумаги с названием (без шиммеров).
 */
export function Photo({
  k,
  alt,
  cutout,
  className,
  style,
  eager,
}: {
  k: string;
  alt?: string;
  cutout?: boolean;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
}) {
  const entry = imageOf(k);
  const [state, setState] = useState<'wait' | 'ok' | 'fail'>(entry ? 'wait' : 'fail');
  useEffect(() => setState(entry ? 'wait' : 'fail'), [entry]);
  const name = alt ?? imageLabel(k);
  return (
    <div className={cx('np-photo', (cutout ?? entry?.cutout) && 'np-photo--cutout', className)} style={style}>
      {state !== 'ok' && <span className="np-photo__placeholder">{name}</span>}
      {entry && state !== 'fail' && (
        <img
          src={imageUrl(entry)}
          alt={name}
          width={entry.w || undefined}
          height={entry.h || undefined}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setState('ok')}
          onError={() => setState('fail')}
          style={{ opacity: state === 'ok' ? 1 : 0 }}
        />
      )}
    </div>
  );
}

export type AssetKind = 'stock' | 'etf' | 'commodity' | 'fx' | 'crypto';

const FRAME_LABEL: Record<string, string> = { EURUSD: 'EUR' };

function markKey(id: string, kind: AssetKind) {
  return kind === 'crypto' ? `crypto/${id}` : kind === 'stock' ? `logo/${id}` : `asset/${id}`;
}

/** Будет ли у инструмента картинка (логотип / иконка монеты), а не тикер в рамке */
export function hasLogo(id: string, kind: AssetKind, logos = USE_REAL_LOGOS): boolean {
  return !(kind === 'stock' && !logos) && !!imageOf(markKey(id, kind));
}

/** Знак инструмента: логотип компании / монеты или моноширинный тикер в рамке */
export function AssetMark({ id, kind, ghost, logos = USE_REAL_LOGOS }: { id: string; kind: AssetKind; ghost?: boolean; logos?: boolean }) {
  const entry = hasLogo(id, kind, logos) ? imageOf(markKey(id, kind)) : undefined;
  const [failed, setFailed] = useState(false);
  if (ghost || !entry || failed) {
    return <span className={cx('np-ticker', ghost && 'np-ticker--ghost')}>{FRAME_LABEL[id] ?? id}</span>;
  }
  return (
    <span className="np-mark">
      <img className="np-logo" src={imageUrl(entry)} alt={id} onError={() => setFailed(true)} draggable={false} />
    </span>
  );
}

/** Мини-график: 1px, цвет по итогу периода */
export function Sparkline({ points, width = 56, height = 22 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * width).toFixed(1)},${(height - 1 - ((p - min) / span) * (height - 2)).toFixed(1)}`)
    .join(' ');
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="np-spark">
      <path d={d} fill="none" stroke={up ? 'var(--gain)' : 'var(--loss)'} strokeWidth="1" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Плавно меняющееся число (баланс). 220 мс, ease-out, без отскоков. */
export function AnimatedNumber({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    const from = cur.current;
    const to = value;
    if (!Number.isFinite(to) || !Number.isFinite(from) || Math.abs(to - from) <= Math.abs(to) * 1e-12) {
      cur.current = to;
      setShown(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const f = Math.min(1, (t - t0) / 220);
      const v = from + (to - from) * (1 - Math.pow(1 - f, 3));
      cur.current = v;
      setShown(v);
      if (f < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cx('np-num', className)}>{format(shown)}</span>;
}

/** Изменение в процентах: зелёный / красный, знак минус — типографский */
export function Delta({ value, digits = 2, className }: { value: number | null | undefined; digits?: number; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cx('np-num', className)} style={{ color: 'var(--ink-3)' }}>—</span>;
  const v = value * 100;
  const s = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) >= 1000 ? 0 : digits)}%`;
  return <span className={cx('np-num', v > 0 ? 'np-gain' : v < 0 ? 'np-loss' : '', className)}>{s}</span>;
}

/** Прогресс 2px */
export function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('np-bar', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/** Сводка-уведомление (вместо тостов с эмодзи) */
export function Note({ label, children, tone }: { label: string; children: ReactNode; tone?: 'gain' | 'loss' }) {
  return (
    <div className={cx('np-note', tone && `np-note--${tone}`)} role="status">
      <div className={cx('np-note__label', tone === 'gain' && 'np-gain', tone === 'loss' && 'np-loss')}>{label}</div>
      <div className="np-note__text">{children}</div>
    </div>
  );
}

/** Строка «ключ — значение» */
export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cx('np-kv', className)}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
