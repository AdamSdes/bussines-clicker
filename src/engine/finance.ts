// Банк, облигации, кредиты, недвижимость и майнинг — чистые функции расчёта.
import { CITY_BY_ID, MINING, PROPERTY_TYPE_BY_ID, RATES, RE_TRANSACTION, RIG_BY_ID, BALANCE, RIGS } from './config';
import { btcHashrate, btcIssuance, fedRate, ust10y } from './market';
import type { Mods } from './modifiers';
import { dayNum, yearOf } from './time';
import type { Bond, Deposit, GameState, Property } from './types';

// ---------------------------------------------------------------------------
// Банк: ставки привязаны к реальной истории ставки ФРС
// ---------------------------------------------------------------------------
type DepositKind = 'flex' | 'term';

/** Ставка вклада = ставка ФРС + спред продукта (+ бонус навыка), не ниже минимума */
export function depositRate(kind: DepositKind, day: number, mods: Pick<Mods, 'depositBonus'>): number {
  const p = RATES.deposits.find((d) => d.id === kind)!;
  return Math.max(p.min / 100, fedRate(day) + p.spread / 100 + mods.depositBonus);
}

/** Доходность облигации по сроку: 3М ≈ ставка ФРС, 10Y — реальные данные, 2Y — между ними */
export function bondYield(kind: string, day: number): number {
  const fed = fedRate(day);
  const y10 = ust10y(day);
  if (kind === 'tbill') return Math.max(0.0003, fed - 0.0012);
  if (kind === 'ust2') return Math.max(0.001, fed * 0.55 + y10 * 0.45);
  return y10;
}

export function bondYears(kind: string): number {
  return RATES.bonds.find((b) => b.id === kind)?.years ?? 1;
}

/**
 * Рыночная стоимость облигации (приближение через дюрацию):
 *   цена ≈ номинал · (1 − D · (y_рынка − купон)),  D = (1 − (1+y)^−n) / y
 * Поэтому в 2022 году, когда ставки выросли с 1,5% до 4%, 10-летние облигации подешевели на ~15–20%.
 */
export function bondValue(b: Bond, day: number): number {
  const remainingYears = Math.max(0, (b.maturityDay - day) / 365.25);
  if (remainingYears <= 0) return b.face;
  const y = bondYield(b.kind, day);
  const dur = y > 0.0001 ? (1 - Math.pow(1 + y, -remainingYears)) / y : remainingYears;
  return b.face * Math.max(0.4, 1 - dur * (y - b.coupon));
}

export function depositValue(d: Deposit): number {
  return d.amount + (d.kind === 'term' ? d.interest : 0);
}

/** Ставка кредита = ставка ФРС + 3 п.п. (минус бонус навыка «Связи в банке») */
export function loanRate(day: number, mods: Pick<Mods, 'loanDiscount'>): number {
  return Math.max(0.01, fedRate(day) + RATES.loan.spread / 100 - mods.loanDiscount);
}

export function bizBookValue(s: GameState): number {
  let v = 0;
  for (const b of Object.values(s.businesses)) v += b.invested;
  return v;
}

/** Лимит кредита: 50% вложений в бизнес + 60% стоимости недвижимости */
export function loanLimit(s: GameState): number {
  return bizBookValue(s) * RATES.loan.ltvBusiness + propertiesValue(s) * RATES.loan.ltvProperty;
}

// ---------------------------------------------------------------------------
// Недвижимость: цена м² интерполируется по годам (по историческим трендам)
// ---------------------------------------------------------------------------
const cityCurves = new Map<string, [number, number][]>();
function curve(cityId: string): [number, number][] {
  let c = cityCurves.get(cityId);
  if (!c) {
    const city = CITY_BY_ID[cityId];
    c = Object.entries(city.price)
      .map(([y, v]) => [dayNum(`${y}-07-01`), v] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    cityCurves.set(cityId, c);
  }
  return c;
}

/** Цена м² (USD) в городе на дату — гладкая лог-интерполяция между годами + рост 3%/год после последней точки */
export function pricePerM2(cityId: string, day: number): number {
  const c = curve(cityId);
  if (day <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (day <= c[i][0]) {
      const [d0, v0] = c[i - 1];
      const [d1, v1] = c[i];
      const f = (day - d0) / (d1 - d0);
      const sm = f * f * (3 - 2 * f);
      return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * sm);
    }
  }
  const [dl, vl] = c[c.length - 1];
  return vl * Math.pow(1.03, (day - dl) / 365.25);
}

