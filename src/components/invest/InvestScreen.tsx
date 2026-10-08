import { lazy, Suspense } from 'react';
import { useUi, type InvestTab } from '../../store/ui';
import { Segmented } from '../ui';
import { AssetGroup, PortfolioSummary } from './AssetList';
import { AssetModal } from './AssetModal';

const MiningPanel = lazy(() => import('./Mining'));
const RealEstatePanel = lazy(() => import('./RealEstate'));
const BankPanel = lazy(() => import('./Bank'));

const TABS: { value: InvestTab; label: string }[] = [
  { value: 'stocks', label: '📈 Акции' },
  { value: 'crypto', label: '₿ Крипта' },
  { value: 'property', label: '🏠 Жильё' },
  { value: 'bank', label: '🏦 Банк' },
];

export default function InvestScreen() {
  const tab = useUi((u) => u.investTab);
  const setTab = useUi((u) => u.setInvestTab);
  return (
    <div>
      <Segmented size="sm" value={tab} onChange={setTab} options={TABS} className="mb-3" />
      <Suspense fallback={<div className="py-10 text-center text-ink-mute">Загрузка…</div>}>
        {tab === 'stocks' && (
          <div className="lg:grid lg:grid-cols-2 lg:gap-3">
            <div>
              <PortfolioSummary kinds={['stock', 'etf', 'commodity', 'fx']} />
              <AssetGroup title="Индексные фонды" kinds={['etf']} />
              <AssetGroup title="Сырьё и валюта" kinds={['commodity', 'fx']} />
            </div>
            <div>
              <AssetGroup title="Акции" kinds={['stock']} />
            </div>
          </div>
        )}
        {tab === 'crypto' && (
          <div className="lg:grid lg:grid-cols-2 lg:gap-3">
            <div>
              <PortfolioSummary kinds={['crypto']} />
              <AssetGroup title="Криптовалюты" kinds={['crypto']} />
            </div>
            <div>
              <MiningPanel />
            </div>
          </div>
        )}
        {tab === 'property' && <RealEstatePanel />}
        {tab === 'bank' && <BankPanel />}
      </Suspense>
      <AssetModal />
    </div>
  );
}
