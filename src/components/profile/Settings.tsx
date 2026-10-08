import { useState } from 'react';
import { BALANCE } from '../../engine/config';
import { LIVE_KEYS } from '../../engine/liveStore';
import { useGame } from '../../store/game';
import { useUi } from '../../store/ui';
import { Button, Card, Modal, Segmented, cx } from '../ui';

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {desc && <div className="text-xs text-ink-dim">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cx('press relative h-8 w-14 rounded-full transition-colors duration-150', on ? 'bg-up' : 'bg-white/[0.12]')}
      aria-pressed={on}
    >
      <span className={cx('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-150', on ? 'left-7' : 'left-1')} />
    </button>
  );
}

export function SettingsPanel() {
  const st = useGame((g) => g.s.settings);
  const set = useGame((g) => g.setSetting);
  const mode = useGame((g) => g.s.mode);
  const live = useGame((g) => g.s.live);
  const reset = useGame((g) => g.resetAll);
  const switchMode = useGame((g) => g.switchMode);
  const open = useUi((u) => u.open);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-3">
      <Card className="divide-y divide-white/[0.05] px-4">
        <Row title="Звук">
          <Toggle on={st.sound} onChange={(v) => set('sound', v)} />
        </Row>
        <Row title="Вибрация" desc="На телефонах с поддержкой">
          <Toggle on={st.vibration} onChange={(v) => set('vibration', v)} />
        </Row>
        <Row title="Частицы при клике">
          <Toggle on={st.particles} onChange={(v) => set('particles', v)} />
        </Row>
      </Card>
      <Card className="px-4 py-3">
        <div className="text-sm font-semibold">Скорость времени</div>
        <div className="mb-2 text-xs text-ink-dim">Сколько реального времени длится игровой день. {live && 'В живом режиме время идёт как в реальности.'}</div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {BALANCE.speeds.map((s) => (
            <button
              key={s.id}
              disabled={live}
              onClick={() => set('speed', s.id)}
              className={cx('press h-10 rounded-xl text-xs font-semibold', st.speed === s.id ? 'bg-gold-soft text-gold ring-gold' : 'bg-white/[0.04] text-ink-dim', live && 'opacity-40')}
            >
              {s.id === 'pause' ? '⏸' : s.secPerDay >= 60 ? '1 мин' : `${s.secPerDay} с`}
            </button>
          ))}
        </div>
      </Card>
      <Card className="px-4 py-3">
        <div className="mb-2 text-sm font-semibold">Формат чисел</div>
        <Segmented
          size="sm"
          value={st.numberFormat}
          onChange={(v) => set('numberFormat', v)}
          options={[
            { value: 'short', label: '$1.23M' },
            { value: 'scientific', label: '1.23e6' },
            { value: 'full', label: '1 230 000' },
          ]}
        />
      </Card>
      <Card className="px-4 py-3">
        <div className="text-sm font-semibold">Налог на прибыль</div>
        <div className="mb-2 text-xs text-ink-dim">Исторический: ставка США 35% до 2018 и 21% после реформы Трампа (TCJA)</div>
        <Segmented
          size="sm"
          value={st.taxMode}
          onChange={(v) => set('taxMode', v)}
          options={[
            { value: 'historical', label: 'Исторический' },
            { value: 'custom', label: 'Свой' },
          ]}
        />
        {st.taxMode === 'custom' && (
          <div className="mt-3 flex items-center gap-3">
            <input type="range" min={0} max={0.6} step={0.01} value={st.taxRate} onChange={(e) => set('taxRate', Number(e.target.value))} className="flex-1 accent-[#f5c451]" />
            <span className="num w-12 text-right text-sm font-bold">{Math.round(st.taxRate * 100)}%</span>
          </div>
        )}
      </Card>
      <Card className="px-4">
        <Row title="Живой режим: реальные котировки" desc={`CoinGecko ${LIVE_KEYS.coingecko ? '✓ ключ' : '— без ключа'} · Finnhub ${LIVE_KEYS.finnhub ? '✓ ключ' : '— без ключа'}. Без API — симуляция.`}>
          <Toggle on={st.liveApi} onChange={(v) => set('liveApi', v)} />
        </Row>
      </Card>
      <Card className="space-y-2 p-4">
        <div className="text-sm font-semibold">Режим игры</div>
        <div className="text-xs text-ink-dim">«История» — старт 1 января 2009. «Песочница» — отдельное сохранение со стартом в любом году.</div>
        <div className="flex gap-2">
          <Button className="flex-1" variant={mode === 'story' ? 'gold' : 'ghost'} onClick={() => switchMode('story')}>
            📖 История
          </Button>
          <Button className="flex-1" variant={mode === 'sandbox' ? 'gold' : 'ghost'} onClick={() => (mode === 'sandbox' ? open({ type: 'sandbox' }) : switchMode('sandbox'))}>
            🧪 Песочница
          </Button>
        </div>
        {mode === 'sandbox' && (
          <Button className="w-full" variant="outline" onClick={() => open({ type: 'sandbox' })}>
            Новая песочница с другим годом
          </Button>
        )}
      </Card>
      <Card className="space-y-2 p-4">
        <div className="text-sm font-semibold">Сохранение</div>
        <div className="text-xs text-ink-dim">Автосейв каждые {BALANCE.autosaveSec} секунд в браузере. Перенести прогресс — через экспорт.</div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => open({ type: 'save' })}>
            💾 Экспорт / импорт
          </Button>
          <Button className="flex-1" variant="red" onClick={() => setConfirm(true)}>
            Сбросить
          </Button>
        </div>
      </Card>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Сбросить прогресс?">
        <div className="text-sm text-ink-dim">Текущее сохранение режима «{mode === 'story' ? 'История' : 'Песочница'}» будет удалено без возможности восстановления (включая репутацию и достижения).</div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => setConfirm(false)}>
            Отмена
          </Button>
          <Button
            className="flex-1"
            variant="red"
            onClick={() => {
              setConfirm(false);
              reset();
            }}
          >
            Сбросить
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export function SaveModal() {
  const modal = useUi((u) => u.modal);
  const close = useUi((u) => u.close);
  const exportSave = useGame((g) => g.exportSave);
  const importSave = useGame((g) => g.importSave);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const open = modal?.type === 'save';
  const data = open ? exportSave() : '';
  return (
    <Modal open={open} onClose={close} title="💾 Экспорт и импорт">
      <div className="text-xs text-ink-dim">Скопируй строку, чтобы перенести игру на другое устройство.</div>
      <textarea readOnly value={data} className="mt-2 h-24 w-full resize-none rounded-xl bg-white/[0.04] p-2 font-mono text-[10px] text-ink-dim outline-none" />
      <div className="mt-2 flex gap-2">
        <Button className="flex-1" onClick={() => void navigator.clipboard?.writeText(data)}>
          Скопировать
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            const blob = new Blob([data], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `empire-from-zero-${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
          }}
        >
          Скачать файл
        </Button>
      </div>
      <div className="mt-4 text-sm font-semibold">Импорт</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Вставь строку сохранения EFZ1:…" className="mt-2 h-24 w-full resize-none rounded-xl bg-white/[0.04] p-2 font-mono text-[10px] outline-none ring-1 ring-white/[0.06] focus:ring-gold/50" />
      {err && <div className="mt-1 text-xs text-down">{err}</div>}
      <Button
        variant="gold"
        className="mt-2 w-full"
        disabled={!text.trim()}
        onClick={() => {
          try {
            importSave(text);
            setText('');
            setErr('');
            close();
          } catch (e) {
            setErr((e as Error).message || 'Не удалось прочитать сохранение');
          }
        }}
      >
        Загрузить сохранение
      </Button>
    </Modal>
  );
}

export function SandboxModal() {
  const modal = useUi((u) => u.modal);
  const close = useUi((u) => u.close);
  const start = useGame((g) => g.startSandbox);
  const [year, setYear] = useState(2008);
  return (
    <Modal open={modal?.type === 'sandbox'} onClose={close} title="🧪 Песочница">
      <div className="text-sm text-ink-dim">Начни в любом году с нуля. Отдельное сохранение — история не пострадает.</div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {BALANCE.sandboxYears.map((y) => (
          <button key={y} onClick={() => setYear(y)} className={cx('press h-12 rounded-xl text-sm font-bold', year === y ? 'bg-gold-soft text-gold ring-gold' : 'bg-white/[0.04]')}>
            {y}
          </button>
        ))}
      </div>
      <div className="mt-3 text-xs text-ink-mute">
        {year === 2000 && 'Пик пузыря доткомов: Nasdaq вот-вот рухнет на 78%.'}
        {year === 2003 && 'Дно после доткомов: Apple стоит копейки, iPod только набирает ход.'}
        {year === 2008 && 'Год Великой рецессии: Lehman Brothers, ипотечный кризис, генезис-блок биткоина в январе 2009.'}
        {year === 2010 && 'Mt.Gox, первая пицца за биткоины и IPO Tesla.'}
        {year === 2013 && 'Биткоин впервые дороже $1 000, эпоха нулевых ставок.'}
        {year === 2016 && 'Brexit, второй халвинг, Nvidia начинает разгон.'}
        {year === 2020 && 'COVID-обвал, нефть в минусе, бум Tesla и крипты.'}
        {year === 2022 && 'Медвежий рынок: LUNA, FTX, ставки ФРС и ChatGPT в конце года.'}
      </div>
      <Button variant="gold" size="lg" className="mt-4 w-full" onClick={() => start(year)}>
        Начать {year}
      </Button>
    </Modal>
  );
}
