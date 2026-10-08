import { useState } from 'react';
import { CITIES, CITY_BY_ID, PROPERTY_TYPES, PROPERTY_TYPE_BY_ID } from '../../engine/config';
import { cityAvailable, pricePerM2, propertyQuote, propertyRentPerDay, propertyValue, SELL_FEE } from '../../engine/finance';
import { fmtMoney, fmtNum, fmtPct } from '../../engine/format';
import { fmtDate } from '../../engine/time';
import { useClock } from '../../hooks/useClock';
import { useGame } from '../../store/game';
import { Badge, Button, Change, Stat, cx } from '../ui';

export default function RealEstatePanel() {
  useClock(800);
  const s = useGame.getState().s;
  const mods = useGame.getState().rt.mods;
  const buy = useGame((g) => g.buyProperty);
  const sell = useGame((g) => g.sellProperty);
  const [openCity, setOpenCity] = useState<string | null>(null);
  const day = s.day;
  let value = 0;
  let cost = 0;
  let rentMonth = 0;
  for (const p of s.properties) {
    value += propertyValue(p, day);
    cost += p.cost;
    rentMonth += propertyRentPerDay(p, day, mods) * 30.4;
  }
  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-3">
      <div>
        <div className="glass rounded-2xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Недвижимость</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <Stat label="Стоимость" value={fmtMoney(value)} />
            <Stat label="Прирост" value={<span className={value - cost >= 0 ? 'text-up' : 'text-down'}>{fmtMoney(value - cost)}</span>} />
            <Stat label="Аренда/мес" value={<span className="text-up">{fmtMoney(rentMonth)}</span>} />
          </div>
          <div className="mt-2 text-[11px] text-ink-mute">Цены за м² по историческим трендам городов. Аренда — за вычетом налога и обслуживания. Покупка +3% сборов, продажа −2%.</div>
        </div>
        {s.properties.length > 0 && (
          <div className="glass mt-3 rounded-2xl p-3">
            <div className="px-1 pb-2 text-[12px] font-bold uppercase tracking-wider text-ink-dim">Мои объекты</div>
            <div className="space-y-2">
              {s.properties.map((p) => {
                const c = CITY_BY_ID[p.city];
                const t = PROPERTY_TYPE_BY_ID[p.type];
                const v = propertyValue(p, day);
                return (
                  <div key={p.uid} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
                    <div className="text-2xl">{t.emoji}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {t.name}, {c.flag} {c.name}
                      </div>
                      <div className="text-[11px] text-ink-dim">
                        {fmtNum(p.area, 0)} м² · с {fmtDate(p.boughtDay)} · аренда {fmtMoney(p.rentEarned)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm font-bold">{fmtMoney(v)}</div>
                      <div className={cx('num text-[11px]', v >= p.cost ? 'text-up' : 'text-down')}>{fmtPct(v / p.cost - 1, 1)}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => sell(p.uid)} title={`Продать за ${fmtMoney(v * (1 - SELL_FEE))}`}>
                      Продать
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="glass mt-3 rounded-2xl p-1.5 lg:mt-0">
        <div className="px-3 pb-1 pt-2 text-[12px] font-bold uppercase tracking-wider text-ink-dim">Города</div>
        {CITIES.map((c) => {
          const avail = cityAvailable(c.id, day);
          const ppm = pricePerM2(c.id, day);
          const yoy = ppm / pricePerM2(c.id, day - 365) - 1;
          const isOpen = openCity === c.id;
          return (
            <div key={c.id} className={cx('rounded-2xl', isOpen && 'bg-white/[0.03]')}>
              <button disabled={!avail} onClick={() => setOpenCity(isOpen ? null : c.id)} className={cx('press flex w-full items-center gap-3 px-3 py-2.5 text-left', !avail && 'opacity-40')}>
                <div className="text-2xl">{c.flag}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{c.name}</div>
                  <div className="truncate text-xs text-ink-dim">
                    {c.district} · доходность {((c.yield - c.costs) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-sm font-bold">{fmtMoney(ppm, 1)}/м²</div>
                  {avail ? <Change value={yoy} className="text-xs" digits={1} /> : <span className="text-xs text-ink-mute">рынок закрыт</span>}
                </div>
              </button>
              {isOpen && (
                <div className="space-y-2 px-3 pb-3">
                  <div className="text-xs text-ink-dim">💡 {c.fact}</div>
                  {PROPERTY_TYPES.map((t) => {
                    const q = propertyQuote(c.id, t.id, day);
                    const can = s.cash >= q.total;
                    return (
                      <div key={t.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5">
                        <div className="text-xl">{t.emoji}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">
                            {t.name} <span className="text-xs font-normal text-ink-mute">{fmtNum(t.area, 0)} м²</span>
                          </div>
                          <div className="text-[11px] text-ink-dim">
                            аренда ~{fmtMoney((q.price * q.netYield * mods.rentMult) / 12)}/мес <Badge tone="up">{(q.netYield * 100).toFixed(1)}%</Badge>
                          </div>
                        </div>
                        <Button size="sm" variant={can ? 'gold' : 'dark'} disabled={!can} onClick={() => buy(c.id, t.id)}>
                          {fmtMoney(q.total)}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
