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

/** Shared column anatomy: total, proportional stack, and label. */
export function SpendingColumns({ columns, currency, variant, selection }: {
  columns: SpendingColumn[];
  currency: CurrencyFormat;
  variant: 'categories' | 'monthly' | 'people';
  selection?: { columnId?: string; segmentId?: string };
}) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; heading: string; label: string; amount: number; color: string; source: 'pointer' | 'focus';
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
          const isSelectedPerson = variant === 'people' && selection?.columnId === column.id;
          const positive = column.segments.filter((segment) => segment.amount > 0);
          const negative = column.segments.filter((segment) => segment.amount < 0);
          const positiveTotal = positive.reduce((sum, segment) => sum + segment.amount, 0);
          const negativeTotal = negative.reduce((sum, segment) => sum - segment.amount, 0);
          const isEmptyColumn = positiveTotal === 0 && negativeTotal === 0;
          const zeroBarColors = column.segments.map((segment, index) => {
            const shade = column.segments.length <= 1 ? 100 : 80 + (20 * index) / (column.segments.length - 1);
            return variant === 'categories'
              ? `color-mix(in srgb, ${segment.color} ${shade}%, var(--bg))`
              : segment.color;
          });
          const zeroBarBackground = zeroBarColors.length > 1
            ? `linear-gradient(to right, ${zeroBarColors.map((color, index) => `${color} ${index / zeroBarColors.length * 100}% ${(index + 1) / zeroBarColors.length * 100}%`).join(', ')})`
            : zeroBarColors[0] ?? column.color;
          const renderSegment = (segment: SpendingColumn['segments'][number], index: number) => {
            const dimmed = Boolean(selection) && !(variant === 'people' && selection?.columnId === 'all')
              && !(column.id === selection?.columnId && (!selection.segmentId || segment.id === selection.segmentId));
            const shade = positive.length <= 1 ? 100 : 80 + (20 * index) / (positive.length - 1);
            const backgroundColor = variant === 'categories'
              ? `color-mix(in srgb, ${segment.color} ${shade}%, var(--bg))`
              : segment.color;
            return <button
                  className={`spending-column-segment${dimmed ? ' is-dimmed' : ''}`} type="button" key={segment.id}
                  style={{ flexGrow: Math.abs(segment.amount), backgroundColor }}
                  aria-label={`Filter table by ${column.description ?? column.label}, ${segment.label}: ${formatMoney(segment.amount, currency)}`}
                  aria-pressed={variant === 'people' ? isSelectedPerson : undefined}
                  onClick={segment.onSelect}
                  onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY,
                    heading: column.description ?? column.label, label: segment.label, amount: segment.amount, color: segment.color, source: 'pointer' })}
                  onMouseMove={(event) => setTooltip((value) => value ? { ...value, x: event.clientX, y: event.clientY, source: 'pointer' } : null)}
                  onMouseLeave={() => setTooltip(null)}
                  onFocus={(event) => {
                    if (!event.currentTarget.matches(':focus-visible')) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    setTooltip({ x: rect.left, y: rect.top, heading: column.description ?? column.label,
                      label: segment.label, amount: segment.amount, color: segment.color, source: 'focus' });
                  }}
                  onBlur={() => setTooltip((value) => value?.source === 'focus' ? null : value)}
                />;
          };
          return <div className={`spending-column${isSelectedPerson ? ' is-selected' : ''}`} key={column.id} style={{ '--column-color': column.color } as CSSProperties}>
            <div className="spending-column-plot">
              <div className="spending-column-stack" style={{ bottom: `${maxNegative / extent * 100}%`, height: isEmptyColumn ? '1px' : `${positiveTotal / extent * 100}%` }}>
                <div className="spending-column-heading">
                  {variant === 'categories' && <button className="spending-column-label" type="button" onClick={column.onSelect}
                    aria-label={`Filter table by ${column.description ?? column.label}`} title={column.description ?? column.label}>
                    {column.label}
                  </button>}
                  {column.total !== 0 && <button className="spending-column-total" type="button" onClick={column.onSelect}
                    aria-label={`Filter table by ${column.description ?? column.label}: ${formatMoney(column.total, currency)}`}
                    aria-pressed={variant === 'people' ? isSelectedPerson : undefined}>
                    {formatCompact(column.total, currency, 0)}
                  </button>}
                </div>
                {isEmptyColumn ? <span className="spending-column-zero-bar" aria-hidden="true" style={{ background: zeroBarBackground }} /> : positive.map(renderSegment)}
              </div>
              {negative.length > 0 && <div className="spending-column-stack spending-column-refunds"
                style={{ top: `${maxPositive / extent * 100}%`, height: `${negativeTotal / extent * 100}%` }}>
                {negative.map(renderSegment)}
              </div>}
            </div>
            {variant !== 'categories' && <button className="spending-column-label" type="button" onClick={column.onSelect}
              aria-label={`Filter table by ${column.description ?? column.label}`} aria-pressed={variant === 'people' ? isSelectedPerson : undefined} title={column.description ?? column.label}>
              {column.label}
            </button>}
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
