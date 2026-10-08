import { MINING, RIGS } from '../../engine/config';
import { miningPerDay, playerHashrate, rigAvailable, rigPrice } from '../../engine/finance';
import { blockReward, btcHashrate, btcIssuance, priceAt } from '../../engine/market';
import { fmtMoney, fmtNum } from '../../engine/format';
import { dayNum, fmtDate, fmtGameSpan } from '../../engine/time';
import { useClock } from '../../hooks/useClock';
import { useGame } from '../../store/game';
import { Badge, Button, Stat } from '../ui';

export function fmtHash(th: number): string {
  if (th <= 0) return '0 H/s';
  if (th < 1e-3) return `${fmtNum(th * 1e6, 1)} MH/s`;
  if (th < 1) return `${fmtNum(th * 1e3, 1)} GH/s`;
  if (th < 1e3) return `${fmtNum(th, 1)} TH/s`;
  if (th < 1e6) return `${fmtNum(th / 1e3, 1)} PH/s`;
  if (th < 1e9) return `${fmtNum(th / 1e6, 1)} EH/s`;
  return `${fmtNum(th / 1e9, 2)} ZH/s`;
}

export default function MiningPanel() {
  useClock(700);
  const s = useGame.getState().s;
  const mods = useGame.getState().rt.mods;
  const buy = useGame((g) => g.buyRig);
  const sell = useGame((g) => g.sellRig);
  const day = s.day;
  const network = btcHashrate(day);
  const reward = blockReward(day);
  const m = miningPerDay(s, day, mods);
  const btcPrice = Math.max(0, priceAt('BTC', day, s.live) ?? 0);
  const nextHalving = MINING.halvings.map(([d]) => dayNum(d as string)).find((d) => d > day);
  const available = RIGS.filter((r) => rigAvailable(r.id, day));
  const upcoming = RIGS.find((r) => !rigAvailable(r.id, day));
  const genesis = day >= dayNum(MINING.genesis);
  const profit = m.btc * btcPrice - m.power;
  return (
    <div className="glass mt-3 rounded-2xl p-4 lg:mt-0">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold uppercase tracking-wider text-ink-dim">⛏️ Майнинг биткоина</div>
        <Badge tone="gold">{reward} BTC за блок</Badge>
      </div>
      {!genesis ? (
        <div className="mt-3 text-sm text-ink-dim">Биткоина ещё нет: генезис-блок Сатоши смайнит 3 января 2009.</div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Хешрейт сети" value={fmtHash(network)} sub={`эмиссия ${fmtNum(btcIssuance(day), 0)} BTC/день`} />
            <Stat label="Твоя ферма" value={fmtHash(playerHashrate(s))} sub={m.share > 0 ? `${(m.share * 100).toPrecision(3)}% сети` : 'нет оборудования'} />
            <Stat label="Добыча" value={`${fmtNum(m.btc, m.btc < 1 ? 5 : 2)} BTC/день`} sub={btcPrice ? `≈ ${fmtMoney(m.btc * btcPrice)}/день` : 'курса ещё нет'} />
            <Stat label="Электричество" value={`${fmtMoney(m.power)}/день`} sub={btcPrice ? <span className={profit >= 0 ? 'text-up' : 'text-down'}>прибыль {fmtMoney(profit)}/день</span> : `$${0.08 * mods.electricityMult}/кВт·ч`} />
          </div>
          {nextHalving && (
            <div className="mt-2 text-xs text-ink-dim">
              ✂️ Следующий халвинг: <span className="text-gold">{fmtDate(nextHalving)}</span> (через {fmtGameSpan(nextHalving - day)}) — награда упадёт вдвое.
            </div>
          )}
          <div className="mt-3 space-y-2">
            {available
              .slice()
              .reverse()
              .map((r) => {
                const price = rigPrice(r.id, day);
                const owned = s.rigs[r.id] ?? 0;
                const perDay = (r.hashrate / (network + r.hashrate)) * btcIssuance(day);
                const powerDay = (r.power / 1000) * 24 * 0.08 * mods.electricityMult;
                const dayProfit = perDay * btcPrice - powerDay;
                const best = r.id === available[available.length - 1].id;
                return (
                  <div key={r.id} className="rounded-xl bg-white/[0.03] p-3">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{r.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          {r.name} {best && <Badge tone="up">новинка</Badge>}
                        </div>
                        <div className="text-[11px] text-ink-dim">
                          {fmtHash(r.hashrate)} · {r.power} Вт · {fmtNum(perDay, perDay < 1 ? 6 : 2)} BTC/день
                          {btcPrice > 0 && <span className={dayProfit >= 0 ? 'text-up' : 'text-down'}> · {fmtMoney(dayProfit)}/день</span>}
                        </div>
                      </div>
                      {owned > 0 && <Badge tone="gold">×{owned}</Badge>}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" className="flex-1" variant={s.cash >= price ? 'gold' : 'dark'} disabled={s.cash < price} onClick={() => buy(r.id, 1)}>
                        Купить {fmtMoney(price)}
                      </Button>
                      <Button size="sm" variant={s.cash >= price * 10 ? 'ghost' : 'dark'} disabled={s.cash < price * 10} onClick={() => buy(r.id, 10)}>
                        ×10
                      </Button>
                      {owned > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => sell(r.id, 1)} title="Продать на вторичке за 70% текущей цены">
                          Продать
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          {upcoming && <div className="mt-3 text-xs text-ink-mute">🔜 Следующее поколение оборудования появится позже. Старые майнеры дешевеют ~50% в год и с ростом сложности перестают окупаться.</div>}
        </>
      )}
    </div>
  );
}
