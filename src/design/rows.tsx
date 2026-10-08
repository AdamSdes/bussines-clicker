import type { ReactNode } from 'react';
import { AssetMark, Delta, Photo, Sparkline, cx, hasLogo, type AssetKind } from './primitives';

/* ---------- Строка бизнеса ---------- */

export interface BusinessRowProps {
  photo: string;
  name: string;
  /** «42 точки» или «Нет точек» */
  level: ReactNode;
  /** Доход: «$1.20K/с» */
  income: ReactNode;
  /** Вторая строка справа от уровня: до вехи, управляющий */
  detail?: ReactNode;
  /** 0..1 — прогресс цикла выручки или до следующей вехи */
  progress: number;
  buyLabel?: string;
  cost: string;
  canBuy: boolean;
  onBuy?: () => void;
  /** Дополнительное действие (нанять управляющего) */
  extra?: ReactNode;
  locked?: boolean;
}

export function BusinessRow(p: BusinessRowProps) {
  return (
    <div className={cx('np-bizrow', p.locked && 'np-bizrow--locked')}>
      <Photo k={p.photo} alt={p.name} style={{ width: 72, height: 72 }} />
      <div style={{ minWidth: 0 }}>
        <div className="np-bizrow__name">{p.name}</div>
        <div className="np-bizrow__meta">
          {p.level} · <span className="np-money">{p.income}</span>
        </div>
        {p.detail && <div className="np-bizrow__detail">{p.detail}</div>}
        {p.extra && <div className="np-bizrow__extra">{p.extra}</div>}
      </div>
      <div className="np-bizrow__actions">
        <button className={cx('np-btn', p.canBuy && 'np-btn--primary', 'np-btn--stack')} disabled={!p.canBuy} onClick={p.onBuy}>
          <span>{p.buyLabel ?? 'Купить'}</span>
          <span className="np-num">{p.cost}</span>
        </button>
      </div>
      <div className="np-bizrow__bar" aria-hidden>
        <i style={{ width: `${Math.max(0, Math.min(1, p.progress)) * 100}%` }} />
      </div>
    </div>
  );
}

/* ---------- Таблица котировок ---------- */

export interface QuoteRowData {
  id: string;
  kind: AssetKind;
  name: string;
  price: string;
  change: number | null;
  spark: number[];
  ghost?: boolean;
  /** Подпись для делистинга и т. п. */
  note?: string;
}

const KIND_LABEL: Record<AssetKind, string> = { stock: 'Акция', etf: 'Фонд', commodity: 'Товар', fx: 'Валюта', crypto: 'Крипта' };

export function QuoteTable({ rows, onOpen, logos, caption }: { rows: QuoteRowData[]; onOpen?: (id: string) => void; logos?: boolean; caption?: ReactNode }) {
  return (
    <table className="np-quotes">
      {caption && <caption className="np-quotes__caption">{caption}</caption>}
      <thead>
        <tr>
          <th>Инструмент</th>
          <th>Цена</th>
          <th>За день</th>
          <th className="np-quotes__spark">Месяц</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <QuoteRow key={r.id} r={r} onOpen={onOpen} logos={logos} />
        ))}
      </tbody>
    </table>
  );
}

export function QuoteRow({ r, onOpen, logos }: { r: QuoteRowData; onOpen?: (id: string) => void; logos?: boolean }) {
  return (
    <tr onClick={() => onOpen?.(r.id)} tabIndex={onOpen ? 0 : -1} onKeyDown={(e) => e.key === 'Enter' && onOpen?.(r.id)}>
      <td>
        <div className="np-inst">
          <AssetMark id={r.id} kind={r.kind} ghost={r.ghost} logos={logos} />
          <div className="np-inst__text">
            <span className="np-inst__name">{r.name}</span>
            <span className="np-co">{r.note ?? (hasLogo(r.id, r.kind, logos) && !r.ghost ? `${r.id} · ${KIND_LABEL[r.kind]}` : KIND_LABEL[r.kind])}</span>
          </div>
        </div>
      </td>
      <td>{r.price}</td>
      <td>
        <Delta value={r.change} />
      </td>
      <td className="np-quotes__spark">
        <Sparkline points={r.spark} />
      </td>
    </tr>
  );
}

/* ---------- Карточка лота ---------- */

export interface LotProps {
  no: number;
  photo: string;
  title: string;
  year: number | string;
  /** Происхождение / характеристика: «Япония · кварц» */
  facts?: string;
  price: string;
  /** Что даёт покупка: «+0,2% к шансу крупного заказа» */
  effect?: string;
  state: 'owned' | 'buy' | 'short';
  /** Сколько не хватает: «Не хватает $1 200» */
  shortBy?: string;
  onBuy?: () => void;
}

export function LotCard(p: LotProps) {
  return (
    <article className="np-lot">
      <Photo k={p.photo} alt={p.title} cutout className="np-lot__image" />
      <div className="np-label np-lot__no">Лот {String(p.no).padStart(3, '0')}</div>
      <h3 className="np-lot__title">{p.title}</h3>
      <div className="np-lot__facts">
        <span className="np-num">{p.year}</span>
        {p.facts && <> · {p.facts}</>}
      </div>
      <div className="np-lot__price">{p.price}</div>
      {p.effect && <div className="np-lot__note">{p.effect}</div>}
      <div className="np-lot__action">
        {p.state === 'owned' ? (
          <span className="np-stamp">В коллекции</span>
        ) : p.state === 'buy' ? (
          <button className="np-btn np-btn--primary np-btn--sm" onClick={p.onBuy}>
            Купить лот
          </button>
        ) : (
          <button className="np-btn np-btn--sm" disabled>
            {p.shortBy ?? 'Недостаточно средств'}
          </button>
        )}
      </div>
    </article>
  );
}
