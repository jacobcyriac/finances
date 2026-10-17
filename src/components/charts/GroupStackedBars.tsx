import type { SpendingGroup } from '../../analysis/rolling-spending';
import type { CurrencyFormat } from '../../types';
import { formatMoney } from '../../lib/money';

interface Props {
  groups: SpendingGroup[];
  currency: CurrencyFormat;
}

function groupFill(colorToken: string): string {
  const named = colorToken.match(/--(spend-[a-z-]+)/)?.[1];
  if (named) return `var(--${named}-tile)`;
  const series = colorToken.match(/--series-(\d+)/)?.[1] ?? '1';
  return `var(--treemap-series-${series})`;
}

function formatCategoryAmount(minor: number): string {
  const amount = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 0 }).format(Math.abs(minor) / 100);
  return minor < 0 ? `-${amount}` : amount;
}

function formatGroupAmount(minor: number, currency: CurrencyFormat): string {
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(minor) / 100);
  const withSymbol = currency.symbol
    ? currency.symbolFirst ? `${currency.symbol}${amount}` : `${amount} ${currency.symbol}`
    : amount;
  return minor < 0 ? `-${withSymbol}` : withSymbol;
}

export function GroupStackedBars({ groups, currency }: Props) {
  const visibleGroups = groups.filter((group) => group.categories.length > 0);
  if (!visibleGroups.length) return <div className="empty-chart">No categorized spending for this period.</div>;
  const maxGroupTotal = Math.max(0, ...visibleGroups.map((group) => group.total));

  return <>
    <div className="group-bars-wrap">
      {visibleGroups.map((group) => {
        const segments = group.categories
          .map((category) => ({ ...category, visibleTotal: Math.max(0, category.total) }))
          .filter((category) => category.visibleTotal > 0);
        const positiveTotal = segments.reduce((sum, category) => sum + category.visibleTotal, 0);
        const gapSharePx = segments.length > 0 ? (segments.length - 1) / segments.length : 0;
        return <section className="group-bar-row" key={group.id}>
          <div className="group-bar-track">
          <header className="group-bar-heading">
            <strong>{group.name}</strong>
            <span style={{ color: groupFill(group.color) }}>{formatGroupAmount(group.total, currency)}</span>
          </header>
          <div className="group-stacked-bar" role="img" aria-label={`${group.name}: ${formatGroupAmount(group.total, currency)} total`} style={{ width: `${maxGroupTotal > 0 ? Math.max(0, group.total) / maxGroupTotal * 100 : 0}%` }}>
            {segments.map((category) => {
              const width = positiveTotal > 0 ? (category.visibleTotal / positiveTotal) * 100 : 0;
              return <div
                className="group-stacked-segment"
                key={category.id}
                style={{ width: `calc(max(0px, ${width}% - ${gapSharePx}px))`, backgroundColor: groupFill(group.color) }}
                title={`${category.name}: ${formatMoney(category.total, currency)}`}
              >
                <span className="group-stacked-category-copy">{category.name} {formatCategoryAmount(category.total)}</span>
              </div>;
            })}
          </div>
          </div>
        </section>;
      })}
    </div>
  </>;
}
