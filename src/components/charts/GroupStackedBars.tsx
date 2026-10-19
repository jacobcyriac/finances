import type { SpendingGroup } from '../../analysis/rolling-spending';
import type { CurrencyFormat } from '../../types';
import { SpendingColumns } from './SpendingColumns';

interface Props {
  groups: SpendingGroup[];
  currency: CurrencyFormat;
  selection?: { columnId?: string; segmentId?: string };
  onSelectGroup: (groupId: string) => void;
  onSelectCategory: (groupId: string, categoryId: string) => void;
}

export function GroupStackedBars({ groups, currency, selection, onSelectGroup, onSelectCategory }: Props) {
  const visibleGroups = groups.filter((group) => group.categories.length > 0);
  if (!visibleGroups.length) return <div className="empty-chart">No categorized spending for this period.</div>;

  return <SpendingColumns variant="categories" currency={currency} selection={selection} columns={visibleGroups.map((group) => ({
    id: group.id,
    label: group.name,
    total: group.total,
    color: group.color,
    onSelect: () => onSelectGroup(group.id),
    segments: group.categories.map((category) => ({
      id: category.id,
      label: category.name,
      amount: category.total,
      color: group.color,
      onSelect: () => onSelectCategory(group.id, category.id),
    })),
  }))} />;
}
