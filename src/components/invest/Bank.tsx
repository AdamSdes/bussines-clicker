import { useState } from 'react';
import { RATES } from '../../engine/config';
import { bondValue, bondYield, depositRate, depositValue, loanLimit, loanRate } from '../../engine/finance';
import { fedRate } from '../../engine/market';
import { fmtMoney, fmtPct } from '../../engine/format';
import { dayNum, fmtDate } from '../../engine/time';
import { useClock } from '../../hooks/useClock';
import { useGame } from '../../store/game';
import { Badge, Button, NumberInput, Stat, cx } from '../ui';

function AmountPicker({ max, onSubmit, label, variant = 'gold' }: { max: number; onSubmit: (v: number) => void; label: string; variant?: 'gold' | 'green' | 'red' }) {
  const [v, setV] = useState('');
  const n = Number(v) || 0;
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <NumberInput value={v} onChange={setV} placeholder="Сумма, $" />
        <Button
          variant={n > 0 && n <= max * 1.000001 ? variant : 'dark'}
          disabled={!(n > 0 && n <= max * 1.000001)}
          onClick={() => {
            onSubmit(Math.min(n, max));
            setV('');
          }}
        >
          {label}
        </Button>
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {[0.1, 0.25, 0.5, 1].map((p) => (
          <button key={p} onClick={() => setV(max > 0 ? String(Math.floor(max * p * 100) / 100) : '')} className="press h-8 rounded-lg bg-white/[0.05] text-[11px] font-semibold text-ink-dim">
            {p === 1 ? 'MAX' : `${p * 100}%`}
          </button>
        ))}
      </div>
    </div>
  );
}

function lastFedChange(day: number): number {
  let d0 = dayNum(RATES.fed[0][0] as string);
  for (const [d] of RATES.fed) {
    const n = dayNum(d as string);
    if (n <= day) d0 = n;
  }
  return d0;
}

