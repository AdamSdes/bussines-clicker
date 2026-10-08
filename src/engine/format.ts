// Форматирование больших чисел: $1.23K, M, B, T, затем научная запись (до 1e308).

export type NumberFormat = 'short' | 'scientific' | 'full';

let currentFormat: NumberFormat = 'short';
export function setNumberFormat(f: NumberFormat) {
  currentFormat = f;
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Компактное число без валюты. */
export function fmtNum(x: number, digits = 2, format: NumberFormat = currentFormat): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
  const sign = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (a < 1000) {
    if (a === 0) return '0';
    if (a < 0.01) return sign + a.toPrecision(2);
    return sign + trimZeros(a.toFixed(a < 10 ? digits : a < 100 ? Math.min(digits, 1) : 0));
  }
  if (format === 'full' && a < 1e15) {
    return sign + Math.round(a).toLocaleString('ru-RU').replace(/ /g, ' ');
  }
  if (format === 'scientific' || a >= 1e15) {
    const exp = Math.floor(Math.log10(a));
    const mant = a / Math.pow(10, exp);
    return `${sign}${mant.toFixed(2)}e${exp}`;
  }
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(a) / 3));
  const scaled = a / Math.pow(1000, tier);
  // 999.995K → 1.00M
  if (scaled >= 999.995 && tier < SUFFIXES.length - 1) return sign + (scaled / 1000).toFixed(digits) + SUFFIXES[tier + 1];
  return sign + scaled.toFixed(digits) + SUFFIXES[tier];
}

/** Деньги: $1.23K */
export function fmtMoney(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '$∞';
  const s = fmtNum(Math.abs(x), digits);
  return (x < 0 ? '−$' : '$') + s;
}

/** Цена актива — больше знаков для дешёвых монет ($0.00076). */
export function fmtPrice(x: number): string {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const sign = x < 0 ? '−' : '';
  if (a === 0) return '$0';
  if (a < 0.0001) return `${sign}$${a.toPrecision(3)}`;
  if (a < 1) return `${sign}$${a.toFixed(a < 0.01 ? 5 : 4)}`;
  if (a < 1e5) return `${sign}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return sign + fmtMoney(a);
}

export function fmtPct(x: number, digits = 2, withSign = true): string {
  if (!Number.isFinite(x)) return '—';
  const v = x * 100;
  const abs = Math.abs(v);
  const s = abs >= 1e6 ? fmtNum(abs, 1) : abs.toFixed(abs >= 1000 ? 0 : digits);
  return (v > 0 && withSign ? '+' : v < 0 ? '−' : '') + s + '%';
}

export function fmtQty(x: number): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  if (Math.abs(x) >= 1e6) return fmtNum(x, 2);
  if (Math.abs(x) >= 100) return x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/ /g, ' ');
  if (Math.abs(x) >= 1) return trimZeros(x.toFixed(4));
  return trimZeros(x.toPrecision(4));
}
