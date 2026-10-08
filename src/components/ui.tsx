// Базовые UI-компоненты: карточки, кнопки, бейджи, сегменты, прогресс, модалки.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmtMoney } from '../engine/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, onClick, highlight }: { children: ReactNode; className?: string; onClick?: () => void; highlight?: boolean }) {
  return (
    <div onClick={onClick} className={cx('glass rounded-2xl', highlight && 'ring-gold', onClick && 'cursor-pointer press', className)}>
      {children}
    </div>
  );
}

type BtnVariant = 'gold' | 'green' | 'red' | 'ghost' | 'dark' | 'outline';

const VARIANTS: Record<BtnVariant, string> = {
  gold: 'bg-gradient-to-b from-[#ffd76e] to-[#e0a93a] text-[#1a1305] shadow-[0_6px_20px_-6px_rgba(245,196,81,0.6)] hover:brightness-105',
  green: 'bg-gradient-to-b from-[#34e08d] to-[#17b467] text-[#04150c] shadow-[0_6px_20px_-6px_rgba(34,209,123,0.55)] hover:brightness-105',
  red: 'bg-gradient-to-b from-[#ff6b79] to-[#e23a4b] text-white shadow-[0_6px_20px_-6px_rgba(255,77,94,0.55)] hover:brightness-105',
  ghost: 'bg-white/[0.04] text-ink hover:bg-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]',
  dark: 'bg-bg-raised text-ink hover:bg-[#1c2534] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]',
  outline: 'bg-transparent text-gold shadow-[0_0_0_1px_rgba(245,196,81,0.45)] hover:bg-gold-soft',
};

export function Button({
  children, onClick, variant = 'ghost', disabled, className, size = 'md', title,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: BtnVariant;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const sz = size === 'sm' ? 'h-9 px-3 text-xs rounded-xl' : size === 'lg' ? 'h-14 px-5 text-base rounded-2xl' : 'h-11 px-4 text-sm rounded-xl';
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'press inline-flex select-none items-center justify-center gap-1.5 font-semibold',
        sz,
        disabled ? 'cursor-not-allowed bg-white/[0.03] text-ink-mute shadow-[0_0_0_1px_rgba(255,255,255,0.04)]' : VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'dim', className }: { children: ReactNode; tone?: 'dim' | 'up' | 'down' | 'gold' | 'accent'; className?: string }) {
  const t = {
    dim: 'bg-white/[0.06] text-ink-dim',
    up: 'bg-up-soft text-up',
    down: 'bg-down-soft text-down',
    gold: 'bg-gold-soft text-gold',
    accent: 'bg-[rgba(124,140,255,0.15)] text-accent',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none', t, className)}>{children}</span>;
}

export function Segmented<T extends string | number>({
  value, onChange, options, className, size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; badge?: number }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cx('flex gap-1 rounded-2xl bg-white/[0.04] p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'press relative flex-1 whitespace-nowrap rounded-xl font-semibold',
            size === 'sm' ? 'h-8 px-2 text-xs' : 'h-10 px-3 text-sm',
            value === o.value ? 'bg-white/[0.1] text-ink shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]' : 'text-ink-dim hover:text-ink',
          )}
        >
          {o.label}
          {!!o.badge && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gold" />}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, className, color = 'gold', animate = true }: { value: number; className?: string; color?: 'gold' | 'green' | 'accent' | 'red'; animate?: boolean }) {
  const c = { gold: 'from-[#ffd76e] to-[#e0a93a]', green: 'from-[#34e08d] to-[#17b467]', accent: 'from-[#9aa6ff] to-[#6b7bff]', red: 'from-[#ff6b79] to-[#e23a4b]' }[color];
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-white/[0.07]', className)}>
      <div
        className={cx('h-full rounded-full bg-gradient-to-r', c, animate && 'transition-[width] duration-100 ease-linear')}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/** Плавно анимированный денежный счётчик */
export function AnimatedMoney({ value, className, digits = 2 }: { value: number; className?: string; digits?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef(value);
  useEffect(() => {
    let raf = 0;
    const from = ref.current;
    const to = value;
    if (!Number.isFinite(to) || Math.abs(to - from) < 1e-9) {
      ref.current = to;
      setShown(to);
      return;
    }
    const start = performance.now();
    const dur = 260;
    const step = (t: number) => {
      const f = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - f, 3);
      const v = from + (to - from) * e;
      ref.current = v;
      setShown(v);
      if (f < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cx('num', className)}>{fmtMoney(shown, digits)}</span>;
}

/** Логотип-заглушка: буквы тикера на цветном градиенте */
export function TickerLogo({ id, color, size = 40, ghost }: { id: string; color: string; size?: number; ghost?: boolean }) {
  const label = id === 'EURUSD' ? '€' : id === 'XAU' ? 'Au' : id === 'WTI' ? 'Oil' : id.length > 4 ? id.slice(0, 4) : id;
  const light = isLight(color);
  return (
    <div
      className={cx('relative flex shrink-0 items-center justify-center rounded-xl font-extrabold tracking-tight', ghost && 'grayscale opacity-60')}
      style={{
        width: size,
        height: size,
        fontSize: label.length > 3 ? size * 0.26 : size * 0.32,
        color: light ? '#0b0e14' : '#fff',
        background: `linear-gradient(145deg, ${color}, ${shade(color, -0.35)})`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.1) inset, 0 6px 16px -8px ${color}`,
      }}
    >
      {label}
      {ghost && <span className="absolute -right-1 -top-1 text-xs">👻</span>}
    </div>
  );
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * (1 + f))));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * (1 + f))));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * (1 + f))));
  return `rgb(${r},${g},${b})`;
}

export function Sparkline({ points, width = 72, height = 28, className }: { points: number[]; width?: number; height?: number; className?: string }) {
  if (points.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * width).toFixed(1)},${(height - ((p - min) / span) * (height - 2) - 1).toFixed(1)}`).join(' ');
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke={up ? '#22d17b' : '#ff4d5e'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Change({ value, className, digits = 2 }: { value: number | null | undefined; className?: string; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return <span className={cx('text-ink-mute', className)}>—</span>;
  const up = value >= 0;
  const v = Math.abs(value * 100);
  return (
    <span className={cx('num font-semibold', up ? 'text-up' : 'text-down', className)}>
      {up ? '▲' : '▼'} {v >= 10000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(v >= 1000 ? 0 : digits)}%
    </span>
  );
}

/** Модальное окно: снизу на телефоне (sheet), по центру на десктопе */
export function Modal({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className={cx('glass-strong relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
            {title && (
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-lg font-bold">{title}</div>
                <button onClick={onClose} className="press -mr-2 -mt-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-dim hover:bg-white/[0.06]" aria-label="Закрыть">
                  ✕
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl bg-white/[0.03] px-3 py-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-mute">{label}</div>
      <div className="num mt-0.5 truncate text-[15px] font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-dim">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-2 mt-5 flex items-center justify-between px-1', className)}>
      <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-dim">{children}</h3>
      {right}
    </div>
  );
}

export function NumberInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.e+]/gi, ''))}
      className={cx('num h-11 w-full rounded-xl bg-white/[0.05] px-3 text-sm font-semibold outline-none ring-1 ring-white/[0.06] placeholder:text-ink-mute focus:ring-gold/50', className)}
    />
  );
}
