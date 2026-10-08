import { useMemo, useState } from 'react';
import { ACHIEVEMENTS, ACHIEVEMENT_BONUS, ASSET_BY_ID, BALANCE, SKILLS, SKILL_BRANCHES, CAPITAL_LEVELS } from '../../engine/config';
import { availableStartYears, canBuySkill, canIpo, ipoGain, skillCost, totalRepFor } from '../../engine/actions';
import { netWorthParts } from '../../engine/networth';
import { questReward, questText } from '../../engine/progress';
import { fmtMoney, fmtNum, fmtPct } from '../../engine/format';
import { fmtDate, fmtDuration, localDayKey } from '../../engine/time';
import { useClock } from '../../hooks/useClock';
import { useGame } from '../../store/game';
import { useUi, type ProfileTab } from '../../store/ui';
import { RankCard } from '../life/LifeScreen';
import { Badge, Button, Card, Modal, Progress, SectionTitle, Segmented, Stat, cx } from '../ui';
import { LineChart } from './LineChart';
import { SettingsPanel } from './Settings';
import type { QuestProgress } from '../../engine/types';

const TABS: { value: ProfileTab; label: string }[] = [
  { value: 'overview', label: 'Обзор' },
  { value: 'quests', label: 'Задания' },
  { value: 'achievements', label: 'Награды' },
  { value: 'skills', label: 'Навыки' },
  { value: 'stats', label: 'Статистика' },
  { value: 'settings', label: '⚙️ Настройки' },
];

