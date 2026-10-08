import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { BALANCE } from '../../engine/config';
import { fmtMoney } from '../../engine/format';
import { rankFor } from '../../engine/networth';
import { fmtDate, fmtWeekday } from '../../engine/time';
import { RANKS } from '../../engine/config';
import { useGame } from '../../store/game';
import { AnimatedMoney, cx } from '../ui';
import { IconClock } from '../icons';

export function Header() {
  const cash = useGame((g) => g.s.cash);
  const perSec = useGame((g) => g.rt.bizPerSec + g.rt.investPerSec);
  const day = useGame((g) => g.s.day);
  const live = useGame((g) => g.s.live);
  const speed = useGame((g) => g.s.settings.speed);
  const mode = useGame((g) => g.s.mode);
  const nw = useGame((g) => g.rt.netWorth);
  const setSetting = useGame((g) => g.setSetting);
  const [open, setOpen] = useState(false);
  const sp = BALANCE.speeds.find((x) => x.id === speed) ?? BALANCE.speeds[1];
  const rank = RANKS.find((r) => r.id === rankFor(nw, day).rank.id)!;
  const dayFrac = day - Math.floor(day);

  return (
    <header className="sticky top-0 z-30 px-3 pt-[calc(0.5rem+var(--safe-top))]">
      <div className="glass-strong mx-auto max-w-5xl rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">
              <span>{rank.emoji}</span>
              <span className="truncate">{rank.name}</span>
              {mode === 'sandbox' && <span className="rounded bg-accent/20 px-1 text-accent">песочница</span>}
            </div>
            <AnimatedMoney value={cash} className="block truncate text-[26px] font-extrabold leading-tight tracking-tight sm:text-3xl" />
            <div className="num text-xs font-semibold text-up">+{fmtMoney(perSec)}/с</div>
          </div>
          <div className="relative flex flex-col items-end gap-1.5">
            <button
              onClick={() => !live && setOpen((o) => !o)}
              className="press flex min-h-10 items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-1.5 text-right shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
            >
              <div>
                <div className="num text-[13px] font-bold leading-tight">{fmtDate(day)}</div>
                <div className="text-[11px] leading-tight text-ink-dim">
                  {fmtWeekday(day)} · {live ? 'реальное время' : sp.id === 'pause' ? 'пауза' : sp.label}
                </div>
              </div>
              {live ? (
                <span className="flex items-center gap-1 rounded-md bg-down-soft px-1.5 py-0.5 text-[10px] font-bold text-down">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-down" /> LIVE
                </span>
              ) : (
                <IconClock className="h-5 w-5 text-gold" />
              )}
            </button>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full bg-gold/70" style={{ width: `${dayFrac * 100}%` }} />
            </div>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ type: 'spring', duration: 0.25, bounce: 0 }}
                  className="glass-strong absolute right-0 top-[calc(100%+6px)] z-40 w-56 rounded-2xl p-1.5"
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Скорость машины времени</div>
                  {BALANCE.speeds.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSetting('speed', s.id);
                        setOpen(false);
                      }}
                      className={cx('press flex h-10 w-full items-center justify-between rounded-xl px-3 text-sm', s.id === speed ? 'bg-gold-soft font-semibold text-gold' : 'hover:bg-white/[0.05]')}
                    >
                      <span>{s.label}</span>
                      {s.id === speed && <span>✓</span>}
                    </button>
                  ))}
                  <div className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-ink-mute">Доход бизнесов идёт в реальном времени. Скорость меняет только календарь: рынки, новости, проценты.</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
