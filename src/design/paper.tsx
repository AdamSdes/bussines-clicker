import { useEffect, type ReactNode } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { Briefcase, ChartLineUp, Storefront, User, Watch, X } from './icons';
import { AnimatedNumber, Delta, Photo, cx } from './primitives';


/* ---------- Шапка газеты ---------- */

export function Masthead({
  date,
  weekday,
  balance,
  format,
  perSec,
  right,
  title = 'Империя с нуля',
}: {
  date: string;
  weekday?: string;
  balance: number;
  format: (v: number) => string;
  perSec: string;
  right?: ReactNode;
  title?: string;
}) {
  return (
    <header className="np-masthead">
      <div className="np-masthead__top">
        <span className="np-masthead__date">
          {weekday && <span style={{ textTransform: 'capitalize' }}>{weekday}, </span>}
          {date}
        </span>
        <span className="np-masthead__flag">{title}</span>
        <span className="np-masthead__tools">{right}</span>
      </div>
      <div className="np-masthead__money">
        <AnimatedNumber value={balance} format={format} className="np-masthead__balance" />
        <span className="np-masthead__rate np-num">{perSec}</span>
      </div>
    </header>
  );
}

/* ---------- Нижняя навигация ---------- */

export type NavId = 'work' | 'business' | 'invest' | 'life' | 'profile';
export const NAV_ITEMS: { id: NavId; label: string; Icon: PhosphorIcon }[] = [
  { id: 'work', label: 'Работа', Icon: Briefcase },
  { id: 'business', label: 'Бизнесы', Icon: Storefront },
  { id: 'invest', label: 'Инвестиции', Icon: ChartLineUp },
  { id: 'life', label: 'Жизнь', Icon: Watch },
  { id: 'profile', label: 'Профиль', Icon: User },
];

export function Nav({ current, onChange, dots = {} }: { current: NavId; onChange: (id: NavId) => void; dots?: Partial<Record<NavId, boolean>> }) {
  return (
    <nav className="np-nav" aria-label="Разделы">
      {NAV_ITEMS.map(({ id, label, Icon }) => (
        <button key={id} className="np-nav__item" aria-current={current === id ? 'page' : undefined} onClick={() => onChange(id)}>
          <Icon size={22} weight="light" aria-hidden />
          <span>{label}</span>
          {dots[id] && <span className="np-nav__dot" aria-label="есть доступные действия" />}
        </button>
      ))}
    </nav>
  );
}

/* ---------- Полоса котировок с новостями ---------- */

export type TapeItem = { kind: 'quote'; id: string; price: string; change: number | null } | { kind: 'news'; text: string };

