// Индекс реальных фотографий, собранный scripts/fetch-images.mjs.
// Игра показывает только локальные файлы из public/images — без хотлинкинга.
import data from '../data/images.json';
import manifest from '../config/images.json';

export interface ImageCredit {
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  sourceUrl: string;
}
export interface ImageEntry {
  src: string;
  w: number;
  h: number;
  cutout: boolean;
  label?: string;
  credit?: ImageCredit;
}

const IMAGES = (data as unknown as { images: Record<string, ImageEntry> }).images ?? {};
const LABELS: Record<string, string> = Object.fromEntries(manifest.items.map((i) => [i.key, i.label]));

/** Показывать логотипы компаний (true) или тикер в рамке (false) */
export const USE_REAL_LOGOS: boolean = manifest.useRealLogos;

export function imageOf(key: string): ImageEntry | undefined {
  return IMAGES[key];
}

export function imageUrl(e: ImageEntry): string {
  return import.meta.env.BASE_URL + e.src;
}

export function imageLabel(key: string): string {
  return LABELS[key] ?? key;
}

/** Все авторы и лицензии — для экрана «Авторы фото» */
export function imageCredits(): (ImageCredit & { key: string; label: string; src: string })[] {
  return Object.entries(IMAGES)
    .filter(([, e]) => e.credit)
    .map(([key, e]) => ({ key, label: e.label ?? imageLabel(key), src: e.src, ...e.credit! }));
}

/** Сколько фото из манифеста уже скачано */
export function imageCoverage(): { have: number; total: number } {
  const total = manifest.items.length;
  const have = manifest.items.filter((i) => IMAGES[i.key]).length;
  return { have, total };
}

/** Стадия бизнеса для фото: одна точка → улица → сеть */
export function bizStage(level: number): 1 | 2 | 3 {
  return level >= 100 ? 3 : level >= 25 ? 2 : 1;
}
