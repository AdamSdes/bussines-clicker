// Страница /styleguide: дизайн-система «Деловая газета + каталог реальных вещей».
// Все примеры — на настоящих данных игры (конфиги и исторические котировки).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ASSET_BY_ID, BIZ_BY_ID, NEWS } from '../engine/config';
import { milestoneMult, nextMilestone, managerCost, unitCost } from '../engine/economy';
import { fmtMoney, fmtPrice } from '../engine/format';
import { candles, changeOver, closes, loadMarket, priceAt } from '../engine/market';
import { dayNum, fmtDate, fmtWeekdayFull } from '../engine/time';
import type { BusinessDef } from '../engine/types';
import { sfx } from '../audio/sfx';
import { imageCoverage } from '../design/images';
import * as I from '../design/icons';
import { Bar, Delta, KV, Note, Photo, cx, type AssetKind } from '../design/primitives';
import { BusinessRow, LotCard, QuoteTable, type QuoteRowData } from '../design/rows';
import { Clip, Diploma, FrontPage, FrontPageOverlay, Masthead, Nav, NewsColumns, Tape, type FrontPageProps, type NavId, type TapeItem } from '../design/paper';
import { ClickObject, OrderTicket, PriceChart, type ChartCandle } from '../design/trade';

type Edition = 'morning' | 'evening';

const QUOTE_DAY = dayNum('2022-11-09');
const CRASH_DAY = dayNum('2020-03-16');
/** Момент закрытия торгов в этот день */
const QUOTE_T = QUOTE_DAY + 0.9999;
const CRASH_T = CRASH_DAY + 0.9999;

const QUOTE_IDS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'KO', 'GME', 'SPY', 'XAU', 'WTI', 'EURUSD', 'BTC', 'ETH', 'SOL', 'FTT', 'LUNA'];

const SECTIONS = [
  ['palette', 'Палитра'],
  ['type', 'Шрифты'],
  ['buttons', 'Кнопки'],
  ['masthead', 'Шапка'],
  ['work', 'Работа'],
  ['business', 'Строка бизнеса'],
  ['quotes', 'Строка акции'],
  ['asset', 'Экран актива'],
  ['lots', 'Карточка лота'],
  ['news', 'Новости'],
  ['awards', 'Достижения'],
  ['notes', 'Сводки'],
  ['front', 'Газетный разворот'],
  ['motion', 'Движение'],
] as const;

