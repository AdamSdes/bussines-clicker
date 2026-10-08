import { useEffect, useState } from 'react';
import { ASSET_BY_ID, BALANCE, RANDOM_BY_ID } from '../../engine/config';
import { fmtMoney, fmtNum, fmtPct } from '../../engine/format';
import { fmtDate, fmtDuration, fmtGameSpan, localDayKey } from '../../engine/time';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { Button, Change, Modal, Stat, TickerLogo, cx } from '../ui';

export function AwayModal() {
  const modal = useUi((u) => u.modal);
  const away = useGame((g) => g.away);
  const dismiss = useGame((g) => g.dismissAway);
  const open = modal?.type === 'away' && !!away;
  return (
    <Modal open={open} onClose={dismiss} title="🌙 Пока тебя не было">
      {away && (
        <div>
          <div className="text-sm text-ink-dim">
            Прошло {fmtDuration(away.elapsedSec)}
            {away.countedSec < away.elapsedSec && <> (засчитано {fmtDuration(away.countedSec)} — лимит офлайна)</>}. Календарь: {fmtDate(away.fromDay)} → <span className="text-ink">{fmtDate(away.toDay)}</span>{' '}
            ({fmtGameSpan(away.toDay - away.fromDay)})
          </div>
          {away.becameLive && <div className="mt-2 rounded-xl bg-down-soft p-2 text-sm text-down">📡 Ты догнал реальность — включён Живой режим!</div>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Бизнесы" value={<span className="text-up">+{fmtMoney(away.bizIncome)}</span>} sub="работали менеджеры" />
            <Stat
              label="Капитал"
              value={<span className={away.nwAfter >= away.nwBefore ? 'text-up' : 'text-down'}>{fmtMoney(away.nwAfter)}</span>}
              sub={away.nwBefore > 0 ? fmtPct(away.nwAfter / away.nwBefore - 1) : undefined}
            />
            {away.totals.dividends > 0 && <Stat label="Дивиденды" value={`+${fmtMoney(away.totals.dividends)}`} />}
            {away.totals.rent > 0 && <Stat label="Аренда" value={`+${fmtMoney(away.totals.rent)}`} />}
            {away.totals.interest + away.totals.coupons > 0 && <Stat label="Проценты и купоны" value={`+${fmtMoney(away.totals.interest + away.totals.coupons)}`} />}
            {away.totals.mined > 0 && <Stat label="Намайнено" value={`${fmtNum(away.totals.mined, 4)} BTC`} sub={`электричество ${fmtMoney(away.totals.power)}`} />}
            {away.portfolioBefore > 0 && (
              <Stat label="Портфель" value={fmtMoney(away.portfolioAfter)} sub={fmtPct(away.portfolioAfter / away.portfolioBefore - 1)} />
            )}
          </div>
          {away.totals.splits.length > 0 && <div className="mt-2 text-xs text-gold">✂️ Сплиты: {away.totals.splits.join(', ')}</div>}
          {away.movers.length > 0 && away.toDay - away.fromDay >= 1 && (
            <>
              <div className="mt-4 text-[13px] font-bold uppercase tracking-wider text-ink-dim">Что случилось на рынках</div>
              <div className="mt-2 space-y-1.5">
                {away.movers.slice(0, 6).map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5 text-sm">
                    <TickerLogo id={m.id} color={ASSET_BY_ID[m.id].color} size={28} />
                    <span className="flex-1 truncate">
                      {ASSET_BY_ID[m.id].name} {m.held && <span className="text-[11px] text-gold">· в портфеле</span>}
                    </span>
                    <Change value={m.change} />
                  </div>
                ))}
              </div>
            </>
          )}
          {away.news.length > 0 && (
            <>
              <div className="mt-4 text-[13px] font-bold uppercase tracking-wider text-ink-dim">Новости ({away.news.length})</div>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                {away.news.slice(-12).reverse().map((n, i) => (
                  <div key={i} className="text-sm">
                    <span className="num mr-2 text-xs text-gold">{n.d.split('-').reverse().join('.')}</span>
                    <span className="text-ink-dim">{n.t}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <Button variant="gold" className="mt-5 w-full" size="lg" onClick={dismiss}>
            Продолжить
          </Button>
        </div>
      )}
    </Modal>
  );
}

export function DailyModal() {
  const modal = useUi((u) => u.modal);
  const close = useUi((u) => u.close);
  const daily = useGame((g) => g.s.dailyReward);
  const claim = useGame((g) => g.claimDaily);
  const income = useGame((g) => Math.max(g.rt.bizPerSec, g.rt.clickBase));
  const today = localDayKey();
  const yesterday = localDayKey(Date.now() - 86_400_000);
  const streak = daily.lastKey === yesterday ? daily.streak + 1 : daily.lastKey === today ? daily.streak : 1;
  const claimed = daily.lastKey === today;
  return (
    <Modal open={modal?.type === 'daily'} onClose={close} title="🎁 Ежедневная награда">
      <div className="text-sm text-ink-dim">Заходи каждый день — награда растёт. На 7-й день подряд — +1 репутация.</div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {BALANCE.dailyRewards.map((m, i) => {
          const dayN = i + 1;
          const cur = ((streak - 1) % 7) + 1;
          const done = dayN < cur || (claimed && dayN === cur);
          const active = dayN === cur && !claimed;
          return (
            <div key={i} className={cx('flex flex-col items-center rounded-xl py-2 text-center', active ? 'ring-gold bg-gold-soft' : done ? 'bg-up-soft' : 'bg-white/[0.04]')}>
              <div className="text-[10px] text-ink-mute">День {dayN}</div>
              <div className="text-lg">{dayN === 7 ? '👑' : done ? '✓' : '💰'}</div>
              <div className="num text-[10px] font-bold">×{m}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-center">
        <div className="text-xs text-ink-mute">Сегодня</div>
        <div className="num text-2xl font-extrabold text-gold">
          +{fmtMoney(Math.max(500 * BALANCE.dailyRewards[(streak - 1) % 7], income * 60 * BALANCE.dailyRewards[(streak - 1) % 7]))}
        </div>
      </div>
      <Button variant="gold" size="lg" className="mt-4 w-full" disabled={claimed} onClick={claim}>
        {claimed ? 'Уже получено — до завтра!' : 'Забрать'}
      </Button>
    </Modal>
  );
}

export function ChoiceModal() {
  const modal = useUi((u) => u.modal);
  const pending = useGame((g) => g.s.pendingChoice);
  const choose = useGame((g) => g.choose);
  const ev = pending ? RANDOM_BY_ID[pending.id] : null;
  const [left, setLeft] = useState(25);
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => {
      const rest = 25 - Math.floor((Date.now() - pending.createdAt) / 1000);
      setLeft(rest);
      // если игрок не выбрал — применяется первый вариант
      if (rest <= 0) choose(0);
    }, 500);
    return () => clearInterval(id);
  }, [pending, choose]);
  const open = (modal?.type === 'choice' || !!pending) && !!ev && modal?.type !== 'away';
  return (
    <Modal open={open} onClose={() => choose(0)} title={ev ? `${ev.emoji} ${ev.name}` : ''}>
      {ev && (
        <div>
          <div className="text-sm text-ink-dim">{ev.text}</div>
          <div className="mt-4 grid gap-2">
            {ev.options.map((o, i) => (
              <Button key={i} variant={i === 0 ? 'ghost' : 'gold'} size="lg" onClick={() => choose(i)}>
                {o.label}
              </Button>
            ))}
          </div>
          <div className="mt-3 text-center text-xs text-ink-mute">Автовыбор первого варианта через {Math.max(0, left)} с</div>
        </div>
      )}
    </Modal>
  );
}
