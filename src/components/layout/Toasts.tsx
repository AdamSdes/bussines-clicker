import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useEffect } from 'react';
import { useUi, type Toast } from '../../store/ui';
import { cx } from '../ui';

const TONE: Record<Toast['kind'], string> = {
  info: 'shadow-[0_0_0_1px_rgba(255,255,255,0.08)]',
  good: 'shadow-[0_0_0_1px_rgba(34,209,123,0.35)]',
  bad: 'shadow-[0_0_0_1px_rgba(255,77,94,0.35)]',
  gold: 'shadow-[0_0_0_1px_rgba(245,196,81,0.45),0_0_30px_-10px_rgba(245,196,81,0.5)]',
  news: 'shadow-[0_0_0_1px_rgba(124,140,255,0.35)]',
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useUi((u) => u.dismiss);
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), t.ttl);
    return () => clearTimeout(id);
  }, [t.id, t.ttl, dismiss]);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
      onClick={() => dismiss(t.id)}
      className={cx('pointer-events-auto flex w-full cursor-pointer gap-3 rounded-2xl bg-[#121926]/95 px-3.5 py-3 backdrop-blur-xl', TONE[t.kind])}
    >
      {t.emoji && <div className="text-xl leading-none">{t.emoji}</div>}
      <div className="min-w-0">
        <div className={cx('text-sm font-bold leading-snug', t.kind === 'gold' && 'text-gold', t.kind === 'bad' && 'text-down', t.kind === 'good' && 'text-up')}>{t.title}</div>
        {t.text && <div className="mt-0.5 text-[12.5px] leading-snug text-ink-dim">{t.text}</div>}
      </div>
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useUi((u) => u.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(7.5rem+var(--safe-top))] z-[60] mx-auto flex max-w-md flex-col gap-2 px-3">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Конфетти на вехах, повышениях, IPO */
export function Confetti() {
  const n = useUi((u) => u.confetti);
  useEffect(() => {
    if (!n) return;
    const colors = ['#f5c451', '#ffe39a', '#22d17b', '#7c8cff', '#ffffff'];
    void confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors, scalar: 0.9, disableForReducedMotion: true });
  }, [n]);
  return null;
}
