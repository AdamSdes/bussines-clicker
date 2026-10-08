import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { BALANCE, CLICK_UPGRADES, JOBS } from '../../engine/config';
import { jobRequirements } from '../../engine/actions';
import { clickParts, totalUnits } from '../../engine/economy';
import { fmtMoney, fmtNum } from '../../engine/format';
import { sfx } from '../../audio/sfx';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { Badge, Button, Card, Progress, SectionTitle, cx } from '../ui';

interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
}
let pid = 1;

function ClickZone() {
  const click = useGame((g) => g.click);
  const combo = useGame((g) => g.rt.combo);
  const particlesOn = useGame((g) => g.s.settings.particles);
  const jobId = useGame((g) => g.s.job);
  const floaters = useUi((u) => u.floaters);
  const addFloater = useUi((u) => u.floater);
  const removeFloater = useUi((u) => u.removeFloater);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [pulse, setPulse] = useState(0);
  const zone = useRef<HTMLDivElement>(null);
  const job = JOBS.find((j) => j.id === jobId)!;

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const r = zone.current!.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const res = click();
      setPulse((p) => p + 1);
      addFloater({ x, y, text: `+${fmtMoney(res.value)}`, crit: res.crit });
      if (res.crit) sfx.crit();
      else sfx.click(res.combo);
      if (particlesOn) {
        const n = res.crit ? 14 : 6;
        const fresh: Particle[] = Array.from({ length: n }, () => {
          const a = Math.random() * Math.PI * 2;
          const d = (res.crit ? 70 : 40) + Math.random() * 40;
          return { id: pid++, x, y, dx: Math.cos(a) * d, dy: Math.sin(a) * d, color: res.crit ? '#ffd76e' : Math.random() > 0.5 ? '#f5c451' : '#22d17b' };
        });
        setParticles((ps) => [...ps.slice(-60), ...fresh]);
      }
    },
    [click, addFloater, particlesOn],
  );

  const comboFrac = (combo - 1) / (BALANCE.combo.max - 1);
  return (
    <div ref={zone} className="relative flex select-none flex-col items-center pb-2 pt-4" style={{ touchAction: 'manipulation' }}>
      <motion.button
        onPointerDown={onDown}
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
        className="relative flex h-[210px] w-[210px] items-center justify-center rounded-full outline-none sm:h-[240px] sm:w-[240px]"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #fff1b8 0%, #f5c451 32%, #c9952b 70%, #8a5f12 100%)',
          boxShadow: `0 0 0 6px rgba(245,196,81,0.12), 0 0 ${40 + comboFrac * 60}px ${comboFrac * 10}px rgba(245,196,81,${0.25 + comboFrac * 0.35}), inset 0 -10px 30px rgba(0,0,0,0.35), inset 0 8px 20px rgba(255,255,255,0.4)`,
        }}
        aria-label="Работать"
      >
        <div className="absolute inset-3 rounded-full border-2 border-[#fff3c4]/40" />
        {pulse > 0 && (
          <motion.span
            key={pulse}
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-gold"
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 1.22, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
        <div className="flex flex-col items-center">
          <span className="text-6xl drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)] sm:text-7xl">{job.emoji}</span>
          <span className="mt-1 text-[13px] font-extrabold uppercase tracking-widest text-[#3b2705]/80">Работать</span>
        </div>
      </motion.button>

      {/* частицы */}
      <div className="pointer-events-none absolute inset-0 overflow-visible">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute h-2 w-2 rounded-full"
            style={{ left: p.x - 4, top: p.y - 4, background: p.color, boxShadow: `0 0 8px ${p.color}` }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.dx, y: p.dy + 30, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            onAnimationComplete={() => setParticles((ps) => ps.filter((q) => q.id !== p.id))}
          />
        ))}
        <AnimatePresence>
          {floaters.map((f) => (
            <motion.div
              key={f.id}
              className={cx('num absolute whitespace-nowrap font-extrabold', f.crit ? 'text-2xl text-[#ffe39a]' : 'text-lg text-up')}
              style={{ left: f.x, top: f.y, translateX: '-50%', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
              initial={{ y: 0, opacity: 1, scale: f.crit ? 1.3 : 1 }}
              animate={{ y: -90, opacity: 0, scale: 1 }}
              transition={{ duration: f.crit ? 1.2 : 0.9, ease: 'easeOut' }}
              onAnimationComplete={() => removeFloater(f.id)}
            >
              {f.crit && <span className="mr-1 text-sm">КРИТ!</span>}
              {f.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* комбо */}
      <div className="mt-5 w-full max-w-[280px]">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
          <span className="text-ink-dim">Комбо</span>
          <span className={cx('num', combo >= BALANCE.combo.max ? 'text-gold' : combo > 1 ? 'text-ink' : 'text-ink-mute')}>
            {combo >= 3 ? '🔥 ' : ''}x{combo.toFixed(2)}
          </span>
        </div>
        <Progress value={comboFrac} color={combo >= BALANCE.combo.max ? 'gold' : 'green'} />
      </div>
    </div>
  );
}

function JobCard() {
  const s = useGame((g) => g.s);
  const rt = useGame((g) => g.rt);
  const promote = useGame((g) => g.promote);
  const job = JOBS.find((j) => j.id === s.job)!;
  const parts = clickParts(s, rt.mods, rt.bizPerSec);
  const req = jobRequirements(s);
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] text-2xl">{job.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Должность</div>
          <div className="truncate font-bold">{job.name}</div>
          <div className="text-xs text-ink-dim">{job.desc}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.03] px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink-mute">Ставка</div>
          <div className="num text-sm font-bold">${job.hourly}/ч</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink-mute">За клик</div>
          <div className="num text-sm font-bold text-up">{fmtMoney(parts.base)}</div>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-2 py-2">
          <div className="text-[10px] uppercase tracking-wide text-ink-mute">Крит</div>
          <div className="num text-sm font-bold text-gold">{(rt.mods.critChance * 100).toFixed(0)}% ×{rt.mods.critMult}</div>
        </div>
      </div>
      {parts.fromIncome > 0 && <div className="mt-2 text-xs text-ink-dim">Из них {fmtMoney(parts.fromIncome)} — {(parts.share * 100).toFixed(0)}% дохода бизнесов в секунду</div>}
      {req ? (
        <div className="mt-4 rounded-2xl bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">
              Повышение: {req.job.emoji} {req.job.name}
            </div>
            <Badge tone="up">${req.job.hourly}/ч</Badge>
          </div>
          <div className="mt-2 space-y-2 text-xs">
            <div>
              <div className="mb-1 flex justify-between text-ink-dim">
                <span>Опыт (клики)</span>
                <span className="num">
                  {fmtNum(Math.min(s.clicksLife, req.job.clicks), 0)} / {fmtNum(req.job.clicks, 0)}
                </span>
              </div>
              <Progress value={s.clicksLife / Math.max(1, req.job.clicks)} color={req.clicksOk ? 'green' : 'accent'} />
            </div>
            {!!req.job.needUnits && (
              <div>
                <div className="mb-1 flex justify-between text-ink-dim">
                  <span>Точек бизнеса</span>
                  <span className="num">
                    {Math.min(req.units, req.job.needUnits)} / {req.job.needUnits}
                  </span>
                </div>
                <Progress value={req.units / req.job.needUnits} color={req.unitsOk ? 'green' : 'accent'} />
              </div>
            )}
          </div>
          <Button className="mt-3 w-full" variant={req.cashOk && req.clicksOk && req.unitsOk ? 'gold' : 'dark'} disabled={!(req.cashOk && req.clicksOk && req.unitsOk)} onClick={promote}>
            {req.job.cost ? `Обучение за ${fmtMoney(req.job.cost)}` : 'Получить повышение'}
          </Button>
        </div>
      ) : (
        <div className="mt-3 text-center text-sm text-gold">👑 Вершина карьеры</div>
      )}
    </Card>
  );
}