/** Город доступен для покупки с первой точки данных (Дубай — с 2003, когда открыли freehold) */
export function cityAvailable(cityId: string, day: number): boolean {
  const first = Math.min(...Object.keys(CITY_BY_ID[cityId].price).map(Number));
  return yearOf(day) >= first;
}

export function propertyQuote(cityId: string, typeId: string, day: number) {
  const t = PROPERTY_TYPE_BY_ID[typeId];
  const city = CITY_BY_ID[cityId];
  const price = pricePerM2(cityId, day) * t.area * t.premium;
  const fees = price * RE_TRANSACTION.buy;
  const gross = city.yield + t.yieldAdj;
  return { price, fees, total: price + fees, grossYield: gross, netYield: gross - city.costs, area: t.area };
}

export function propertyValue(p: Property, day: number): number {
  const t = PROPERTY_TYPE_BY_ID[p.type];
  return pricePerM2(p.city, day) * p.area * t.premium;
}

export function propertiesValue(s: GameState): number {
  let v = 0;
  for (const p of s.properties) v += propertyValue(p, s.day);
  return v;
}

/** Чистая аренда в игровой день: стоимость × (доходность × навык − расходы) / 365 */
export function propertyRentPerDay(p: Property, day: number, mods: Pick<Mods, 'rentMult'>): number {
  const city = CITY_BY_ID[p.city];
  const t = PROPERTY_TYPE_BY_ID[p.type];
  const v = propertyValue(p, day);
  return (v * ((city.yield + t.yieldAdj) * mods.rentMult - city.costs)) / 365;
}

export const SELL_FEE = RE_TRANSACTION.sell;

// ---------------------------------------------------------------------------
// Майнинг BTC: доля хешрейта сети × реальная дневная эмиссия
// ---------------------------------------------------------------------------
export function rigAvailable(rigId: string, day: number): boolean {
  return day >= dayNum(RIG_BY_ID[rigId].from);
}

export function playerHashrate(s: GameState): number {
  let h = 0;
  for (const [id, n] of Object.entries(s.rigs)) h += (RIG_BY_ID[id]?.hashrate ?? 0) * n;
  return h;
}

export function playerPowerKw(s: GameState): number {
  let w = 0;
  for (const [id, n] of Object.entries(s.rigs)) w += (RIG_BY_ID[id]?.power ?? 0) * n;
  return w / 1000;
}

/**
 * Добыча в день:
 *   BTC/день = H_игрока / (H_сети + H_игрока) · эмиссия_дня
 *   электричество/день = кВт · 24 · $/кВт·ч
 * Халвинги уже внутри реальной эмиссии (50 → 25 → 12,5 → 6,25 → 3,125 BTC за блок).
 */
export function miningPerDay(s: GameState, day: number, mods: Pick<Mods, 'electricityMult'>) {
  const h = playerHashrate(s);
  if (h <= 0) return { btc: 0, power: 0, share: 0, network: btcHashrate(day) };
  const network = btcHashrate(day);
  const share = h / (network + h);
  const btc = share * btcIssuance(day);
  const power = playerPowerKw(s) * 24 * BALANCE.electricityPerKwh * mods.electricityMult;
  return { btc, power, share, network };
}

/** Остаточная стоимость фермы: 70% от текущей рыночной цены моделей (они дешевеют ~50% в год) */
export function rigsValue(s: GameState, day: number): number {
  let v = 0;
  for (const [id, n] of Object.entries(s.rigs)) if (n > 0) v += rigPrice(id, day) * n * 0.7;
  return v;
}

export function rigPrice(rigId: string, day: number): number {
  // Цена падает со временем после выхода модели (устаревание), но не ниже 5%
  const r = RIG_BY_ID[rigId];
  const years = Math.max(0, (day - dayNum(r.from)) / 365.25);
  return r.price * Math.max(0.05, Math.pow(1 - MINING.depreciation, years));
}

export function availableRigs(day: number) {
  return RIGS.filter((r) => rigAvailable(r.id, day));
}
