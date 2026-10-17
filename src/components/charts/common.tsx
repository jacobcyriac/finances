import type { CurrencyFormat } from '../../types';
import { formatMoney } from '../../lib/money';

/** Purple-led data series ramp (used for stacked/multi series). */
export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
];

export const POS = 'var(--pos)';
export const NEG = 'var(--neg)';
export const BRAND = 'var(--brand)';
export const BRAND_BRIGHT = 'var(--brand-bright)';

interface TooltipRow {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

export function makeCurrencyTooltip(currency: CurrencyFormat, labelMap?: (l: string) => string) {
  return function CurrencyTooltip({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: TooltipRow[];
    label?: string;
  }) {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="panel-2 tooltip-shadow px-3 py-2 text-xs" style={{ background: 'var(--bg-2)' }}>
        {label != null && (
          <div className="mb-1.5 font-semibold text-[var(--text)]">
            {labelMap ? labelMap(label) : label}
          </div>
        )}
        <div className="space-y-1">
          {payload.map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[var(--text-dim)]">
                {row.color && (
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: row.color }}
                  />
                )}
                {row.name}
              </span>
              <span className="num font-medium text-[var(--text)]">
                {formatMoney(Math.round(row.value ?? 0), currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };
}

/** English name for a month-of-year (1-12), e.g. "Mar" / "March". */
export function monthName(monthOfYear: number, style: 'short' | 'long' = 'short'): string {
  return new Date(2000, monthOfYear - 1).toLocaleString('en', { month: style });
}

/** Pretty 'YYYY-MM' -> "Mar '26". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${monthName(Number(m))} '${y.slice(2)}`;
}
