import { useState } from 'react';
import { LIFESTYLE, LIFESTYLE_CATEGORIES } from '../../engine/config';
import { fmtMoney } from '../../engine/format';
import { forbesFor, forbesPlace, rankFor } from '../../engine/networth';
import { RANKS } from '../../engine/config';
import { yearOf } from '../../engine/time';
import { useGame } from '../../store/game';
import { Badge, Button, Card, Progress, Segmented, cx } from '../ui';

function bonusText(b: { income?: number; click?: number; crit?: number; discount?: number; offline?: number }) {
  const out: string[] = [];
  if (b.income) out.push(`+${Math.round(b.income * 100)}% к прибыли`);
  if (b.click) out.push(`+${Math.round(b.click * 100)}% к клику`);
  if (b.crit) out.push(`+${(b.crit * 100).toFixed(1)}% шанс крита`);
  if (b.discount) out.push(`−${Math.round(b.discount * 100)}% к цене точек`);
  if (b.offline) out.push(`+${b.offline} ч офлайна`);
  return out.join(' · ');
}

export function RankCard() {
  const nw = useGame((g) => g.rt.netWorth);
  const day = useGame((g) => g.s.day);
  const r = rankFor(nw, day);
  const rank = RANKS.find((x) => x.id === r.rank.id)!;
  const next = r.next ? RANKS.find((x) => x.id === r.next!.id) : null;
  const f = forbesFor(day);
  const place = forbesPlace(nw, day);
  const prog = r.nextMin ? Math.max(0, Math.min(1, Math.log10(Math.max(1, nw) / Math.max(1, r.min)) / Math.log10(r.nextMin / Math.max(1, r.min)))) : 1;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft text-3xl ring-gold">{rank.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Звание</div>
          <div className="text-gradient-gold text-xl font-extrabold">{rank.name}</div>
          <div className="num text-sm text-ink-dim">Капитал {fmtMoney(nw)}</div>
        </div>
      </div>
      {next && r.nextMin && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-ink-dim">
            <span>
              Дальше: {next.emoji} {next.name}
            </span>
            <span className="num">{fmtMoney(r.nextMin)}</span>
          </div>
          <Progress value={prog} />
        </div>
      )}
      <div className="mt-4 rounded-xl bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase tracking-wider text-ink-dim">Forbes {f.year}</div>
          {place.place ? <Badge tone="gold">{place.place === 100 ? 'ты в топ-100' : `ты №${place.place}`}</Badge> : <Badge>№100 — ${f.threshold100} млрд</Badge>}
        </div>
        <div className="space-y-1">
          {f.top.slice(0, 5).map(([name, b], i) => (
            <div key={name} className={cx('flex justify-between text-xs', nw >= b * 1e9 ? 'text-ink-mute line-through' : 'text-ink-dim')}>
              <span>
                {i + 1}. {name}
              </span>
              <span className="num">${b} млрд</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-ink-mute">Снимок списка самых богатых людей мира {f.year} года{yearOf(day) > f.year ? ` (актуален для ${yearOf(day)})` : ''}. Состояния приблизительные.</div>
      </div>
    </Card>
  );
}

export default function LifeScreen() {
  const s = useGame((g) => g.s);
  const buy = useGame((g) => g.buyLifestyle);
  const [cat, setCat] = useState('cars');
  const items = LIFESTYLE.filter((i) => i.cat === cat);
  return (
    <div className="lg:grid lg:grid-cols-[1fr_1.3fr] lg:gap-4">
      <div>
        <RankCard />
        <Card className="mt-3 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-wider text-ink-dim">Коллекция карточек</div>
            <span className="num text-xs text-ink-dim">
              {s.collection.length}/{LIFESTYLE.length}
            </span>
          </div>
          <Progress className="mt-2" value={s.collection.length / LIFESTYLE.length} />
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {LIFESTYLE.map((i) => (
              <div
                key={i.id}
                title={i.name}
                className={cx('flex aspect-square items-center justify-center rounded-xl text-xl', s.collection.includes(i.id) ? 'bg-gold-soft' : 'bg-white/[0.03] opacity-30 grayscale')}
              >
                {i.emoji}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ink-mute">Карточки остаются навсегда, даже после IPO. Бонусы действуют, пока вещь у тебя в этой жизни.</div>
        </Card>
      </div>
      <div className="mt-3 lg:mt-0">
        <Segmented scroll size="sm" value={cat} onChange={setCat} options={LIFESTYLE_CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((i) => {
            const owned = s.lifestyle.includes(i.id);
            const can = !owned && s.cash >= i.price;
            return (
              <Card key={i.id} className={cx('flex flex-col p-4', owned && 'ring-gold')} highlight={can}>
                <div className="flex items-start gap-3">
                  <div className={cx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl', owned ? 'bg-gold-soft' : 'bg-white/[0.04]')}>{i.emoji}</div>
                  <div className="min-w-0">
                    <div className="font-bold leading-tight">{i.name}</div>
                    <div className="num mt-0.5 text-sm text-gold">{fmtMoney(i.price)}</div>
                    <div className="mt-1 text-[11px] font-semibold text-up">{bonusText(i.bonus)}</div>
                  </div>
                </div>
                <div className="mt-2 flex-1 text-xs text-ink-dim">{i.desc}</div>
                <Button className="mt-3 w-full" variant={owned ? 'ghost' : can ? 'gold' : 'dark'} disabled={!can} onClick={() => buy(i.id)}>
                  {owned ? '✓ Твоё' : `Купить ${fmtMoney(i.price)}`}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
