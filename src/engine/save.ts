// Сохранения: localStorage (отдельные слоты «История» и «Песочница»),
// экспорт/импорт строкой (base64 JSON), миграции версий.
import { defaultSettings, emptyStats, newGame, SAVE_VERSION } from './initial';
import { exportLiveCloses, importLiveCloses } from './market';
import type { GameState } from './types';

const KEY = (slot: string) => `empire-from-zero:save:${slot}`;
const ACTIVE = 'empire-from-zero:active';
const LIVE = 'empire-from-zero:live-closes';

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string): boolean {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

/** Заполняет отсутствующие поля значениями по умолчанию (сейвы старых версий). */
export function migrate(raw: Partial<GameState>): GameState {
  const base = newGame(raw.mode ?? 'story', raw.startDate);
  const s = { ...base, ...raw } as GameState;
  s.settings = { ...defaultSettings(), ...(raw.settings ?? {}) };
  s.stats = { ...emptyStats(), ...(raw.stats ?? {}) };
  s.quests = { ...base.quests, ...(raw.quests ?? {}) };
  s.dailyReward = { ...base.dailyReward, ...(raw.dailyReward ?? {}) };
  s.collection = raw.collection ?? [...(raw.lifestyle ?? [])];
  s.flags = raw.flags ?? {};
  s.v = SAVE_VERSION;
  return s;
}

export function saveGame(s: GameState): boolean {
  const ok = safeSet(KEY(s.mode), JSON.stringify(s));
  safeSet(ACTIVE, s.mode);
  safeSet(LIVE, JSON.stringify(exportLiveCloses()));
  return ok;
}

export function loadSlot(slot: 'story' | 'sandbox'): GameState | null {
  const txt = safeGet(KEY(slot));
  if (!txt) return null;
  try {
    return migrate(JSON.parse(txt));
  } catch {
    return null;
  }
}

export function loadActive(): GameState | null {
  const slot = (safeGet(ACTIVE) as 'story' | 'sandbox' | null) ?? 'story';
  try {
    importLiveCloses(JSON.parse(safeGet(LIVE) ?? 'null'));
  } catch {
    /* нет живых данных */
  }
  return loadSlot(slot) ?? (slot === 'sandbox' ? loadSlot('story') : null);
}

export function hasSlot(slot: 'story' | 'sandbox'): boolean {
  return !!safeGet(KEY(slot));
}

export function deleteSlot(slot: 'story' | 'sandbox') {
  try {
    localStorage.removeItem(KEY(slot));
  } catch {
    /* ignore */
  }
}

/** Экспорт: base64 от UTF-8 JSON с префиксом версии */
export function exportSave(s: GameState): string {
  const json = JSON.stringify(s);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `EFZ1:${btoa(bin)}`;
}

export function importSave(text: string): GameState {
  const t = text.trim();
  let json: string;
  if (t.startsWith('EFZ1:')) {
    const bin = atob(t.slice(5));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  } else {
    json = t;
  }
  const raw = JSON.parse(json);
  if (typeof raw !== 'object' || raw == null || typeof raw.day !== 'number' || typeof raw.cash !== 'number') {
    throw new Error('Это не сохранение «Империи с нуля»');
  }
  return migrate(raw);
}
