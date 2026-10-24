import type { SpendingGroup, SpendingMonth } from '../../analysis/rolling-spending';
import type { CurrencyFormat } from '../../types';
import { SpendingColumns } from './SpendingColumns';

export function MonthlySpendingBars({ months, groups, currency, selection, categoryLabel, onSelectMonth, onSelectMonthAndGroup }: {
  months: SpendingMonth[];
  groups: SpendingGroup[];
  currency: CurrencyFormat;
  selection?: { columnId?: string; segmentId?: string };
  categoryLabel?: string;
  onSelectMonth: (month: string) => void;
  onSelectMonthAndGroup: (month: string, groupId: string) => void;
}) {
  if (!groups.length) return <div className="empty-chart">No eligible expenses were found in this period.</div>;
  return <SpendingColumns variant="monthly" currency={currency} selection={selection} columns={months.map((month) => {
    const date = new Date(`${month.month}-01T12:00:00`);
    return {
      id: month.month,
      label: date.toLocaleDateString(undefined, { month: 'short' }),
      description: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      total: month.total,
      color: 'var(--brand)',
      onSelect: () => onSelectMonth(month.month),
      segments: [...groups].reverse().map((group) => ({
        id: group.id,
        label: categoryLabel ?? group.name,
        amount: group.categories.reduce((sum, category) => sum + (month.categories[category.id] ?? 0), 0),
        color: group.color,
        onSelect: () => onSelectMonthAndGroup(month.month, group.id),
      })),
    };
  })} />;
}
