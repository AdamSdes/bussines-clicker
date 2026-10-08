// Игровое время: день = число дней от 1970-01-01 (UTC), дробная часть — время суток.

export const MS_DAY = 86_400_000;

export function dayNum(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / MS_DAY);
}

export function dayStr(day: number): string {
  return new Date(Math.floor(day) * MS_DAY).toISOString().slice(0, 10);
}

export function isWeekend(day: number): boolean {
  const w = new Date(Math.floor(day) * MS_DAY).getUTCDay();
  return w === 0 || w === 6;
}

export function yearOf(day: number): number {
  return new Date(Math.floor(day) * MS_DAY).getUTCFullYear();
}

export function monthOf(day: number): number {
  return new Date(Math.floor(day) * MS_DAY).getUTCMonth() + 1;
}

/** Реальная сегодняшняя дата как игровой день (дробный). */
export function realDay(nowMs = Date.now()): number {
  return nowMs / MS_DAY;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function fmtDate(day: number, full = false): string {
  const d = new Date(Math.floor(day) * MS_DAY);
  const m = full ? MONTHS_FULL : MONTHS;
  return `${d.getUTCDate()} ${m[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtWeekday(day: number): string {
  return WEEKDAYS[new Date(Math.floor(day) * MS_DAY).getUTCDay()];
}

export function fmtMonthYear(day: number): string {
  const d = new Date(Math.floor(day) * MS_DAY);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Ключ реального дня в локальном часовом поясе (для ежедневных наград/квестов). */
export function localDayKey(ms = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ключ реальной недели (понедельник недели) в локальном часовом поясе. */
export function localWeekKey(ms = Date.now()): string {
  const d = new Date(ms);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return localDayKey(d.getTime());
}

export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '∞';
  if (sec < 1) return '<1 с';
  if (sec < 60) return `${Math.round(sec)} с`;
  if (sec < 3600) return `${Math.floor(sec / 60)} мин ${Math.round(sec % 60)} с`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч ${Math.round((sec % 3600) / 60)} мин`;
  const days = sec / 86400;
  if (days < 365) return `${Math.round(days)} дн`;
  return `${(days / 365).toFixed(1)} лет`;
}

export function fmtGameSpan(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} ч`;
  if (days < 60) return `${Math.round(days)} дн.`;
  if (days < 730) return `${Math.round(days / 30.4)} мес.`;
  return `${(days / 365.25).toFixed(1)} г.`;
}

const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/** «среда» — полный день недели для газетной шапки */
export function fmtWeekdayFull(day: number): string {
  return WEEKDAYS_FULL[new Date(Math.floor(day) * MS_DAY).getUTCDay()];
}
