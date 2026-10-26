import type { CSSProperties } from 'react';
import { formatCompact } from '../lib/money';
import type { CurrencyFormat } from '../types';

export interface CategoryPillItem {
  id: string;
  name: string;
  total: number;
  color: string;
  groupId?: string;
}

const formatPillTotal = (amount: number, currency: CurrencyFormat) => formatCompact(amount, currency, 0);

export function CategoryPills({ categories, currency, selectedCategoryId, allTotal, groupColor, filteredGroupId, showAll = true, onSelect }: {
  categories: CategoryPillItem[];
  currency: CurrencyFormat;
  selectedCategoryId?: string;
  allTotal: number;
  groupColor: string;
  filteredGroupId?: string;
  showAll?: boolean;
  onSelect: (categoryId: string | null) => void;
}) {
  return <div className="category-pills" aria-label="Category totals">
    {showAll && <button
      className={`category-pill${selectedCategoryId === undefined ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selectedCategoryId === undefined}
      onClick={() => onSelect(null)}
      style={{ '--category-color': groupColor } as CSSProperties}
    >
      <span>All</span>
      <strong>{formatPillTotal(allTotal, currency)}</strong>
    </button>}
    {categories.map((category) => <button
      key={category.id}
      className={`category-pill${selectedCategoryId === category.id ? ' is-selected' : ''}${filteredGroupId && category.groupId !== filteredGroupId ? ' is-filtered-out' : ''}`}
      type="button"
      aria-pressed={selectedCategoryId === category.id}
      onClick={() => onSelect(category.id)}
      style={{ '--category-color': category.color } as CSSProperties}
    >
      <span>{category.name}</span>
      <strong>{formatPillTotal(category.total, currency)}</strong>
    </button>)}
  </div>;
}