function Section({ id, n, title, lead, children }: { id: string; n: number; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="sg-section">
      <div className="sg-section__head">
        <span className="np-label np-num">§ {String(n).padStart(2, '0')}</span>
        <h2 className="np-h1">{title}</h2>
        {lead && <p className="np-deck sg-lead">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------- данные ---------- */

function bizNet(def: BusinessDef, level: number): number {
  if (level <= 0) return 0;
  const e = def.expenses;
  const pre = def.revenue * level * milestoneMult(level) * (1 - e.cogs - e.rent - e.salaries);
  return (pre * (1 - 0.35)) / def.cycleSec;
}

function quoteRow(id: string, day: number): QuoteRowData {
  const a = ASSET_BY_ID[id];
  const ghostDay = a.ghost ? dayNum(a.ghost) : Infinity;
  const ghost = day >= ghostDay;
  const t = day + 0.9999;
  const p = priceAt(id, t) ?? 0;
  return {
    id,
    kind: a.kind as AssetKind,
    name: a.name.replace(/\s*\(.*\)$/, ''),
    price: fmtPrice(p),
    change: changeOver(id, t, 1),
    spark: closes(id, day - 30, day).map(([, c]) => c),
    ghost,
    note: ghost ? `${id} · обвал ${fmtDate(ghostDay)}` : undefined,
  };
}

function aggregate(c: ChartCandle[], days: number): ChartCandle[] {
  if (days <= 1) return c;
  const out: ChartCandle[] = [];
  for (const x of c) {
    const last = out[out.length - 1];
    if (last && Math.floor(last.time / 86400 / days) === Math.floor(x.time / 86400 / days)) {
      last.high = Math.max(last.high, x.high);
      last.low = Math.min(last.low, x.low);
      last.close = x.close;
    } else out.push({ ...x });
  }
  return out;
}

const LOTS = [
  { id: 'casio', photo: 'lot/casio', title: 'Casio F-91W', year: 1989, facts: 'Япония · кварц', price: 20, effect: '+0,2% к шансу крупного заказа', state: 'owned' },
  { id: 'speedmaster', photo: 'lot/speedmaster', title: 'Omega Speedmaster Professional', year: 1957, facts: 'Швейцария · ручной завод', price: 7_000, effect: '+0,5% к шансу крупного заказа', state: 'buy' },
  { id: 'submariner', photo: 'lot/submariner', title: 'Rolex Submariner', year: 1953, facts: 'Швейцария · автоподзавод', price: 10_500, effect: '−1% к цене новых точек', state: 'buy' },
  { id: 'nautilus', photo: 'lot/nautilus', title: 'Patek Philippe Nautilus 5711', year: 1976, facts: 'Швейцария · снят с производства в 2021', price: 150_000, effect: '+1% к шансу крупного заказа, −1% к цене точек', state: 'short' },
  { id: 'corolla', photo: 'lot/corolla', title: 'Toyota Corolla', year: 1966, facts: 'Япония · самый продаваемый автомобиль', price: 20_000, effect: '+10% к оплате смены', state: 'owned' },
  { id: 'porsche911', photo: 'lot/porsche911', title: 'Porsche 911 Turbo S', year: 1963, facts: 'Германия · легенда автоспорта', price: 230_000, effect: '+25% к оплате смены', state: 'short' },
  { id: 'chiron', photo: 'lot/chiron', title: 'Bugatti Chiron', year: 2016, facts: 'Франция · 500 экземпляров', price: 3_000_000, effect: '+5% к прибыли бизнесов', state: 'short' },
  { id: 'gulfstream', photo: 'lot/gulfstream', title: 'Gulfstream G700', year: 2024, facts: 'США · дальность 14 350 км', price: 78_000_000, effect: '+4% к прибыли, +1 час офлайн-дохода', state: 'short' },
] as const;

const DEMO_CASH = 21_600;

/* ---------- страница ---------- */

export function Styleguide() {
  const [edition, setEdition] = useState<Edition>(() => (new URLSearchParams(location.search).get('edition') === 'evening' ? 'evening' : 'morning'));
  const [ready, setReady] = useState(false);
  const [logos, setLogos] = useState(true);
  const [nav, setNav] = useState<NavId>('work');
  const [balance, setBalance] = useState(DEMO_CASH);
  const [front, setFront] = useState<'million' | 'ipo' | 'crash'>('crash');
  const [frontOpen, setFrontOpen] = useState(() => location.hash === '#front-open');
  const [range, setRange] = useState(180);

  useEffect(() => {
    document.documentElement.dataset.edition = edition;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', edition === 'evening' ? '#161513' : '#f4f1ea');
  }, [edition]);

  useEffect(() => {
    void loadMarket().then(() => setReady(true));
  }, []);

  const cov = imageCoverage();

  return (
    <div className="np sg">
      <div className="sg-top">
        <div className="sg-wrap sg-top__row">
          <span className="np-label" style={{ color: 'var(--ink)' }}>
            Руководство по стилю
          </span>
          <div className="np-tabs sg-edition" role="tablist" aria-label="Выпуск">
            <button className="np-tab" role="tab" aria-selected={edition === 'morning'} onClick={() => setEdition('morning')}>
              Утренний выпуск
            </button>
            <button className="np-tab" role="tab" aria-selected={edition === 'evening'} onClick={() => setEdition('evening')}>
              Вечерний выпуск
            </button>
          </div>
        </div>
      </div>

      <div className="sg-wrap">
        <header className="sg-hero">
          <div className="np-front__flag">Империя с нуля</div>
          <div className="np-front__dateline">
            <span>Руководство по стилю</span>
            <span>Деловая газета + каталог реальных вещей</span>
            <span className="np-num">Версия 1</span>
          </div>
          <p className="np-deck sg-hero__deck">
            Бумага, чернила и линии в 1 пиксель. Три смысловых цвета: прибыль, убыток и «долларовый» зелёный. Заголовки набраны серифом, интерфейс — гротеском, все
            числа — моноширинным шрифтом с табличными цифрами. Предметы показаны реальными фотографиями, данные — таблицами.
          </p>
          <nav className="sg-toc" aria-label="Содержание">
            {SECTIONS.map(([id, name], i) => (
              <a key={id} href={`#${id}`}>
                <span className="np-num">{String(i + 1).padStart(2, '0')}</span> {name}
              </a>
            ))}
          </nav>
          <div className="sg-status">
            <KV k="Фотографии в /public/images" v={`${cov.have} из ${cov.total}`} />
            <p className="np-small" style={{ margin: '4px 0 0' }}>
              {cov.have < cov.total
                ? 'Пока фото не скачаны, вместо них — заглушки цвета бумаги с названием. Их заполнит `npm run images` (Wikimedia Commons, Pexels, Unsplash).'
                : 'Все фото скачаны.'}
            </p>
          </div>
        </header>

        {/* 1. Палитра */}
        <Section id="palette" n={1} title="Палитра" lead="Шесть цветов и ни одного больше. Глубина создаётся линиями и отступами, а не тенями.">
          <div className="sg-swatches">
            {[
              ['Бумага', '#F4F1EA', 'Фон всех экранов', 'var(--paper)'],
              ['Чернила', '#141414', 'Текст, рамки, линейки', 'var(--ink)'],
              ['Линия', '#D9D3C7', 'Разделители 1px', 'var(--rule)'],
              ['Прибыль', '#0B7A3E', 'Рост, доход, «Купить»', 'var(--gain)'],
              ['Убыток', '#B3261E', 'Падение, расходы, «Продать»', 'var(--loss)'],
              ['Доллар', '#1F3D2B', 'Единственный акцент: главная кнопка', 'var(--money)'],
            ].map(([name, hex, role, v]) => (
              <div key={name} className="sg-swatch">
                <div className="sg-swatch__chip" style={{ background: v }} />
                <div className="np-h3">{name}</div>
                <div className="np-num np-small">{hex}</div>
                <div className="np-small">{role}</div>
              </div>
            ))}
          </div>
          <div className="sg-evening-row">
            <div className="np-label">Вечерний выпуск</div>
            <div className="sg-evening">
              <div className="sg-evening__chip" style={{ background: '#161513', color: '#f4f1ea' }}>
                <b>Графит</b> <span className="np-num">#161513</span>
              </div>
              <div className="sg-evening__chip" style={{ background: '#161513', color: '#f4f1ea' }}>
                <b>Бумажный текст</b> <span className="np-num">#F4F1EA</span>
              </div>
              <div className="sg-evening__chip" style={{ background: '#161513', color: '#0b7a3e' }}>
                <b>Прибыль</b> <span className="np-num">+4,21%</span>
              </div>
              <div className="sg-evening__chip" style={{ background: '#161513', color: '#b3261e' }}>
                <b>Убыток</b> <span className="np-num">−3,08%</span>
              </div>
            </div>
            <p className="np-small">Те же акценты, без свечения. Линии — бумажный цвет с прозрачностью 16%. Переключатель выпусков — вверху страницы.</p>
          </div>
        </Section>

        {/* 2. Шрифты */}
        <Section id="type" n={2} title="Шрифты" lead="Три гарнитуры из Google Fonts, упакованные в сборку — игра не делает внешних запросов.">
          <div className="sg-type">
            <div className="sg-type__spec">
              <div className="np-label">Заголовки · Source Serif 4</div>
              <div className="np-display" style={{ fontSize: 'clamp(36px, 7vw, 56px)' }}>
                Биткоин впервые дороже $1 000
              </div>
              <div className="np-h1">Курьер из 2009 года открыл первую кофейню</div>
              <div className="np-h2">ФРС снизила ставку до нуля</div>
              <div className="np-h3">Шаурмичная на углу · 25 точек</div>
              <p className="np-body" style={{ margin: 0 }}>
                Основной текст новостей и описаний набран серифом: 16 пикселей, интерлиньяж 1,55. Абзацы короткие, как в деловой газете.
              </p>
            </div>
            <div className="sg-type__spec">
              <div className="np-label">Интерфейс · IBM Plex Sans</div>
              <div style={{ fontSize: 15 }}>Купить точку · Нанять управляющего · Продать позицию</div>
              <div className="np-label" style={{ marginTop: 8 }}>
                Подпись раздела · 11 px, капитель
              </div>
              <div className="np-small">Пояснение мелким текстом: 13 пикселей, 66% чернил.</div>
            </div>
            <div className="sg-type__spec">
              <div className="np-label">Числа, цены, тикеры · IBM Plex Mono, tabular-nums</div>
              <table className="sg-numtable np-num">
                <tbody>
                  <tr>
                    <td>AAPL</td>
                    <td>$138.88</td>
                    <td className="np-loss">−0.83%</td>
                  </tr>
                  <tr>
                    <td>BTC</td>
                    <td>$16,612.00</td>
                    <td className="np-loss">−14.40%</td>
                  </tr>
                  <tr>
                    <td>KO</td>
                    <td>$59.11</td>
                    <td className="np-gain">+1.11%</td>
                  </tr>
                  <tr>
                    <td>Баланс</td>
                    <td>$1.23T</td>
                    <td className="np-gain">+$4.10B/с</td>
                  </tr>
                </tbody>
              </table>
              <p className="np-small" style={{ margin: '6px 0 0' }}>
                Цифры одной ширины — столбцы не «пляшут», пока меняется баланс.
              </p>
            </div>
          </div>
        </Section>

        {/* 3. Кнопки */}
        <Section id="buttons" n={3} title="Кнопки и поля" lead="Текстовые подписи, рамка 1px, скругление 2px. Нажатие — уменьшение до 0,97 за 150 мс, без пружин.">
          <div className="sg-row">
            <button className="np-btn np-btn--primary">
              Купить точку <span className="np-num">$5.40K</span>
            </button>
            <button className="np-btn">Нанять управляющего</button>
            <button className="np-btn np-btn--buy">Купить</button>
            <button className="np-btn np-btn--sell">Продать</button>
            <button className="np-btn np-btn--quiet">Подробнее</button>
            <button className="np-btn" disabled>
              Не хватает <span className="np-num">$1,200</span>
            </button>
            <button className="np-btn np-btn--sm">×10</button>
            <button className="np-btn np-btn--sm">×100</button>
            <button className="np-btn np-btn--sm">Макс.</button>
          </div>
          <div className="np-tabs" role="tablist" style={{ marginTop: 20 }}>
            {['Акции', 'Фонды', 'Товары', 'Крипта', 'Майнинг', 'Недвижимость', 'Банк'].map((t, i) => (
              <button key={t} className="np-tab" role="tab" aria-selected={i === 0}>
                {t}
              </button>
            ))}
          </div>
          <div className="sg-row" style={{ marginTop: 20, maxWidth: 420 }}>
            <input className="np-input" defaultValue="25 000" aria-label="Сумма вклада" />
          </div>
          <div className="sg-icons">
            <div className="np-label" style={{ width: '100%' }}>
              Иконки · Phosphor Light, только навигация и служебные кнопки
            </div>
            {(
              [
                ['Briefcase', I.Briefcase],
                ['Storefront', I.Storefront],
                ['ChartLineUp', I.ChartLineUp],
                ['Watch', I.Watch],
                ['User', I.User],
                ['Gear', I.Gear],
                ['Pause', I.Pause],
                ['Play', I.Play],
                ['FastForward', I.FastForward],
                ['Newspaper', I.Newspaper],
                ['SpeakerHigh', I.SpeakerHigh],
                ['X', I.X],
                ['ArrowLeft', I.ArrowLeft],
              ] as const
            ).map(([n, Icon]) => (
              <span key={n} className="sg-icon">
                <Icon size={24} weight="light" />
                <span className="np-small">{n}</span>
              </span>
            ))}
          </div>
        </Section>

        {/* 4. Шапка */}
        <Section id="masthead" n={4} title="Шапка и навигация" lead="Шапка как у газеты: дата игрового дня серифом, баланс крупно, доход в секунду мелко, линия снизу.">
          <div className="sg-device">
            <Masthead
              date={fmtDate(QUOTE_DAY, true)}
              weekday={fmtWeekdayFull(QUOTE_DAY)}
              balance={balance}
              format={(v) => fmtMoney(v)}
              perSec="+$184.20/с"
              right={
                <>
                  <button className="np-icon-btn" aria-label="Пауза">
                    <I.Pause size={20} weight="light" />
                  </button>
                  <button className="np-icon-btn" aria-label="Новости">
                    <I.Newspaper size={20} weight="light" />
                  </button>
                  <button className="np-icon-btn" aria-label="Настройки">
                    <I.Gear size={20} weight="light" />
                  </button>
                </>
              }
            />
            <Tape label="Рынки" items={ready ? tapeItems(QUOTE_DAY) : []} />
            <div className="sg-device__body">
              <button className="np-btn np-btn--sm" onClick={() => setBalance((b) => b + 1250)}>
                Начислить <span className="np-num">$1,250</span>
              </button>
              <span className="np-small">— баланс меняется плавно, за 220 мс</span>
            </div>
            <Nav current={nav} onChange={setNav} dots={{ business: true, profile: true }} />
          </div>
        </Section>

        {/* 5. Работа */}
        <Section
          id="work"
          n={5}
          title="Работа"
          lead="Объект клика — реальный предмет профессии на прозрачном фоне. Меняется с карьерой: смартфон курьера, эспрессо-машина, ноутбук, пачки купюр, чековая книжка."
        >
          <div className="sg-work">
            <ClickObject
              photo="job/barista"
              alt="Эспрессо-машина"
              caption="Бариста · $15 за смену-клик"
              onPress={() => {
                sfx.tick();
                setBalance((b) => b + 15);
                return '+$15';
              }}
            />
            <div className="sg-career">
              <div className="np-label">Карьера</div>
              {[
                ['job/courier', 'Курьер', '$12'],
                ['job/barista', 'Бариста', '$15'],
                ['job/freelancer', 'Фрилансер', '$45'],
                ['job/top_manager', 'Топ-менеджер', '$350'],
                ['job/ceo', 'CEO', '$1,500'],
              ].map(([k, n, w]) => (
                <div key={k} className="sg-career__step">
                  <Photo k={k} alt={n} cutout style={{ width: 48, height: 48 }} />
                  <span>{n}</span>
                  <span className="np-num np-small">{w}/клик</span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <div className="np-kv">
                  <span>До повышения: опыт</span>
                  <span>312 / 500</span>
                </div>
                <Bar value={312 / 500} />
              </div>
            </div>
          </div>
        </Section>

        {/* 6. Бизнесы */}
        <Section id="business" n={6} title="Строка бизнеса" lead="Список, а не плитки. Фото 72×72 меняется на вехах: одна точка → улица → сеть. Прогресс цикла — линия в 2 пикселя.">
          <div className="sg-narrow">
            {bizRows(balance).map((r) => (
              <BusinessRow key={r.name} {...r} />
            ))}
          </div>
        </Section>

        {/* 7. Котировки */}
        <Section id="quotes" n={7} title="Строка акции" lead="Плотная таблица, как у брокера: инструмент, цена, изменение за день, спарклайн за месяц. Данные игры на 9 ноября 2022 — день краха FTX.">
          <div className="sg-row" style={{ marginBottom: 10 }}>
            <div className="np-tabs" role="tablist" aria-label="Логотипы">
              <button className="np-tab" role="tab" aria-selected={logos} onClick={() => setLogos(true)}>
                useRealLogos: true
              </button>
              <button className="np-tab" role="tab" aria-selected={!logos} onClick={() => setLogos(false)}>
                useRealLogos: false
              </button>
            </div>
          </div>
          {ready ? (
            <QuoteTable
              rows={QUOTE_IDS.map((id) => quoteRow(id, QUOTE_DAY))}
              logos={logos}
              caption="Логотипы компаний — SVG с Wikimedia Commons (появятся после npm run images), до тех пор и при false — тикер в рамке. Монеты — набор cryptocurrency-icons (CC0). Пунктир — «призрак»: актив, который исторически обвалился."
            />
          ) : (
            <p className="np-small">Загружаем котировки…</p>
          )}
        </Section>

        {/* 8. Экран актива */}
        <Section id="asset" n={8} title="Экран актива" lead="Полноценный свечной график, заявка «Купить / Продать» и позиция — как в настоящем брокерском приложении.">
          {ready && <AssetDemo edition={edition} range={range} setRange={setRange} />}
        </Section>

        {/* 9. Лоты */}
        <Section id="lots" n={9} title="Карточка лота" lead="Лайфстайл — аукционный каталог: предмет на нейтральном фоне, номер лота, название, год, цена моноширинным шрифтом.">
          <div className="np-lots">
            {LOTS.map((l, i) => (
              <LotCard
                key={l.id}
                no={i + 1}
                photo={l.photo}
                title={l.title}
                year={l.year}
                facts={l.facts}
                price={`$${l.price.toLocaleString('en-US')}`}
                effect={l.effect}
                state={l.state === 'short' ? (balance >= l.price ? 'buy' : 'short') : l.state}
                shortBy={`Не хватает ${fmtMoney(l.price - balance)}`}
              />
            ))}
          </div>
        </Section>

        {/* 10. Новости */}
        <Section id="news" n={10} title="Новости" lead="Бегущая строка — полоса котировок. Полный экран новостей — колонки газеты с датой.">
          {ready && <Tape label="Новости" items={tapeItems(QUOTE_DAY, true)} />}
          <div style={{ marginTop: 16 }}>
            <NewsColumns items={newsAround(QUOTE_DAY)} />
          </div>
        </Section>

        {/* 11. Достижения */}
        <Section id="awards" n={11} title="Достижения" lead="Не значки, а газетные вырезки и грамоты. Неполученные — пунктирная рамка.">
          <div className="sg-clips">
            <Clip dateline="14 марта 2011 · с. 1" head="Первый миллион" text="Капитал игрока впервые превысил $1 млн. Начинал курьером в январе 2009-го." />
            <Clip dateline="12 мая 2022 · Крипторынок" head="Призрак Terra" text="Держал LUNA в день краха: монета потеряла 99,9% за неделю." />
            <Clip
              dateline=""
              head="Diamond hands"
              text="Держи BTC с пика ноября 2021 до конца 2022 года."
              locked
              progress="Осталось держать: 52 дня"
            />
            <Diploma
              title="Звонок на NYSE"
              recipient="основателю компании «Империя»"
              text="За вывод компании на биржу и капитализацию свыше $1 млрд."
              date="2 июня 2014"
              sign="Редакция"
            />
          </div>
        </Section>

        {/* 12. Сводки */}
        <Section id="notes" n={12} title="Сводки" lead="Уведомления — короткие заметки с рубрикой. Цвет только у полосы слева и у рубрики.">
          <div className="sg-notes">
            <Note label="Сделка исполнена" tone="gain">
              Куплено <span className="np-num">0.42 BTC</span> по <span className="np-num">$16,612.00</span>
            </Note>
            <Note label="Налоговая проверка" tone="loss">
              Штраф <span className="np-num">$4,200</span>. В следующий раз ведите учёт аккуратнее.
            </Note>
            <Note label="Новость">FTX остановила вывод средств, токен FTT обвалился на 75%</Note>
          </div>
        </Section>

        {/* 13. Разворот */}
        <Section
          id="front"
          n={13}
          title="Газетный разворот"
          lead="Важные моменты — первый миллион, IPO, обвал рынка — выходят «на первой полосе» на весь экран. Вместо конфетти."
        >
          <div className="sg-row" style={{ marginBottom: 12 }}>
            <div className="np-tabs" role="tablist" aria-label="Повод">
              {(
                [
                  ['million', 'Первый миллион'],
                  ['ipo', 'IPO'],
                  ['crash', 'Обвал рынка'],
                ] as const
              ).map(([id, n]) => (
                <button key={id} className="np-tab" role="tab" aria-selected={front === id} onClick={() => setFront(id)}>
                  {n}
                </button>
              ))}
            </div>
            <button className="np-btn np-btn--primary" onClick={() => setFrontOpen(true)}>
              Открыть на весь экран
            </button>
          </div>
          <div className="sg-front-preview">{ready && <FrontPage {...frontPages()[front]} />}</div>
        </Section>

        {/* 14. Движение */}
        <Section id="motion" n={14} title="Движение" lead="150–250 мс, ease-out, без пружин и отскоков. prefers-reduced-motion выключает всё, кроме смены чисел.">
          <table className="np-quotes sg-motion">
            <thead>
              <tr>
                <th>Что</th>
                <th>Как</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Нажатие на кнопку и предмет', 'scale 0,97', '150 мс'],
                ['Заработок за клик', 'число всплывает на 22 px и гаснет', '600 мс'],
                ['Счётчик баланса', 'плавная смена значения', '220 мс'],
                ['Окно, сводка, разворот', 'появление из прозрачности', '200 мс'],
                ['Прогресс цикла', 'линейное заполнение', '150 мс'],
                ['Полоса котировок', 'равномерная прокрутка', '70 с на круг'],
              ].map(([a, b, c]) => (
                <tr key={a}>
                  <td style={{ fontFamily: 'var(--sans)', whiteSpace: 'normal' }}>{a}</td>
                  <td style={{ fontFamily: 'var(--sans)', whiteSpace: 'normal' }}>{b}</td>
                  <td>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="np-small" style={{ marginTop: 10 }}>
            Запрещено: свечение, размытие, градиенты, тени, пульсация, подпрыгивание, конфетти и бесконечные частицы.
          </p>
        </Section>

        <footer className="sg-footer">
          <hr className="np-rule-double" />
          <p className="np-small">
            «Империя с нуля» · руководство по стилю. Шрифты: Source Serif 4, IBM Plex Sans, IBM Plex Mono (SIL Open Font License). Иконки: Phosphor (MIT). Логотипы монет:
            cryptocurrency-icons (CC0). Графики:{' '}
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
              TradingView Lightweight Charts
            </a>{' '}
            (Apache 2.0).
          </p>
        </footer>
      </div>

      <FrontPageOverlay open={frontOpen && ready} onClose={() => setFrontOpen(false)}>
        {ready && <FrontPage {...frontPages()[front]} />}
      </FrontPageOverlay>
    </div>
  );
}

/* ---------- примеры ---------- */

function bizRows(cash: number) {
  const m = { discount: 0, managerDiscount: 0 };
  const row = (id: string, level: number, managed: boolean, progress: number) => {
    const def = BIZ_BY_ID[id];
    const cost = unitCost(def, level, m);
    const next = nextMilestone(level);
    const net = bizNet(def, level);
    return {
      photo: `biz/${id}/${level >= 100 ? 3 : level >= 25 ? 2 : 1}`,
      name: def.name,
      level: level ? (
        <>
          <span className="np-num">{level}</span> {plural(level, 'точка', 'точки', 'точек')}
        </>
      ) : (
        'Нет точек'
      ),
      income: level ? (
        <span className="np-num">{fmtMoney(net)}/с</span>
      ) : (
        <>
          <span className="np-num">{fmtMoney(bizNet(def, 1))}/с</span> с точки
        </>
      ),
      detail: level ? (
        <>
          {managed ? 'Управляющий работает' : 'Цикл запускается вручную'}
          {next && (
            <>
              {' · '}до ×2: <span className="np-num">{next - level}</span>
            </>
          )}
        </>
      ) : (
        'Откроется после покупки первой точки'
      ),
      progress,
      cost: fmtMoney(cost),
      canBuy: cash >= cost,
      locked: level === 0 && cash < cost,
      extra:
        level > 0 && !managed ? (
          <button className="np-btn np-btn--quiet np-btn--sm" disabled={cash < managerCost(def, m)}>
            Управляющий <span className="np-num">{fmtMoney(managerCost(def, m))}</span>
          </button>
        ) : undefined,
    };
  };
  return [row('coffee_cart', 18, true, 0.64), row('shawarma', 27, true, 0.3), row('car_wash', 4, false, 0.82), row('gas_station', 0, false, 0)];
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

function tapeItems(day: number, news = false): TapeItem[] {
  const t = day + 0.9999;
  const q = (id: string): TapeItem => ({ kind: 'quote', id, price: fmtPrice(priceAt(id, t) ?? 0), change: changeOver(id, t, 1) });
  const heads = NEWS.filter((n) => dayNum(n.d) <= day)
    .slice(-3)
    .reverse()
    .map((n): TapeItem => ({ kind: 'news', text: n.t }));
  if (news) return [heads[0], q('BTC'), heads[1], q('SPY'), heads[2], q('FTT')];
  return [q('SPY'), q('AAPL'), q('NVDA'), q('BTC'), q('ETH'), q('XAU'), q('WTI'), heads[0]];
}

function newsAround(day: number) {
  return NEWS.filter((n) => dayNum(n.d) <= day)
    .slice(-7)
    .reverse()
    .map((n) => ({
      date: fmtDate(dayNum(n.d), true),
      headline: n.t,
      big: n.big,
      tag: n.assets?.slice(0, 3).join(', '),
    }));
}

function AssetDemo({ edition, range, setRange }: { edition: Edition; range: number; setRange: (n: number) => void }) {
  const id = 'BTC';
  const day = QUOTE_DAY;
  const price = priceAt(id, QUOTE_T) ?? 0;
  const data = useMemo(() => aggregate(candles(id, day - range, QUOTE_T), range > 800 ? 7 : range > 400 ? 3 : 1), [range, day]);
  const qty = 0.42;
  const avg = 41_200;
  const value = qty * price;
  const pl = value - qty * avg;
  return (
    <div className="sg-asset">
      <div className="sg-asset__main">
        <div className="sg-asset__head">
          <div>
            <div className="np-label">Bitcoin · BTC · Крипта</div>
            <div className="sg-asset__price np-num">{fmtPrice(price)}</div>
            <div className="np-small">
              <Delta value={changeOver(id, QUOTE_T, 1)} /> за день · <Delta value={changeOver(id, QUOTE_T, 365)} /> за год
            </div>
          </div>
          <div className="np-small np-num" style={{ textAlign: 'right' }}>
            {fmtDate(day, true)}
          </div>
        </div>
        <div className="np-tabs" role="tablist" aria-label="Период" style={{ marginTop: 10 }}>
          {(
            [
              [30, '1М'],
              [180, '6М'],
              [365, '1Г'],
              [1825, '5Л'],
            ] as const
          ).map(([d, n]) => (
            <button key={d} className="np-tab" role="tab" aria-selected={range === d} onClick={() => setRange(d)}>
              {n}
            </button>
          ))}
        </div>
        <PriceChart data={data} edition={edition} height={300} precision={price >= 1000 ? 0 : 2} />
      </div>
      <aside className="sg-asset__side">
        <OrderTicket ticker="BTC" price={price} cash={DEMO_CASH} held={qty} fmt={(v) => fmtMoney(v)} />
        <div className="np-section" style={{ marginTop: 16 }}>
          <span className="np-label">Позиция</span>
          <KV k="Количество" v="0.42 BTC" />
          <KV k="Средняя цена" v={fmtPrice(avg)} />
          <KV k="Стоимость" v={fmtMoney(value)} />
          <KV
            k="Прибыль / убыток"
            v={
              <span className={cx(pl >= 0 ? 'np-gain' : 'np-loss')}>
                {pl >= 0 ? '+' : '−'}
                {fmtMoney(Math.abs(pl))} (<Delta value={pl / (qty * avg)} className="" />)
              </span>
            }
          />
        </div>
      </aside>
    </div>
  );
}

function frontPages(): Record<'million' | 'ipo' | 'crash', FrontPageProps> {
  // дневные свечи акций в игре восстановлены по месячным опорным точкам, поэтому на полосе — изменение за месяц
  const ch = (id: string) => changeOver(id, CRASH_T, 30) ?? 0;
  const px = (id: string) => fmtPrice(priceAt(id, CRASH_T) ?? 0);
  const spx30 = ch('SPY');
  return {
    crash: {
      issue: 'Экстренный выпуск',
      date: fmtWeekdayFull(CRASH_DAY) + ', ' + fmtDate(CRASH_DAY, true),
      kicker: 'Обвал рынка',
      headline: `S&P 500 за месяц потерял ${Math.round(Math.abs(spx30) * 100)}%`,
      deck: 'Сегодня — худший день с 1987 года: индекс упал на 12%, торги останавливали третий раз за неделю. Накануне ФРС экстренно снизила ставку до нуля.',
      photo: 'front/crash',
      photoAlt: 'Табло котировок',
      caption: 'Табло котировок на Уолл-стрит. Фото: Wikimedia Commons.',
      body: [
        'Паника из-за пандемии дошла до фондового рынка: с февральского максимума индекс широкого рынка потерял почти треть. Предохранители биржи срабатывали в первые минуты торгов.',
        'Ваш портфель потерял за месяц $12.4K. Бизнесы общепита закрыты на карантин, спрос на доставку растёт. Наличные и короткие облигации снова в цене.',
        'Аналитики спорят, где дно. Через пять месяцев индекс вернётся к максимумам, но в этот понедельник в это не верит никто.',
      ],
      figuresTitle: 'За месяц',
      figures: [
        { label: 'S&P 500', value: px('SPY'), change: spx30 },
        { label: 'Apple', value: px('AAPL'), change: ch('AAPL') },
        { label: 'Bitcoin', value: px('BTC'), change: ch('BTC') },
        { label: 'Нефть WTI', value: px('WTI'), change: ch('WTI') },
        { label: 'Золото', value: px('XAU'), change: ch('XAU') },
      ],
    },
    million: {
      issue: 'Выпуск № 812',
      date: 'понедельник, 14 марта 2011',
      kicker: 'Личный капитал',
      headline: 'Курьер из 2009 года стал миллионером',
      deck: 'Два года назад он развозил заказы за $12 в час. Сегодня у него сеть кофеен, три автомойки и портфель акций Apple.',
      photo: 'front/millionaire',
      photoAlt: 'Уолл-стрит',
      caption: 'Уолл-стрит, Нью-Йорк. Фото: Wikimedia Commons.',
      body: [
        'Капитал игрока превысил $1 000 000. Большая часть — бизнесы: 42 точки кофе навынос приносят больше, чем зарплата топ-менеджера.',
        'Первые сбережения ушли в акции Apple в 2009 году, когда бумага стоила меньше $100 до сплитов. С тех пор она выросла более чем втрое.',
        'Следующая цель редакции и героя — первый миллиард и выход компании на биржу.',
      ],
      figures: [
        { label: 'Капитал', value: '$1.00M' },
        { label: 'Доход в секунду', value: '$184.20' },
        { label: 'Точек бизнеса', value: '67' },
        { label: 'Игровых дней', value: '802' },
      ],
    },
    ipo: {
      issue: 'Выпуск № 1 980',
      date: 'понедельник, 2 июня 2014',
      kicker: 'IPO',
      headline: 'Компания «Империя» вышла на биржу',
      deck: 'Основатель позвонил в колокол Нью-Йоркской фондовой биржи. Оценка компании — $1,3 млрд, репутация инвесторов выросла на 17 пунктов.',
      photo: 'front/ipo',
      photoAlt: 'Нью-Йоркская фондовая биржа',
      caption: 'Торговый зал Нью-Йоркской фондовой биржи. Фото: Wikimedia Commons.',
      body: [
        'Акции компании разместили по верхней границе диапазона. Основатель продал бизнесы инвесторам и начинает с нуля — но уже с репутацией, которая даёт +34% к прибыли новых проектов.',
        'Бирже понравились цифры: двенадцать направлений, от шаурмичных до логистики, и ни одного убыточного квартала после 2012 года.',
      ],
      figures: [
        { label: 'Оценка', value: '$1.30B' },
        { label: 'Репутация', value: '+17' },
        { label: 'Бонус к прибыли', value: '+34%' },
      ],
    },
  };
}
