// Скачивает реальные фотографии игровых объектов со свободной лицензией
// и складывает их в public/images. Никакого хотлинкинга: игра показывает только локальные файлы.
//
// Запуск:  npm run images              (докачать недостающие)
//          npm run images -- --force   (перекачать всё)
//          npm run images -- --only=lot/  (только ключи с префиксом)
// За прокси: NODE_USE_ENV_PROXY=1 npm run images   (Node >= 22.21)
//
// Источники (по порядку): Wikimedia Commons → Pexels (PEXELS_API_KEY) → Unsplash (UNSPLASH_ACCESS_KEY).
// Порядок можно задать переменной IMAGE_SOURCES=commons,pexels,unsplash.
// Принимаются только лицензии из allowlist: CC0, Public domain, CC BY, CC BY-SA, Unsplash License, Pexels License.
// NC/ND, fair use и всё несвободное отбрасывается.
//
// Результат:
//   public/images/<key>.webp (фото, до 800px) или .svg (логотипы и крипта)
//   public/images/credits.json — полный список авторов и лицензий
//   src/data/images.json      — индекс для игры: какие картинки есть, их размеры и подписи
//
// Если сеть недоступна, скрипт не падает: сохраняет то, что уже скачано, и объектам
// без фото игра показывает заглушку цвета бумаги с названием.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'src/config/images.json');
const OUT_DIR = path.join(ROOT, 'public/images');
const INDEX = path.join(ROOT, 'src/data/images.json');
const CREDITS = path.join(OUT_DIR, 'credits.json');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const QUIET = args.includes('--quiet');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7);
const MAX = 800;
const UA = 'EmpireFromZero/0.1 (image build script; https://github.com/adamsdes/bussines-clicker)';
const SOURCES = (process.env.IMAGE_SOURCES ?? 'commons,pexels,unsplash').split(',').map((s) => s.trim());

const log = (...a) => !QUIET && console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const prev = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : { images: {} };
const index = { ...prev, images: { ...(prev.images ?? {}) } };