function NetWorthBreakdown() {
  useClock(800);
  const s = useGame.getState().s;
  const p = netWorthParts(s, s.live);
  const rows: [string, number, string][] = [
    ['Наличные', p.cash, '#e8edf5'],
    ['Бизнесы (вложения)', p.business, '#f5c451'],
    ['Акции и крипта', p.investments, '#22d17b'],
    ['Недвижимость', p.property, '#7c8cff'],
    ['Вклады и облигации', p.bank, '#4fc3f7'],
    ['Майнинг-ферма', p.rigs, '#ff9f43'],
  ];
  const pos = rows.reduce((a, r) => a + Math.max(0, r[1]), 0) || 1;
  return (
    <Card className="p-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Капитал</div>
          <div className="num text-2xl font-extrabold">{fmtMoney(p.total)}</div>
        </div>
        {p.loan > 0 && <Badge tone="down">долг {fmtMoney(p.loan)}</Badge>}
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        {rows.map(([n, v, c]) => (
          <div key={n} style={{ width: `${(Math.max(0, v) / pos) * 100}%`, background: c }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map(([n, v, c]) => (
          <div key={n} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-ink-dim">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />
              {n}
            </span>
            <span className="num font-semibold">{fmtMoney(v)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function IpoCard() {
  const s = useGame((g) => g.s);
  const open = useUi((u) => u.open);
  const gain = ipoGain(s);
  const ok = canIpo(s);
  const min = BALANCE.prestige.minEarnings;
  return (
    <Card className="p-4" highlight={ok}>
      <div className="flex items-center gap-3">
        <div className="text-3xl">🔔</div>
        <div className="min-w-0 flex-1">
          <div className="font-bold">IPO — выход на биржу</div>
          <div className="text-xs text-ink-dim">Продай компанию публике и начни новую жизнь в {s.mode === 'sandbox' ? s.startDate.slice(0, 4) : '2009'} году, сохранив репутацию.</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Репутация" value={fmtNum(s.reputation, 0)} sub="на навыки" />
        <Stat label="Бонус" value={`+${fmtNum(s.repEarned * BALANCE.prestige.bonusPerRep * 100, 0)}%`} sub="к прибыли навсегда" />
        <Stat label="За IPO" value={<span className="text-gold">+{fmtNum(gain, 0)}</span>} sub={`IPO: ${s.ipos}`} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-ink-dim">
          <span>Заработано в этой жизни</span>
          <span className="num">
            {fmtMoney(s.earnedLife)} / {fmtMoney(min)}
          </span>
        </div>
        <Progress value={s.earnedLife / min} color={ok ? 'green' : 'gold'} />
      </div>
      <Button className="mt-3 w-full" variant={ok ? 'gold' : 'dark'} disabled={!ok} onClick={() => open({ type: 'ipo' })}>
        {ok ? `Провести IPO (+${fmtNum(gain, 0)} репутации)` : `IPO откроется после ${fmtMoney(min)} заработка`}
      </Button>
    </Card>
  );
}

export function IpoModal() {
  const modal = useUi((u) => u.modal);
  const close = useUi((u) => u.close);
  const s = useGame((g) => g.s);
  const ipo = useGame((g) => g.ipo);
  const years = availableStartYears(s);
  const [year, setYear] = useState(years[0]);
  const gain = ipoGain(s);
  const next = totalRepFor(s.earnedTotal * 4) - s.repEarned - gain;
  return (
    <Modal open={modal?.type === 'ipo'} onClose={close} title="🔔 IPO: новая жизнь">
      <div className="space-y-2 text-sm text-ink-dim">
        <p>
          Ты выводишь компанию на биржу и получаешь <span className="font-bold text-gold">+{fmtNum(gain, 0)} репутации</span> (+{fmtNum(gain * BALANCE.prestige.bonusPerRep * 100, 0)}% к прибыли навсегда и валюта для навыков).
        </p>
        <p>Сбросится: деньги, бизнесы, работа, активы, недвижимость, лайфстайл, дата. Останутся: репутация, навыки, достижения, коллекция карточек.</p>
        <p className="text-xs text-ink-mute">Совет: если заработать вчетверо больше, IPO даст ещё ~{fmtNum(Math.max(0, next), 0)} репутации (формула — квадратный корень от заработка за все жизни).</p>
      </div>
      {s.mode === 'story' && years.length > 1 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-ink-dim">⏳ Машина времени: год старта</div>
          <div className="flex gap-2">
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)} className={cx('press h-11 flex-1 rounded-xl text-sm font-bold', year === y ? 'bg-gold-soft text-gold ring-gold' : 'bg-white/[0.04]')}>
                {y}
              </button>
            ))}
          </div>
        </div>
      )}
      {(s.skills.capital ?? 0) > 0 && <div className="mt-3 text-xs text-up">💰 Стартовый капитал: {fmtMoney(CAPITAL_LEVELS[s.skills.capital ?? 0])}</div>}
      <Button className="mt-5 w-full" size="lg" variant="gold" onClick={() => ipo(year)}>
        Позвонить в колокол NYSE
      </Button>
    </Modal>
  );
}

function QuestCard({ q }: { q: QuestProgress }) {
  const claim = useGame((g) => g.claimQuest);
  const income = useGame((g) => Math.max(g.rt.bizPerSec, g.rt.clickBase));
  const t = questText(q);
  const reward = questReward(q, income);
  const frac = q.template === 'networth_x2' ? (q.progress - 1) / Math.max(0.0001, q.target - 1) : q.progress / Math.max(1e-12, q.target);
  return (
    <Card className={cx('p-3', q.claimed && 'opacity-50')} highlight={q.done && !q.claimed}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-xl">{t.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t.name}</div>
          <div className="text-xs text-ink-dim">{t.desc}</div>
          <div className="mt-2 flex items-center gap-2">
            <Progress className="flex-1" value={q.done ? 1 : frac} color={q.done ? 'green' : 'accent'} />
            <span className="num shrink-0 text-[11px] text-ink-dim">{t.progressText}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gold">
          🎁 {fmtMoney(reward.cash)}
          {reward.rep > 0 && ` + ${reward.rep} реп.`}
        </span>
        <Button size="sm" variant={q.done && !q.claimed ? 'gold' : 'dark'} disabled={!q.done || q.claimed} onClick={() => claim(q.id)}>
          {q.claimed ? 'Получено' : q.done ? 'Забрать' : 'В процессе'}
        </Button>
      </div>
    </Card>
  );
}

function Quests() {
  const quests = useGame((g) => g.s.quests);
  const daily = useGame((g) => g.s.dailyReward);
  const open = useUi((u) => u.open);
  const claimedToday = daily.lastKey === localDayKey();
  return (
    <div>
      <Card className="flex items-center gap-3 p-4" highlight={!claimedToday}>
        <div className="text-3xl">🎁</div>
        <div className="flex-1">
          <div className="font-bold">Ежедневная награда</div>
          <div className="text-xs text-ink-dim">Серия: {daily.streak} дн. подряд</div>
        </div>
        <Button variant={claimedToday ? 'dark' : 'gold'} onClick={() => open({ type: 'daily' })}>
          {claimedToday ? 'Завтра' : 'Забрать'}
        </Button>
      </Card>
      <SectionTitle right={<span className="text-xs text-ink-mute">обновятся завтра</span>}>Ежедневные</SectionTitle>
      <div className="grid gap-2 md:grid-cols-3">
        {quests.daily.map((q) => (
          <QuestCard key={q.id} q={q} />
        ))}
      </div>
      <SectionTitle right={<span className="text-xs text-ink-mute">до понедельника</span>}>Еженедельные</SectionTitle>
      <div className="grid gap-2 md:grid-cols-3">
        {quests.weekly.map((q) => (
          <QuestCard key={q.id} q={q} />
        ))}
      </div>
    </div>
  );
}

function Achievements() {
  const got = useGame((g) => g.s.achievements);
  const n = Object.keys(got).length;
  const [filter, setFilter] = useState<'all' | 'got' | 'left'>('all');
  const list = ACHIEVEMENTS.filter((a) => (filter === 'all' ? true : filter === 'got' ? !!got[a.id] : !got[a.id]));
  return (
    <div>
      <Card className="flex items-center justify-between p-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Достижения</div>
          <div className="num text-2xl font-extrabold">
            {n} <span className="text-base text-ink-mute">/ {ACHIEVEMENTS.length}</span>
          </div>
        </div>
        <Badge tone="gold">+{(n * ACHIEVEMENT_BONUS * 100).toFixed(1)}% к прибыли</Badge>
      </Card>
      <Segmented
        size="sm"
        className="mt-3"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Все' },
          { value: 'got', label: 'Открытые' },
          { value: 'left', label: 'Закрытые' },
        ]}
      />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((a) => {
          const have = !!got[a.id];
          return (
            <div key={a.id} className={cx('glass rounded-2xl p-3', have ? 'ring-gold' : 'opacity-55')}>
              <div className={cx('text-2xl', !have && 'grayscale')}>{a.emoji}</div>
              <div className="mt-1 text-sm font-bold leading-tight">{a.name}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-ink-dim">{a.desc}</div>
              {have && <div className="mt-1 text-[10px] text-gold">{new Date(got[a.id]).toLocaleDateString('ru-RU')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Skills() {
  const s = useGame((g) => g.s);
  const buy = useGame((g) => g.buySkill);
  return (
    <div>
      <Card className="flex items-center justify-between p-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Репутация</div>
          <div className="num text-2xl font-extrabold text-gold">{fmtNum(s.reputation, 0)}</div>
        </div>
        <div className="text-right text-xs text-ink-dim">
          Зарабатывается на IPO,
          <br />
          ежедневных сериях и неделях заданий
        </div>
      </Card>
      {SKILL_BRANCHES.map((b) => (
        <div key={b.id}>
          <SectionTitle>
            {b.emoji} {b.name}
          </SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {SKILLS.filter((sk) => sk.branch === b.id).map((sk) => {
              const lvl = s.skills[sk.id] ?? 0;
              const err = canBuySkill(s, sk.id);
              const maxed = lvl >= sk.max;
              const locked = !!sk.requires && !(s.skills[sk.requires] > 0);
              return (
                <Card key={sk.id} className={cx('p-3', locked && 'opacity-50')} highlight={!err}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-2xl">{sk.emoji}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold">{sk.name}</div>
                        <span className="num text-xs text-ink-dim">
                          {lvl}/{sk.max}
                        </span>
                      </div>
                      <div className="text-xs text-ink-dim">{sk.desc}</div>
                      <div className="mt-2 flex gap-0.5">
                        {Array.from({ length: sk.max }, (_, i) => (
                          <div key={i} className={cx('h-1.5 flex-1 rounded-full', i < lvl ? 'bg-gold' : 'bg-white/[0.08]')} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" className="mt-2 w-full" variant={!err ? 'gold' : 'dark'} disabled={!!err} onClick={() => buy(sk.id)} title={err ?? undefined}>
                    {maxed ? 'Максимум' : locked ? err : `Изучить за ${skillCost(s, sk.id)} реп.`}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stats() {
  const s = useGame((g) => g.s);
  const hist = s.stats.history;
  const nwSeries = useMemo(() => [{ name: 'Капитал', color: '#f5c451', area: true, points: hist.map(([d, v]) => [d, v] as [number, number]) }], [hist]);
  const cmp = useMemo(() => {
    const withInv = hist.filter((h) => h[3] > 0);
    const start = withInv.find((h) => h[2] !== 1) ?? withInv[0];
    if (!start) return null;
    const i0 = withInv.indexOf(start);
    const base = withInv[Math.max(0, i0 - 1)];
    const pts = withInv.slice(Math.max(0, i0 - 1));
    return [
      { name: 'Мой портфель', color: '#22d17b', points: pts.map(([d, , idx]) => [d, (idx / base[2] - 1) * 100] as [number, number]) },
      { name: 'S&P 500', color: '#7c8cff', points: pts.map(([d, , , spy]) => [d, (spy / base[3] - 1) * 100] as [number, number]) },
    ];
  }, [hist]);
  const last = cmp ? [cmp[0].points.at(-1)?.[1] ?? 0, cmp[1].points.at(-1)?.[1] ?? 0] : null;
  const st = s.stats;
  return (
    <div>
      <Card className="p-4">
        <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-dim">Капитал (лог. шкала)</div>
        {hist.length > 2 ? <LineChart series={nwSeries} log /> : <div className="py-10 text-center text-sm text-ink-mute">График появится через несколько игровых недель</div>}
      </Card>
      <Card className="mt-3 p-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[12px] font-bold uppercase tracking-wider text-ink-dim">Портфель против S&P 500</div>
          {last && (
            <div className="flex gap-2 text-xs">
              <span className="text-up">я {fmtPct(last[0] / 100, 1)}</span>
              <span className="text-accent">S&P {fmtPct(last[1] / 100, 1)}</span>
            </div>
          )}
        </div>
        <div className="mb-2 text-[11px] text-ink-mute">Доходность инвестиций, взвешенная по времени (без учёта пополнений), против индекса.</div>
        {cmp && cmp[0].points.length > 2 ? <LineChart series={cmp} percent /> : <div className="py-8 text-center text-sm text-ink-mute">Купи акции или крипту — и сравни себя с рынком</div>}
      </Card>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Время в игре" value={fmtDuration(st.playSeconds)} />
        <Stat label="Кликов" value={fmtNum(st.totalClicks, 0)} sub={`критов ${fmtNum(st.crits, 0)}`} />
        <Stat label="Заработано всего" value={fmtMoney(s.earnedTotal)} sub={`в этой жизни ${fmtMoney(s.earnedLife)}`} />
        <Stat label="Рекорд капитала" value={fmtMoney(st.maxNetWorth)} />
        <Stat label="Дивиденды" value={fmtMoney(st.dividendsTotal)} />
        <Stat label="Аренда" value={fmtMoney(st.rentTotal)} />
        <Stat label="Проценты и купоны" value={fmtMoney(st.interestTotal)} />
        <Stat label="Намайнено" value={`${fmtNum(st.minedBTC, 3)} BTC`} />
        <Stat label="Сделок" value={fmtNum(st.tradesCount, 0)} sub={`сплитов пережито: ${st.splits}`} />
        <Stat label="Лайфстайл" value={fmtMoney(st.lifestyleSpent)} />
        {st.bestTrade && (
          <Stat
            label="Лучшая сделка"
            value={<span className="text-up">+{fmtMoney(st.bestTrade.pnl)}</span>}
            sub={`${ASSET_BY_ID[st.bestTrade.id]?.name ?? st.bestTrade.id} · ${fmtPct(st.bestTrade.pnlPct, 0)} · ${fmtDate(st.bestTrade.day)}`}
          />
        )}
        {st.worstTrade && st.worstTrade.pnl < 0 && (
          <Stat
            label="Худшая сделка"
            value={<span className="text-down">{fmtMoney(st.worstTrade.pnl)}</span>}
            sub={`${ASSET_BY_ID[st.worstTrade.id]?.name ?? st.worstTrade.id} · ${fmtPct(st.worstTrade.pnlPct, 0)} · ${fmtDate(st.worstTrade.day)}`}
          />
        )}
        <Stat label="Заданий выполнено" value={fmtNum(st.questsDone, 0)} />
        <Stat label="Случайных событий" value={fmtNum(st.randomEvents, 0)} sub={`налоговых проверок ${st.audits}`} />
      </div>
    </div>
  );
}

function Overview() {
  const mode = useGame((g) => g.s.mode);
  const startDate = useGame((g) => g.s.startDate);
  const ipos = useGame((g) => g.s.ipos);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-3">
        <NetWorthBreakdown />
        <IpoCard />
      </div>
      <div className="space-y-3">
        <RankCard />
        <div className="text-center text-xs text-ink-mute">
          {mode === 'story' ? '📖 История' : '🧪 Песочница'} · старт {fmtDate(Number(new Date(startDate).getTime() / 86400000))} · жизнь №{ipos + 1}
        </div>
      </div>
    </div>
  );
}

export default function ProfileScreen() {
  const tab = useUi((u) => u.profileTab);
  const setTab = useUi((u) => u.setProfileTab);
  const questsReady = useGame((g) => [...g.s.quests.daily, ...g.s.quests.weekly].some((q) => q.done && !q.claimed) || g.s.dailyReward.lastKey !== localDayKey());
  const skillReady = useGame((g) => SKILLS.some((sk) => !canBuySkill(g.s, sk.id)));
  return (
    <div>
      <Segmented
        size="sm"
        scroll
        className="mb-3"
        value={tab}
        onChange={setTab}
        options={TABS.map((t) => ({ ...t, badge: (t.value === 'quests' && questsReady) || (t.value === 'skills' && skillReady) ? 1 : 0 }))}
      />
      {tab === 'overview' && <Overview />}
      {tab === 'quests' && <Quests />}
      {tab === 'achievements' && <Achievements />}
      {tab === 'skills' && <Skills />}
      {tab === 'stats' && <Stats />}
      {tab === 'settings' && <SettingsPanel />}
      <IpoModal />
    </div>
  );
}