export function Tape({ label, items, onOpen }: { label: string; items: TapeItem[]; onOpen?: () => void }) {
  const run = items.map((it, i) =>
    it.kind === 'quote' ? (
      <span key={i} className="np-tape__item">
        <b>{it.id}</b>
        <span className="np-num">{it.price}</span>
        <Delta value={it.change} />
      </span>
    ) : (
      <span key={i} className="np-tape__item np-tape__headline">
        {it.text}
      </span>
    ),
  );
  return (
    <div className="np-tape" onClick={onOpen} role={onOpen ? 'button' : undefined}>
      <span className="np-tape__label">{label}</span>
      <div className="np-tape__track">
        <div className="np-tape__run">
          {run}
          <span aria-hidden style={{ display: 'contents' }}>
            {run}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Новости: колонки газеты ---------- */

export interface NewsItem {
  date: string;
  headline: string;
  text?: string;
  big?: boolean;
  tag?: string;
}

export function NewsColumns({ items }: { items: NewsItem[] }) {
  return (
    <div className="np-news">
      {items.map((n, i) => (
        <article key={i} className={cx('np-news__item', n.big && 'np-news__item--big')}>
          <div className="np-clip__dateline">
            {n.date}
            {n.tag && <> · {n.tag}</>}
          </div>
          <h3 className={n.big ? 'np-h2' : 'np-h3'} style={{ margin: '4px 0 0' }}>
            {n.headline}
          </h3>
          {n.text && <p className="np-body np-news__text">{n.text}</p>}
        </article>
      ))}
    </div>
  );
}

/* ---------- Достижения: вырезка и грамота ---------- */

export function Clip({ dateline, head, text, locked, progress }: { dateline: string; head: string; text: string; locked?: boolean; progress?: string }) {
  return (
    <article className={cx('np-clip', locked && 'np-clip--locked')}>
      <div className="np-clip__dateline">{locked ? 'Ещё не напечатано' : dateline}</div>
      <h4 className="np-clip__head">{head}</h4>
      <p className="np-clip__text">{text}</p>
      {progress && <div className="np-clip__progress np-num">{progress}</div>}
    </article>
  );
}

export function Diploma({ title, recipient, text, date, sign }: { title: string; recipient: string; text: string; date: string; sign: string }) {
  return (
    <article className="np-diploma">
      <div className="np-label">Грамота</div>
      <div className="np-diploma__title">{title}</div>
      <div className="np-diploma__to">вручается {recipient}</div>
      <p className="np-diploma__text">{text}</p>
      <div className="np-diploma__foot">
        <span className="np-num">{date}</span>
        <span>{sign}</span>
      </div>
    </article>
  );
}

/* ---------- Первая полоса: важный момент игры ---------- */

export interface FrontPageProps {
  flag?: string;
  issue: string;
  date: string;
  price?: string;
  kicker: string;
  headline: string;
  deck: string;
  photo: string;
  photoAlt: string;
  caption: string;
  body: string[];
  figuresTitle?: string;
  figures?: { label: string; value: string; change?: number }[];
}

export function FrontPage(p: FrontPageProps) {
  return (
    <article className="np-front">
      <div className="np-front__flag">{p.flag ?? 'Империя с нуля'}</div>
      <div className="np-front__dateline">
        <span>{p.issue}</span>
        <span>{p.date}</span>
        <span>{p.price ?? 'Цена 25 центов'}</span>
      </div>
      <div className="np-front__lead">
        <div className="np-front__kicker">{p.kicker}</div>
        <h1 className="np-display np-front__headline">{p.headline}</h1>
        <p className="np-deck">{p.deck}</p>
      </div>
      <figure className="np-front__figure">
        <Photo k={p.photo} alt={p.photoAlt} className="np-front__photo" eager />
        <figcaption className="np-front__caption">{p.caption}</figcaption>
      </figure>
      <div className="np-front__grid">
        <div className="np-front__cols np-body">
          {p.body.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
        {p.figures && (
          <aside className="np-front__figures">
            <div className="np-label" style={{ color: 'var(--ink)' }}>
              {p.figuresTitle ?? 'Цифры дня'}
            </div>
            {p.figures.map((f) => (
              <div key={f.label} className="np-kv">
                <span>{f.label}</span>
                <span>
                  {f.value}
                  {f.change != null && (
                    <>
                      {' '}
                      <Delta value={f.change} />
                    </>
                  )}
                </span>
              </div>
            ))}
          </aside>
        )}
      </div>
    </article>
  );
}

/** Полноэкранный разворот поверх игры. Esc и кнопка закрывают. */
export function FrontPageOverlay({ open, onClose, children, action = 'Продолжить' }: { open: boolean; onClose: () => void; children: ReactNode; action?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="np-overlay" role="dialog" aria-modal="true">
      <div className="np-overlay__bar">
        <button className="np-btn np-btn--quiet np-btn--sm" onClick={onClose}>
          <X size={18} weight="light" aria-hidden /> Закрыть
        </button>
      </div>
      <div className="np-overlay__page">
        {children}
        <div className="np-overlay__foot">
          <button className="np-btn np-btn--primary" onClick={onClose}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}
