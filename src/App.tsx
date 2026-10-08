import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { loadMarket } from './engine/market';
import { useGame } from './store/game';
import { useUi } from './store/ui';
import { useGameLoop, useLivePolling } from './hooks/useGameLoop';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { NewsTicker } from './components/layout/NewsTicker';
import { Confetti, Toasts } from './components/layout/Toasts';
import { WorkScreen } from './components/work/WorkScreen';
import { BusinessScreen } from './components/business/BusinessScreen';
import { AwayModal, ChoiceModal, DailyModal, NewsModal } from './components/modals/Modals';
import { SandboxModal, SaveModal } from './components/profile/Settings';

const InvestScreen = lazy(() => import('./components/invest/InvestScreen'));
const LifeScreen = lazy(() => import('./components/life/LifeScreen'));
const ProfileScreen = lazy(() => import('./components/profile/ProfileScreen'));

function Loading({ progress }: { progress: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="text-5xl">🏛️</div>
      <div>
        <div className="text-gradient-gold text-3xl font-extrabold tracking-tight">Империя с нуля</div>
        <div className="mt-1 text-sm text-ink-dim">Загружаем 17 лет реальной истории рынков…</div>
      </div>
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#ffd76e] to-[#e0a93a] transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

export default function App() {
  const ready = useGame((g) => g.ready);
  const boot = useGame((g) => g.boot);
  const tab = useUi((u) => u.tab);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMarket(setProgress)
      .then(() => boot())
      .catch((e) => setError(String(e?.message ?? e)));
  }, [boot]);

  useGameLoop(ready);
  useLivePolling(ready);

  if (error) return <div className="p-6 text-down">Ошибка загрузки данных: {error}</div>;
  if (!ready) return <Loading progress={progress} />;

  return (
    <div className="min-h-full pb-[calc(6.5rem+var(--safe-bottom))]">
      <Header />
      <NewsTicker />
      <main className="mx-auto max-w-5xl px-3 pt-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}>
            <Suspense fallback={<div className="py-20 text-center text-ink-mute">Загрузка…</div>}>
              {tab === 'work' && <WorkScreen />}
              {tab === 'business' && <BusinessScreen />}
              {tab === 'invest' && <InvestScreen />}
              {tab === 'life' && <LifeScreen />}
              {tab === 'profile' && <ProfileScreen />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav />
      <Toasts />
      <Confetti />
      <AwayModal />
      <DailyModal />
      <ChoiceModal />
      <SaveModal />
      <SandboxModal />
      <NewsModal />
    </div>
  );
}