function ClickUpgrades() {
  const owned = useGame((g) => g.s.clickUpgrades);
  const cash = useGame((g) => g.s.cash);
  const buy = useGame((g) => g.buyClick);
  const next = CLICK_UPGRADES.filter((u) => !owned.includes(u.id)).slice(0, 3);
  return (
    <>
      <SectionTitle right={<span className="text-xs text-ink-mute">{owned.length}/{CLICK_UPGRADES.length}</span>}>Улучшения для работы</SectionTitle>
      <div className="grid gap-2">
        {next.map((u, i) => {
          const can = cash >= u.cost && i === 0;
          return (
            <Card key={u.id} className={cx('flex items-center gap-3 p-3', i > 0 && 'opacity-60')} highlight={can}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-2xl">{u.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{u.name}</div>
                <div className="text-xs text-up">{u.mult ? `Клик ×${u.mult}` : `+${(u.incomeShare! * 100).toFixed(0)}% дохода/с к клику`}</div>
              </div>
              <Button size="sm" variant={can ? 'gold' : 'dark'} disabled={!can} onClick={() => buy(u.id)}>
                {fmtMoney(u.cost)}
              </Button>
            </Card>
          );
        })}
        {!next.length && <div className="text-sm text-ink-dim">Все улучшения куплены 🎉</div>}
      </div>
      {owned.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CLICK_UPGRADES.filter((u) => owned.includes(u.id)).map((u) => (
            <span key={u.id} className="rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-ink-dim" title={u.desc}>
              {u.emoji} {u.name}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Подсказки первых шагов */
function Onboarding() {
  const s = useGame((g) => g.s);
  const setTab = useUi((u) => u.setTab);
  const units = totalUnits(s);
  let tip: { text: string; action?: () => void; label?: string } | null = null;
  if (s.stats.totalClicks < 5 && s.ipos === 0) tip = { text: 'Ты начинаешь 1 января 2009 года с пустыми карманами. Жми на монету — каждый клик это час работы курьером за $12.' };
  else if (!s.clickUpgrades.includes('bike') && s.ipos === 0) tip = { text: 'Накопи $1 500 на велосипед — доставок станет вдвое больше.' };
  else if (units === 0) tip = { text: 'Цель — $5 000 на первую точку «Кофе навынос». Это начало империи!', action: () => setTab('business'), label: 'К бизнесам' };
  else if (!Object.values(s.businesses).some((b) => b.manager)) tip = { text: 'Нанимай менеджеров — бизнес будет работать сам, даже офлайн.', action: () => setTab('business'), label: 'Нанять' };
  else if (s.settings.speed === 'x1' && s.stats.playSeconds > 600 && !s.flags.speedTip) tip = { text: 'Рынки повторяют реальную историю. Ускорь машину времени в шапке, чтобы быстрее добраться до биткоина по $0,10 и IPO Tesla.' };
  if (!tip) return null;
  return (
    <Card className="mt-3 flex items-center gap-3 p-3">
      <div className="text-2xl">💡</div>
      <div className="flex-1 text-sm text-ink-dim">{tip.text}</div>
      {tip.action && (
        <Button size="sm" variant="outline" onClick={tip.action}>
          {tip.label}
        </Button>
      )}
    </Card>
  );
}

export function WorkScreen() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-start">
      <div>
        <Card className="overflow-visible px-4 pb-4">
          <ClickZone />
        </Card>
        <Onboarding />
      </div>
      <div>
        <JobCard />
        <ClickUpgrades />
      </div>
    </div>
  );
}
