import type { CSSProperties } from 'react';
import type { SpendingGroup } from '../../analysis/rolling-spending';
import type { CurrencyFormat } from '../../types';
import { formatMoney } from '../../lib/money';

interface Props {
  groups: SpendingGroup[];
  currency: CurrencyFormat;
  onSelectGroup: (groupId: string) => void;
  onSelectCategory: (groupId: string, categoryId: string) => void;
}

function formatAmount(minor: number, currency: CurrencyFormat, compact = false): string {
  const amount = new Intl.NumberFormat('en-US', { notation: compact ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(minor / 100);
  if (compact || !currency.symbol) return amount;
  return currency.symbolFirst ? `${currency.symbol}${amount}` : `${amount} ${currency.symbol}`;
}

export function GroupStackedBars({ groups, currency, onSelectGroup, onSelectCategory }: Props) {
  const visibleGroups = groups.filter((group) => group.categories.length > 0);
  if (!visibleGroups.length) return <div className="empty-chart">No categorized spending for this period.</div>;
  const maxTotal = Math.max(0, ...visibleGroups.map((group) => group.total));

  return <div className="group-bars-wrap">
    {visibleGroups.map((group) => {
      const segments = group.categories.filter((category) => category.total > 0);
      const positiveTotal = segments.reduce((sum, category) => sum + category.total, 0);
      return <section className="group-bar-row" key={group.id} style={{ '--group-color': group.color } as CSSProperties}>
        <button className="group-bar-heading" type="button" onClick={() => onSelectGroup(group.id)} aria-label={`Filter table by ${group.name}`}>
          <strong>{group.name}</strong><span>{formatAmount(group.total, currency)}</span>
        </button>
        <div className="group-stacked-bar" aria-label={`${group.name} category proportions`}>
          <div className="group-stacked-fill" style={{ width: `${maxTotal > 0 ? Math.max(0, group.total) / maxTotal * 100 : 0}%` }}>
            {segments.map((category) => <button
              type="button" className="group-stacked-segment" key={category.id}
              aria-label={`Filter table by ${group.name}, ${category.name}`}
              onClick={() => onSelectCategory(group.id, category.id)}
              style={{ flexGrow: positiveTotal ? category.total / positiveTotal : 0 }}
              title={`${category.name}: ${formatMoney(category.total, currency)}`}
            />)}
          </div>
        </div>
        <div className="group-stacked-category-copy">
          {group.categories.map((category) => <button type="button" className="group-category-link" key={category.id}
            aria-label={`Filter table by ${group.name}, ${category.name}`}
            onClick={() => onSelectCategory(group.id, category.id)}>
            {category.name} {formatAmount(category.total, currency, true)}
          </button>)}
        </div>
      </section>;
    })}
  </div>;
}