// ---------- сеть ----------
const downHosts = new Set();
async function get(url, headers = {}, as = 'json') {
  const host = new URL(url).host;
  if (downHosts.has(host)) throw new Error(`${host} недоступен`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${url}`), { status: res.status });
    return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
  } catch (e) {
    // сетевой отказ (а не 404) — больше не стучимся на этот хост
    if (!e.status) {
      downHosts.add(host);
      console.warn(`! ${host}: ${e.cause?.code ?? e.message} — источник пропущен`);
    }
    throw e;
  }
}

// ---------- лицензии ----------
const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function licenseOk(name) {
  const n = name.toUpperCase();
  if (/\bNC\b|\bND\b|NON-?COMMERCIAL|NO-?DERIV|FAIR USE|NON-?FREE|COPYRIGHTED/.test(n)) return false;
  return /^(CC0|PD|PUBLIC DOMAIN|CC BY(-SA)? [\d.]+|CC BY(-SA)?$|CC-BY(-SA)?-[\d.]+)/.test(n) || n.startsWith('PD-');
}

// ---------- Wikimedia Commons ----------
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
function commonsCandidates(pages) {
  return Object.values(pages ?? {})
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const ii = p.imageinfo[0];
      const m = ii.extmetadata ?? {};
      const license = stripHtml(m.LicenseShortName?.value) || stripHtml(m.License?.value);
      return {
        title: p.title.replace(/^File:/, ''),
        mime: ii.mime,
        width: ii.width,
        height: ii.height,
        url: ii.thumburl && !ii.mime.includes('svg') ? ii.thumburl : ii.url,
        license,
        licenseUrl: m.LicenseUrl?.value ?? '',
        author: stripHtml(m.Artist?.value) || 'Wikimedia Commons',
        source: 'Wikimedia Commons',
        sourceUrl: ii.descriptionurl,
        index: p.index ?? 0,
      };
    })
    .filter((c) => licenseOk(c.license))
    .sort((a, b) => a.index - b.index);
}
async function fromCommons(item) {
  const common = { action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1200', origin: '*' };
  const tries = [];
  if (item.file) tries.push({ ...common, titles: `File:${decodeURIComponent(item.file)}` });
  const kind = item.svg ? 'filemime:image/svg+xml' : item.cutout ? 'filemime:image/png' : 'filetype:bitmap';
  tries.push({ ...common, generator: 'search', gsrnamespace: '6', gsrlimit: '12', gsrsearch: `${item.query} ${kind}` });
  if (item.cutout) tries.push({ ...common, generator: 'search', gsrnamespace: '6', gsrlimit: '12', gsrsearch: `${item.query} filetype:bitmap` });
  for (const params of tries) {
    const j = await get(`${COMMONS}?${new URLSearchParams(params)}`);
    const list = commonsCandidates(j.query?.pages).filter((c) => (item.svg ? c.mime.includes('svg') : !c.mime.includes('svg')) && (item.svg || c.width >= 400));
    if (list.length) return list;
    await sleep(150);
  }
  return [];
}

// ---------- Pexels ----------
async function fromPexels(item) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || item.svg) return [];
  const j = await get(`https://api.pexels.com/v1/search?${new URLSearchParams({ query: item.query, per_page: '8' })}`, { Authorization: key });
  return (j.photos ?? []).map((p) => ({
    title: p.alt || item.label,
    mime: 'image/jpeg',
    width: p.width,
    height: p.height,
    url: p.src.large,
    license: 'Pexels License',
    licenseUrl: 'https://www.pexels.com/license/',
    author: p.photographer,
    source: 'Pexels',
    sourceUrl: p.url,
  }));
}

// ---------- Unsplash ----------
async function fromUnsplash(item) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || item.svg) return [];
  const j = await get(`https://api.unsplash.com/search/photos?${new URLSearchParams({ query: item.query, per_page: '8' })}`, { Authorization: `Client-ID ${key}` });
  return (j.results ?? []).map((p) => ({
    title: p.alt_description || item.label,
    mime: 'image/jpeg',
    width: p.width,
    height: p.height,
    url: `${p.urls.raw}&w=1200&fm=jpg&q=85`,
    license: 'Unsplash License',
    licenseUrl: 'https://unsplash.com/license',
    author: p.user?.name ?? 'Unsplash',
    source: 'Unsplash',
    sourceUrl: p.links?.html,
    trackUrl: p.links?.download_location,
  }));
}

const PROVIDERS = { commons: fromCommons, pexels: fromPexels, unsplash: fromUnsplash };

// ---------- обработка ----------
/** Вырезает однотонный светлый фон заливкой от краёв. Возвращает null, если фон неоднородный. */
async function cutout(buf) {
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (x, y) => (y * w + x) * 4;

  // уже прозрачный фон — ничего не делаем
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  if (corners.every((i) => data[i + 3] < 16)) return buf;

  const avg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + data[i + c], 0) / 4);
  const spread = Math.max(...corners.map((i) => Math.hypot(data[i] - avg[0], data[i + 1] - avg[1], data[i + 2] - avg[2])));
  if (spread > 30 || Math.min(...avg) < 185) return null;

  const dist = (i) => Math.hypot(data[i] - avg[0], data[i + 1] - avg[1], data[i + 2] - avg[2]);
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k]) continue;
    const i = k * 4;
    const d = dist(i);
    if (d > 42) continue;
    seen[k] = 1;
    // мягкий край: чем ближе к фону, тем прозрачнее
    data[i + 3] = d < 18 ? 0 : Math.round(((d - 18) / 24) * 255);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
}

function cleanSvg(text) {
  return text
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .trim();
}

