import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { formatCompact, formatMoney } from '../../lib/money';
import type { CurrencyFormat } from '../../types';

export interface SpendingColumn {
  id: string;
  label: string;
  description?: string;
  total: number;
  color: string;
  onSelect: () => void;
  segments: {
    id: string;
    label: string;
    amount: number;
    color: string;
    onSelect: () => void;
  }[];
}

/** Shared column anatomy: total, proportional stack, and an underlined label. */
export function SpendingColumns({ columns, currency, variant }: {
  columns: SpendingColumn[];
  currency: CurrencyFormat;
  variant: 'categories' | 'monthly';
}) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; heading: string; label: string; amount: number; color: string;
  } | null>(null);
  const maxPositive = Math.max(0, ...columns.map((column) =>
    column.segments.reduce((sum, segment) => sum + Math.max(0, segment.amount), 0)));
  const maxNegative = Math.max(0, ...columns.map((column) =>
    column.segments.reduce((sum, segment) => sum + Math.max(0, -segment.amount), 0)));
  const extent = Math.max(1, maxPositive + maxNegative);

  return <>
    <div className={`spending-columns-scroll spending-columns-${variant}`}>
      <div className="spending-columns" style={{ '--column-count': columns.length } as CSSProperties}>
        {columns.map((column) => {
          const positive = column.segments.filter((segment) => segment.amount > 0);
          const negative = column.segments.filter((segment) => segment.amount < 0);
          const positiveTotal = positive.reduce((sum, segment) => sum + segment.amount, 0);
          const negativeTotal = negative.reduce((sum, segment) => sum - segment.amount, 0);
          const renderSegment = (segment: SpendingColumn['segments'][number]) => <button
                  className="spending-column-segment" type="button" key={segment.id}
                  style={{ flexGrow: Math.abs(segment.amount), backgroundColor: segment.color }}
                  aria-label={`Filter table by ${column.description ?? column.label}, ${segment.label}: ${formatMoney(segment.amount, currency)}`}
                  onClick={segment.onSelect}
                  onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY,
                    heading: column.description ?? column.label, label: segment.label, amount: segment.amount, color: segment.color })}
                  onMouseMove={(event) => setTooltip((value) => value ? { ...value, x: event.clientX, y: event.clientY } : null)}
                  onMouseLeave={() => setTooltip(null)}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setTooltip({ x: rect.left, y: rect.top, heading: column.description ?? column.label,
                      label: segment.label, amount: segment.amount, color: segment.color });
                  }}
                  onBlur={() => setTooltip(null)}
                >
                  {variant === 'categories' && <span className="spending-segment-label">{segment.label} {formatCompact(segment.amount, currency)}</span>}
                </button>;
          return <div className="spending-column" key={column.id} style={{ '--column-color': column.color } as CSSProperties}>
            <div className="spending-column-plot">
              <div className="spending-column-stack" style={{ bottom: `${maxNegative / extent * 100}%`, height: `${positiveTotal / extent * 100}%` }}>
                <button className="spending-column-total" type="button" onClick={column.onSelect}
                  aria-label={`Filter table by ${column.description ?? column.label}: ${formatMoney(column.total, currency)}`}>
                  {formatCompact(column.total, currency)}
                </button>
                {positive.map(renderSegment)}
              </div>
              {negative.length > 0 && <div className="spending-column-stack spending-column-refunds"
                style={{ top: `${maxPositive / extent * 100}%`, height: `${negativeTotal / extent * 100}%` }}>
                {negative.map(renderSegment)}
              </div>}
            </div>
            <button className="spending-column-label" type="button" onClick={column.onSelect}
              aria-label={`Filter table by ${column.description ?? column.label}`} title={column.description ?? column.label}>
              {column.label}
            </button>
          </div>;
        })}
      </div>
    </div>
    {tooltip && createPortal(<div className="chart-pointer-tooltip" role="tooltip" style={{
      left: Math.max(8, Math.min(tooltip.x + 14, window.innerWidth - 210)),
      top: Math.max(8, Math.min(tooltip.y + 14, window.innerHeight - 80)),
    }}>
      <span>{tooltip.heading}</span>
      <div><i style={{ background: tooltip.color }} /><span>{tooltip.label}</span><strong>{formatMoney(tooltip.amount, currency)}</strong></div>
    </div>, document.body)}
  </>;
}
