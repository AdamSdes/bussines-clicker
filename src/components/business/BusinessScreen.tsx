import { useMemo } from 'react';
import { BIZ_BY_ID, BUSINESSES } from '../../engine/config';
import { toNextMilestone } from '../../engine/actions';
import {
  bizCycle, bizUpgradeCost, bulkCost, expenseShares, managerCost, maxAffordable, milestoneMult, nextMilestone, ownedSet, unitCost, upgradesFor,
} from '../../engine/economy';
import { fmtMoney, fmtNum } from '../../engine/format';
import { fmtDuration } from '../../engine/time';
import type { BusinessDef } from '../../engine/types';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { Badge, Button, Card, Modal, Progress, Segmented, cx } from '../ui';

const MODES = [
  { value: 1 as const, label: 'x1' },
  { value: 10 as const, label: 'x10' },
  { value: 100 as const, label: 'x100' },
  { value: 'next' as const, label: 'До вехи' },
  { value: 'max' as const, label: 'MAX' },
];

function useBuyQuote(def: BusinessDef) {
  const mode = useUi((u) => u.buyMode);
  const level = useGame((g) => g.s.businesses[def.id]?.level ?? 0);
  const cash = useGame((g) => g.s.cash);
  const mods = useGame((g) => g.rt.mods);
  const s = useGame((g) => g.s);
  return useMemo(() => {
    if (mode === 'max') {
      const k = Math.max(1, maxAffordable(def, level, cash, mods));
      return { k, cost: bulkCost(def, level, k, mods), label: `x${k}` };
    }
    if (mode === 'next') {
      const n = toNextMilestone(s, def.id, mods);
      if (n) return { k: n.k, cost: n.cost, label: `→ ${n.target}` };
      return { k: 1, cost: unitCost(def, level, mods), label: 'x1' };
    }
    return { k: mode, cost: bulkCost(def, level, mode, mods), label: `x${mode}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, level, Math.floor(Math.log10(Math.max(1, cash)) * 20), mods, def]);
}

/** Сегментированная полоска структуры выручки: себестоимость / аренда / зарплаты / налог / прибыль */
function ExpenseBar({ c }: { c: ReturnType<typeof bizCycle> }) {
  if (c.revenue <= 0) return <div className="h-2 rounded-full bg-white/[0.06]" />;
  const parts = [
    { v: c.cogs, cls: 'bg-[#8d6e63]', name: 'Себестоимость' },
    { v: c.rent, cls: 'bg-[#7c8cff]', name: 'Аренда' },
    { v: c.salaries, cls: 'bg-[#4fc3f7]', name: 'Зарплаты' },
    { v: c.tax, cls: 'bg-[#ff4d5e]', name: 'Налог' },
    { v: Math.max(0, c.net), cls: 'bg-[#22d17b]', name: 'Прибыль' },
  ];
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]" title={parts.map((p) => `${p.name}: ${((p.v / c.revenue) * 100).toFixed(0)}%`).join(' · ')}>
      {parts.map((p) => (
        <div key={p.name} className={p.cls} style={{ width: `${(p.v / c.revenue) * 100}%` }} />
      ))}
    </div>
  );
}

function BusinessCard({ def }: { def: BusinessDef }) {
  const st = useGame((g) => g.s.businesses[def.id]);
  const cash = useGame((g) => g.s.cash);
  const mods = useGame((g) => g.rt.mods);
  const bizUpgrades = useGame((g) => g.s.bizUpgrades);
  const buy = useGame((g) => g.buyBiz);
  const run = useGame((g) => g.runBiz);
  const hire = useGame((g) => g.hire);
  const open = useUi((u) => u.open);
  const quote = useBuyQuote(def);
  const level = st?.level ?? 0;
  const owned = useMemo(() => new Set(bizUpgrades), [bizUpgrades]);
  const c = bizCycle(def, Math.max(1, level), owned, mods);
  const demand = mods.demand(def.category) * mods.bizEffect(def.id);
  const effects = mods.hist.filter((h) => h.demand?.[def.category] != null || h.costs?.[def.category] || h.costs?.['*']);
  const next = nextMilestone(level);
  const prevMs = [0, ...[25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]].filter((m) => m <= level).at(-1) ?? 0;
  const canBuy = cash >= quote.cost;
  const mCost = managerCost(def, mods);
  const running = !!st && (st.manager || st.running);
  const progress = st && running ? st.progress / def.cycleSec : 0;
  const upgradesAvail = upgradesFor(def.id).filter((u) => !owned.has(u.id) && bizUpgradeCost(u.id) <= cash).length;

  if (level === 0) {
    return (
      <Card className={cx('p-4', !canBuy && 'opacity-80')} highlight={canBuy}>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-3xl grayscale-[0.6]">{def.emoji}</div>
          <div className="min-w-0 flex-1">
            <div className="font-bold">{def.name}</div>
            <div className="line-clamp-2 text-xs text-ink-dim">{def.desc}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-ink-dim">
            Прибыль ~<span className="num font-semibold text-up">{fmtMoney(c.net / c.cycleSec)}/с</span> · цикл {fmtDuration(def.cycleSec)}
          </div>
          <Button variant={canBuy ? 'gold' : 'dark'} disabled={!canBuy} onClick={() => buy(def.id, 1)}>
            Открыть {fmtMoney(unitCost(def, 0, mods))}
          </Button>
        </div>
      </Card>
    );
  }

  const perSec = c.net / c.cycleSec;
  return (
    <Card className="p-4" highlight={canBuy && quote.k > 0}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => !running && run(def.id)}
          className={cx(
            'press relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-4xl',
            running ? 'bg-white/[0.05]' : 'bg-gold-soft ring-gold animate-pulse',
          )}
          aria-label={running ? 'Работает' : 'Запустить цикл'}
        >
          {def.emoji}
          <span className="num absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-md bg-[#0b0f16] px-1.5 text-[11px] font-bold leading-[18px] text-gold shadow-[0_0_0_1px_rgba(245,196,81,0.35)]">{level}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate font-bold">{def.name}</div>
            {milestoneMult(level) > 1 && <Badge tone="gold">×{fmtNum(milestoneMult(level), 0)}</Badge>}
          </div>
          <div className="num mt-0.5 text-sm">
            <span className={cx('font-bold', c.net >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(c.net)}</span>
            <span className="text-ink-dim"> / {fmtDuration(def.cycleSec)}</span>
            <span className="ml-2 text-xs text-ink-mute">{fmtMoney(perSec)}/с</span>
          </div>
          <div className="mt-2">
            {running ? (
              <Progress value={progress} color={st.manager ? 'green' : 'gold'} animate={def.cycleSec > 0.5} />
            ) : (
              <button onClick={() => run(def.id)} className="press -my-1 flex h-7 items-center gap-1 rounded-lg bg-gold-soft px-2 text-[11px] font-bold text-gold">
                ▶ Запустить цикл
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ExpenseBar c={c} />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-dim">
          <span>Маржа {(c.margin * 100).toFixed(0)}%</span>
          <span>· налог {(mods.taxRate * 100).toFixed(0)}%</span>
          {next && (
            <span>
              · до ×2: {next - level} ({level}/{next})
            </span>
          )}
          {effects.map((h) => (
            <Badge key={h.id} tone={(h.demand?.[def.category] ?? 1) >= 1 && !h.costs ? 'up' : 'down'}>
              {h.emoji} {h.name}
            </Badge>
          ))}
          {Math.abs(demand - 1) > 0.001 && <Badge tone={demand >= 1 ? 'up' : 'down'}>спрос ×{demand.toFixed(2)}</Badge>}
        </div>
        {next && <Progress className="mt-1.5 !h-1" value={(level - prevMs) / (next - prevMs)} color="accent" />}
      </div>

      <div className="mt-3 flex gap-2">
        <Button className="flex-1" variant={canBuy ? 'gold' : 'dark'} disabled={!canBuy} onClick={() => buy(def.id, quote.k)}>
          <span className="opacity-80">{quote.label}</span> {fmtMoney(quote.cost)}
        </Button>
        {!st.manager ? (
          <Button variant={cash >= mCost ? 'green' : 'dark'} disabled={cash < mCost} onClick={() => hire(def.id)} title={def.managerName}>
            🧑‍💼 {fmtMoney(mCost)}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => open({ type: 'biz', id: def.id })} className="relative w-11 !px-0" title="Подробнее и улучшения">
          ⚙️
          {upgradesAvail > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold" />}
        </Button>
      </div>
    </Card>
  );
}

export function BusinessDetail({ id }: { id: string }) {
  const def = BIZ_BY_ID[id];
  const st = useGame((g) => g.s.businesses[id]);
  const s = useGame((g) => g.s);
  const mods = useGame((g) => g.rt.mods);
  const buyUpgrade = useGame((g) => g.upgradeBiz);
  const owned = ownedSet(s);
  const lvl = Math.max(1, st?.level ?? 0);
  const c = bizCycle(def, lvl, owned, mods);
  const base = expenseShares(def, new Set(), { costMult: () => 1 });
  const now = expenseShares(def, owned, mods);
  const rows: [string, number, number, number][] = [
    ['Себестоимость (закупки)', c.cogs, base.cogs, now.cogs],
    ['Аренда и коммуналка', c.rent, base.rent, now.rent],
    ['Зарплаты', c.salaries, base.salaries, now.salaries],
  ];
  return (
    <div>
      <div className="text-sm text-ink-dim">{def.desc}</div>
      <div className="mt-2 rounded-xl bg-white/[0.03] p-3 text-xs text-ink-dim">💡 {def.fact}</div>
      <div className="mt-4 text-[13px] font-bold uppercase tracking-wider text-ink-dim">Экономика цикла ({lvl} точек)</div>
      <div className="mt-2 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span>Выручка</span>
          <span className="num font-semibold">{fmtMoney(c.revenue)}</span>
        </div>
        {rows.map(([name, v, b, n]) => (
          <div key={name} className="flex justify-between text-ink-dim">
            <span>
              − {name}{' '}
              <span className="text-[11px] text-ink-mute">
                {(n * 100).toFixed(1)}%{Math.abs(n - b) > 1e-6 && <span className={n < b ? 'text-up' : 'text-down'}> (было {(b * 100).toFixed(0)}%)</span>}
              </span>
            </span>
            <span className="num">{fmtMoney(v)}</span>
          </div>
        ))}
        <div className="flex justify-between text-ink-dim">
          <span>
            − Налог на прибыль <span className="text-[11px] text-ink-mute">{(mods.taxRate * 100).toFixed(1)}%</span>
          </span>
          <span className="num">{fmtMoney(c.tax)}</span>
        </div>
        <div className="flex justify-between border-t border-white/[0.06] pt-1.5 font-bold">
          <span>Чистая прибыль</span>
          <span className={cx('num', c.net >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(c.net)}</span>
        </div>
        {st && (
          <div className="flex justify-between text-xs text-ink-mute">
            <span>Вложено / заработано за жизнь</span>
            <span className="num">
              {fmtMoney(st.invested)} / {fmtMoney(st.earned)}
            </span>
          </div>
        )}
      </div>
      <div className="mt-4 text-[13px] font-bold uppercase tracking-wider text-ink-dim">Улучшения</div>
      <div className="mt-2 space-y-2">
        {upgradesFor(id).map((u) => {
          const has = owned.has(u.id);
          const cost = bizUpgradeCost(u.id);
          return (
            <div key={u.id} className={cx('flex items-center gap-3 rounded-xl bg-white/[0.03] p-3', has && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{u.name}</div>
                <div className="text-xs text-ink-dim">{u.desc}</div>
              </div>
              {has ? (
                <Badge tone="up">✓</Badge>
              ) : (
                <Button size="sm" variant={s.cash >= cost ? 'gold' : 'dark'} disabled={s.cash < cost || !st} onClick={() => buyUpgrade(u.id)}>
                  {fmtMoney(cost)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {!st?.manager && (
        <div className="mt-3 text-xs text-ink-mute">
          Менеджер {def.managerName} автоматизирует бизнес за {fmtMoney(managerCost(def, mods))}.
        </div>
      )}
    </div>
  );
}

export function BusinessScreen() {
  const mode = useUi((u) => u.buyMode);
  const setMode = useUi((u) => u.setBuyMode);
  const levels = useGame((g) => BUSINESSES.map((b) => g.s.businesses[b.id]?.level ?? 0).join(','));
  const perSec = useGame((g) => g.rt.bizPerSec);
  const potential = useGame((g) => g.rt.bizPotential);
  const hist = useGame((g) => g.rt.mods.hist);
  const modal = useUi((u) => u.modal);
  const close = useUi((u) => u.close);
  const lv = levels.split(',').map(Number);
  // показываем открытые бизнесы + два следующих закрытых
  const lastOwned = lv.reduce((acc, l, i) => (l > 0 ? i : acc), -1);
  const visible = BUSINESSES.filter((_, i) => i <= lastOwned + 2);
  return (
    <div>
      <Card className="mb-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Автоматический доход</div>
            <div className="num text-xl font-extrabold text-up">{fmtMoney(perSec)}/с</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Потенциал</div>
            <div className="num text-sm font-bold text-ink-dim">{fmtMoney(potential)}/с</div>
          </div>
        </div>
        {hist.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hist.map((h) => (
              <span key={h.id} className="rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-ink-dim" title={h.desc}>
                {h.emoji} {h.name}
              </span>
            ))}
          </div>
        )}
      </Card>
      <Segmented className="sticky top-[calc(8.2rem+var(--safe-top))] z-20 mb-3 backdrop-blur-xl" size="sm" value={mode} onChange={setMode} options={MODES} />
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((def) => (
          <BusinessCard key={def.id} def={def} />
        ))}
      </div>
      {visible.length < BUSINESSES.length && <div className="mt-4 text-center text-xs text-ink-mute">🔒 Ещё {BUSINESSES.length - visible.length} бизнесов откроются по мере роста</div>}
      <Modal open={modal?.type === 'biz'} onClose={close} title={modal?.type === 'biz' ? `${BIZ_BY_ID[modal.id].emoji} ${BIZ_BY_ID[modal.id].name}` : ''}>
        {modal?.type === 'biz' && <BusinessDetail id={modal.id} />}
      </Modal>
    </div>
  );
}
