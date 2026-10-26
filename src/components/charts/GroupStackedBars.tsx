import type { SpendingGroup } from '../../analysis/rolling-spending';
import type { CurrencyFormat } from '../../types';
import { SpendingColumns } from './SpendingColumns';

interface Props {
  groups: SpendingGroup[];
  currency: CurrencyFormat;
  selection?: { columnId?: string; segmentId?: string };
  onSelectGroup: (groupId: string) => void;
}

export function GroupStackedBars({ groups, currency, selection, onSelectGroup }: Props) {
  const visibleGroups = groups.filter((group) => group.categories.length > 0);
  if (!visibleGroups.length) return <div className="empty-chart">No categorized spending for this period.</div>;

  return <SpendingColumns variant="categories" currency={currency} selection={selection} columns={visibleGroups.map((group) => ({
    id: group.id,
    label: group.name,
    total: group.total,
    color: group.color,
    onSelect: () => onSelectGroup(group.id),
    // Render one solid bar for the parent group; category detail lives in
    // the selected-group pills below the chart.
    segments: [{
      id: group.id,
      label: 'Total',
      amount: group.total,
      color: group.color,
      onSelect: () => onSelectGroup(group.id),
    }],
  }))} />;
}
