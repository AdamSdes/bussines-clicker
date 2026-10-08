// Состояние интерфейса: вкладки, тосты, всплывающие цифры, модальные окна.
import { create } from 'zustand';
import type { ToastKind } from '../engine/simulate';

export type Tab = 'work' | 'business' | 'invest' | 'life' | 'profile';
export type InvestTab = 'stocks' | 'crypto' | 'property' | 'bank';
export type ProfileTab = 'overview' | 'quests' | 'achievements' | 'skills' | 'stats' | 'settings';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  text?: string;
  emoji?: string;
  ttl: number;
  /** Показывать даже поверх открытого окна (ошибки действий) */
  urgent?: boolean;
}

export interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  crit: boolean;
}

export type Modal =
  | { type: 'asset'; id: string }
  | { type: 'ipo' }
  | { type: 'away' }
  | { type: 'daily' }
  | { type: 'choice' }
  | { type: 'sandbox' }
  | { type: 'save' }
  | { type: 'biz'; id: string }
  | { type: 'news' }
  | null;

interface UiStore {
  tab: Tab;
  investTab: InvestTab;
  profileTab: ProfileTab;
  toasts: Toast[];
  floaters: Floater[];
  modal: Modal;
  confetti: number;
  buyMode: 1 | 10 | 100 | 'next' | 'max';
  tickerFocus: string | null;
  setTab: (t: Tab) => void;
  setInvestTab: (t: InvestTab) => void;
  setProfileTab: (t: ProfileTab) => void;
  toast: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void;
  dismiss: (id: number) => void;
  floater: (f: Omit<Floater, 'id'>) => void;
  removeFloater: (id: number) => void;
  open: (m: Modal) => void;
  close: () => void;
  celebrate: () => void;
  setBuyMode: (m: UiStore['buyMode']) => void;
}

let nextId = 1;

export const useUi = create<UiStore>((set) => ({
  tab: 'work',
  investTab: 'stocks',
  profileTab: 'overview',
  toasts: [],
  floaters: [],
  modal: null,
  confetti: 0,
  buyMode: 1,
  tickerFocus: null,
  setTab: (tab) => set({ tab }),
  setInvestTab: (investTab) => set({ investTab }),
  setProfileTab: (profileTab) => set({ profileTab }),
  toast: (t) =>
    set((st) => {
      const toast: Toast = { id: nextId++, ttl: t.ttl ?? (t.kind === 'news' ? 6500 : 4500), ...t };
      // очередь до 6 тостов, на экране — не больше 3
      return { toasts: [...st.toasts.slice(-5), toast] };
    }),
  dismiss: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  floater: (f) => set((st) => ({ floaters: [...st.floaters.slice(-24), { id: nextId++, ...f }] })),
  removeFloater: (id) => set((st) => ({ floaters: st.floaters.filter((f) => f.id !== id) })),
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
  celebrate: () => set((st) => ({ confetti: st.confetti + 1 })),
  setBuyMode: (buyMode) => set({ buyMode }),
}));