export default function BankPanel() {
  useClock(800);
  const s = useGame.getState().s;
  const mods = useGame.getState().rt.mods;
  const g = useGame.getState();
  const day = s.day;
  const fed = fedRate(day);
  const flexRate = depositRate('flex', day, mods);
  const termRate = depositRate('term', day, mods);
  const limit = loanLimit(s);
  const lr = loanRate(day, mods);
  const [bondKind, setBondKind] = useState('tbill');
  const fedHist = RATES.fed.filter(([d]) => dayNum(d as string) <= day).slice(-14);
  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-3">
      <div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Ставка ФРС</div>
              <div className="num text-3xl font-extrabold text-gold">{(fed * 100).toFixed(2)}%</div>
              <div className="text-xs text-ink-dim">с {fmtDate(lastFedChange(day))} · верхняя граница</div>
            </div>
            <div className="flex h-12 items-end gap-0.5">
              {fedHist.map(([d, r]) => (
                <div key={d as string} title={`${d}: ${r}%`} className="w-2 rounded-t bg-gold/60" style={{ height: `${Math.max(3, ((r as number) / 6.5) * 48)}px` }} />
              ))}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-ink-mute">Все ставки банка следуют за реальной историей решений FOMC: ноль в 2009–2015, рост 2017–2018, ноль в COVID, 5,5% в 2023.</div>
        </div>

        <div className="glass mt-3 rounded-2xl p-4">
          <div className="text-[13px] font-bold uppercase tracking-wider text-ink-dim">💳 Вклады</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Накопительный" value={`${(flexRate * 100).toFixed(2)}%`} sub="плавающая ставка" />
            <Stat label="Срочный, 1 год" value={`${(termRate * 100).toFixed(2)}%`} sub="фиксируется сейчас" />
          </div>
          <div className="mt-3 text-xs font-semibold text-ink-dim">Положить на накопительный</div>
          <AmountPicker max={s.cash} label="Внести" onSubmit={(v) => g.openDeposit('flex', v)} />
          <div className="mt-3 text-xs font-semibold text-ink-dim">Открыть срочный вклад</div>
          <AmountPicker max={s.cash} label="Открыть" onSubmit={(v) => g.openDeposit('term', v)} />
          {s.deposits.length > 0 && (
            <div className="mt-3 space-y-2">
              {s.deposits.map((d) => (
                <div key={d.uid} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {d.kind === 'flex' ? 'Накопительный' : 'Срочный'} · {(d.rate * 100).toFixed(2)}%
                    </div>
                    <div className="text-[11px] text-ink-dim">
                      проценты {fmtMoney(d.interest)}
                      {d.endDay != null && ` · до ${fmtDate(d.endDay)}`}
                    </div>
                  </div>
                  <div className="num text-sm font-bold">{fmtMoney(depositValue(d))}</div>
                  <Button size="sm" variant="ghost" onClick={() => g.closeDeposit(d.uid)} title={d.kind === 'term' ? 'Досрочно: проценты сгорят' : 'Снять всё'}>
                    Снять
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="glass mt-3 rounded-2xl p-4 lg:mt-0">
          <div className="text-[13px] font-bold uppercase tracking-wider text-ink-dim">📜 Гособлигации США</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {RATES.bonds.map((b) => (
              <button
                key={b.id}
                onClick={() => setBondKind(b.id)}
                className={cx('press rounded-xl px-2 py-2 text-left', bondKind === b.id ? 'bg-gold-soft ring-gold' : 'bg-white/[0.04]')}
              >
                <div className="text-[11px] text-ink-dim">{b.tenor}</div>
                <div className="num text-sm font-bold">{(bondYield(b.id, day) * 100).toFixed(2)}%</div>
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-ink-dim">{RATES.bonds.find((b) => b.id === bondKind)?.desc}</div>
          <AmountPicker max={s.cash} label="Купить" onSubmit={(v) => g.buyBond(bondKind, v)} />
          {s.bonds.length > 0 && (
            <div className="mt-3 space-y-2">
              {s.bonds.map((b) => {
                const v = bondValue(b, day);
                const info = RATES.bonds.find((x) => x.id === b.kind);
                return (
                  <div key={b.uid} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {info?.tenor} · купон {(b.coupon * 100).toFixed(2)}%
                      </div>
                      <div className="text-[11px] text-ink-dim">
                        погашение {fmtDate(b.maturityDay)} · купоны {fmtMoney(b.coupons)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm font-bold">{fmtMoney(v)}</div>
                      <div className={cx('num text-[11px]', v >= b.face ? 'text-up' : 'text-down')}>{fmtPct(v / b.face - 1, 1)}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => g.sellBond(b.uid)}>
                      Продать
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-2 text-[11px] text-ink-mute">Когда ставки растут, рыночная цена старых облигаций падает (дюрация). Держи до погашения — получишь номинал.</div>
        </div>

        <div className="glass mt-3 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold uppercase tracking-wider text-ink-dim">⚖️ Кредит под залог</div>
            <Badge tone="gold">{(lr * 100).toFixed(2)}% годовых</Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Долг" value={<span className={s.loan > 0 ? 'text-down' : ''}>{fmtMoney(s.loan)}</span>} />
            <Stat label="Лимит" value={fmtMoney(limit)} sub="50% бизнеса + 60% недвижимости" />
          </div>
          <div className="mt-3 text-xs font-semibold text-ink-dim">Взять</div>
          <AmountPicker max={Math.max(0, limit - s.loan)} label="Взять" variant="green" onSubmit={(v) => g.borrow(v)} />
          {s.loan > 0 && (
            <>
              <div className="mt-3 text-xs font-semibold text-ink-dim">Погасить</div>
              <AmountPicker max={Math.min(s.cash, s.loan)} label="Погасить" variant="red" onSubmit={(v) => g.repay(v)} />
            </>
          )}
          <div className="mt-2 text-[11px] text-ink-mute">{RATES.loan.desc} Если долг превысит лимит на 10%, банк спишет наличные (маржин-колл).</div>
        </div>
      </div>
    </div>
  );
}
