import type { SpendingGroup } from '../../analysis/rolling-spending';
import type { CurrencyFormat } from '../../types';
import { formatMoney } from '../../lib/money';

interface Props {
  groups: SpendingGroup[];
  currency: CurrencyFormat;
}

function highContrastGroupColor(colorToken: string): string {
  const named = colorToken.match(/--(spend-[a-z-]+)/)?.[1];
  if (named) return `var(--${named}-tile)`;
  const series = colorToken.match(/--series-(\d+)/)?.[1] ?? '1';
  return `var(--treemap-series-${series})`;
}

function formatTreemapAmount(minor: number, currency: CurrencyFormat): string {
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(minor) / 100);
  const withSymbol = currency.symbol
    ? currency.symbolFirst ? `${currency.symbol}${amount}` : `${amount} ${currency.symbol}`
    : amount;
  return minor < 0 ? `-${withSymbol}` : withSymbol;
}

export function SpendingTreemap({ groups, currency }: Props) {
  const visibleGroups = groups.filter((group) => group.categories.length > 0);
  if (!visibleGroups.length) return <div className="empty-chart">No categorized spending for this period.</div>;

  return (
    <div className="treemap-scroll">
      <div className="treemap-columns" style={{ gridTemplateColumns: visibleGroups.map((group) => `minmax(0, ${Math.max(1, group.total)}fr)`).join(' ') }}>
        {visibleGroups.map((group) => {
          return (
            <section className="treemap-group-column" key={group.id}>
              <header className="treemap-group-heading">
                <span className="treemap-group-name" title={group.name}>{group.name}</span>
                <span className="treemap-group-total">{formatTreemapAmount(group.total, currency)}</span>
              </header>
              <div className="treemap-group-chart">
                {group.categories.map((category) => (
                  <div
                    className="treemap-category-row"
                    key={category.id}
                    style={{
                      backgroundColor: highContrastGroupColor(group.color),
                      flexGrow: Math.max(1, category.total),
                      flexBasis: 0,
                    }}
                    title={`${group.name} · ${category.name}: ${formatMoney(category.total, currency)} net spending`}
                  >
                    <span className="treemap-category-name">{category.name}</span>
                    <span className="treemap-category-total">{formatTreemapAmount(category.total, currency)}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
