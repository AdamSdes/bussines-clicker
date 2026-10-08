import { BIZ_BY_ID, BUSINESSES, LIFESTYLE } from '../../engine/config';
import { managerCost, unitCost } from '../../engine/economy';
import { canBuySkill, canIpo, jobRequirements, nextClickUpgrade } from '../../engine/actions';
import { SKILLS } from '../../engine/config';
import { localDayKey } from '../../engine/time';
import { useGame } from '../../store/game';
import { useUi, type Tab } from '../../store/ui';
import { cx } from '../ui';
import { IconChart, IconDiamond, IconStore, IconUser, IconWork } from '../icons';

const TABS: { id: Tab; label: string; Icon: typeof IconWork }[] = [
  { id: 'work', label: 'Работа', Icon: IconWork },
  { id: 'business', label: 'Бизнесы', Icon: IconStore },
  { id: 'invest', label: 'Инвестиции', Icon: IconChart },
  { id: 'life', label: 'Жизнь', Icon: IconDiamond },
  { id: 'profile', label: 'Профиль', Icon: IconUser },
];

/** Бейджи «есть что купить/забрать» — возвращаем строку, чтобы не перерисовываться каждый тик */
function useBadges(): string {
  return useGame((g) => {
    const s = g.s;
    const m = g.rt.mods;
    const req = jobRequirements(s);
    const cu = nextClickUpgrade(s);
    const work = (req && req.cashOk && req.clicksOk && req.unitsOk) || (cu && cu.cost <= s.cash);
    let biz = false;
    for (const def of BUSINESSES) {
      const st = s.businesses[def.id];
      const lvl = st?.level ?? 0;
      if (unitCost(def, lvl, m) <= s.cash) biz = true;
      if (st && lvl > 0 && !st.manager && managerCost(BIZ_BY_ID[def.id], m) <= s.cash) biz = true;
      if (biz) break;
    }
    const life = LIFESTYLE.some((i) => !s.lifestyle.includes(i.id) && i.price <= s.cash && s.cash > 5000);
    const quests = [...s.quests.daily, ...s.quests.weekly].some((q) => q.done && !q.claimed);
    const profile = quests || s.dailyReward.lastKey !== localDayKey() || canIpo(s) || SKILLS.some((sk) => !canBuySkill(s, sk.id));
    return `${work ? 1 : 0}${biz ? 1 : 0}0${life ? 1 : 0}${profile ? 1 : 0}`;
  });
}

export function BottomNav() {
  const tab = useUi((u) => u.tab);
  const setTab = useUi((u) => u.setTab);
  const badges = useBadges();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.5rem+var(--safe-bottom))]">
      <div className="glass-strong mx-auto flex max-w-5xl items-stretch justify-between rounded-2xl p-1.5">
        {TABS.map((t, i) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx('press relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl', active ? 'bg-white/[0.08] text-gold' : 'text-ink-dim hover:text-ink')}
            >
              <t.Icon className="h-[22px] w-[22px]" />
              <span className="text-[10px] font-semibold sm:text-[11px]">{t.label}</span>
              {badges[i] === '1' && <span className="absolute right-[calc(50%-18px)] top-1.5 h-2 w-2 rounded-full bg-gold shadow-[0_0_8px_rgba(245,196,81,0.9)]" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