async function save(item, cand) {
  const buf = await get(cand.url, {}, 'buffer');
  if (cand.trackUrl) get(cand.trackUrl, { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }).catch(() => {});
  const base = path.join(OUT_DIR, item.key);
  fs.mkdirSync(path.dirname(base), { recursive: true });

  if (item.svg) {
    const svg = cleanSvg(buf.toString('utf8'));
    if (!svg.includes('<svg')) throw new Error('не SVG');
    fs.writeFileSync(`${base}.svg`, svg);
    return { src: `images/${item.key}.svg`, w: 0, h: 0, cutout: true };
  }

  let input = buf;
  let isCutout = false;
  if (item.cutout) {
    const cut = await cutout(buf);
    if (cut) {
      input = cut;
      isCutout = true;
    }
  }
  const out = await sharp(input)
    .rotate()
    .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, alphaQuality: 90, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  fs.writeFileSync(`${base}.webp`, out.data);
  return { src: `images/${item.key}.webp`, w: out.info.width, h: out.info.height, cutout: isCutout };
}

// ---------- крипта: CC0-набор из npm ----------
function copyCrypto() {
  const c = manifest.crypto;
  let dir;
  try {
    dir = path.join(path.dirname(require.resolve(`${c.package}/package.json`)), 'svg/color');
  } catch {
    console.warn(`! пакет ${c.package} не установлен — логотипы монет пропущены`);
    return;
  }
  fs.mkdirSync(path.join(OUT_DIR, 'crypto'), { recursive: true });
  for (const [sym, id] of Object.entries(c.ids)) {
    const from = path.join(dir, `${id}.svg`);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(OUT_DIR, 'crypto', `${sym}.svg`));
    index.images[`crypto/${sym}`] = {
      src: `images/crypto/${sym}.svg`,
      w: 32,
      h: 32,
      cutout: true,
      label: sym,
      credit: { title: `${sym} icon`, author: 'Cryptocurrency Icons contributors', license: c.license, licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'cryptocurrency-icons', sourceUrl: c.url },
    };
  }
}

// ---------- главный цикл ----------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(INDEX), { recursive: true });
  copyCrypto();

  const items = manifest.items.filter((i) => !ONLY || i.key.startsWith(ONLY));
  let got = 0;
  let kept = 0;
  let missing = 0;
  for (const item of items) {
    const have = index.images[item.key];
    if (have && !FORCE && fs.existsSync(path.join(ROOT, 'public', have.src))) {
      kept++;
      continue;
    }
    let done = false;
    for (const name of item.sources ?? SOURCES) {
      const provider = PROVIDERS[name];
      if (!provider) continue;
      let cands = [];
      try {
        cands = await provider(item);
      } catch {
        continue;
      }
      for (const cand of cands.slice(0, 4)) {
        try {
          const file = await save(item, cand);
          index.images[item.key] = {
            ...file,
            label: item.label,
            credit: { title: cand.title, author: cand.author, license: cand.license, licenseUrl: cand.licenseUrl, source: cand.source, sourceUrl: cand.sourceUrl },
          };
          log(`+ ${item.key} ← ${cand.source}: ${cand.title} (${cand.license})`);
          got++;
          done = true;
          break;
        } catch (e) {
          if (downHosts.size && !e.status) break;
        }
      }
      if (done) break;
      await sleep(120);
    }
    if (!done) {
      missing++;
      log(`- ${item.key}: не найдено — будет заглушка «${item.label}»`);
    }
  }

  // индекс для игры
  index.generated = new Date().toISOString().slice(0, 10);
  index.useRealLogos = manifest.useRealLogos;
  index.images = Object.fromEntries(Object.entries(index.images).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 1) + '\n');

  const credits = Object.entries(index.images).map(([key, v]) => ({ key, file: v.src, label: v.label, ...v.credit }));
  fs.writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n');

  console.log(`Изображения: скачано ${got}, уже было ${kept}, без фото ${missing}. Индекс: src/data/images.json`);
  if (downHosts.size) console.log(`Недоступные хосты: ${[...downHosts].join(', ')} — разрешите их в сетевых настройках и запустите снова.`);
}

main().catch((e) => {
  // сборка не должна падать из-за картинок
  console.warn('! fetch-images:', e.message);
  process.exit(0);
});
