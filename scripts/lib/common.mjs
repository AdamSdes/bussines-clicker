// Общие утилиты для скриптов данных: даты, детерминированный ГСЧ, округление.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DIR = path.join(ROOT, 'data', 'raw');
export const OUT_DIR = path.join(ROOT, 'src', 'data', 'history');

/** Начало всех рядов: 1 января 2000 (нужно для режима «Песочница»). */
export const START = '2000-01-01';

const MS_DAY = 86_400_000;

/** Номер дня от эпохи Unix (UTC) для строки YYYY-MM-DD. */
export function dayNum(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d ?? 1) / MS_DAY);
}

export function dayStr(n) {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

/** 0 = воскресенье ... 6 = суббота */
export function weekday(n) {
  return new Date(n * MS_DAY).getUTCDay();
}

export function isWeekend(n) {
  const w = weekday(n);
  return w === 0 || w === 6;
}

/** mulberry32 — быстрый детерминированный ГСЧ. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Нормальное распределение (Бокс — Мюллер). */
export function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Округление до N значащих цифр (сжимает JSON, не теряя точности для игры). */
export function sig(x, n = 5) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  if (x === 0) return 0;
  const p = Math.pow(10, n - Math.ceil(Math.log10(Math.abs(x))));
  return Math.round(x * p) / p;
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

/** Парсер компактной записи опорных точек: "2009-03-31 3.75, 2009-06-30 5.09" */
export function parseAnchors(text) {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [d, v] = s.split(/\s+/);
      return [dayNum(d), Number(v)];
    })
    .sort((a, b) => a[0] - b[0]);
}
