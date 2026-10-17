import type { Snapshot } from '../types';
import { addMonths } from '../lib/date';
import { buildIndexes, isTransfer } from './_shared';

export interface SpendingMonth {
  month: string;
  total: number;
  categories: Record<string, number>;
}

export interface SpendingCategory {
  id: string;
  name: string;
  groupId: string;
  group: string;
  color: string;
}

export interface SpendingGroup {
  id: string;
  name: string;
  total: number;
  color: string;
  categories: { id: string; name: string; total: number }[];
}

export interface RollingSpending {
  months: SpendingMonth[];
  categories: SpendingCategory[];
  groups: SpendingGroup[];
  totals: { housing: number; food: number; travel: number; total: number; average: number };
  startMonth: string;
  endMonth: string;
}

export interface SpendingRangeOptions {
  months: number;
  includeCurrentMonth: boolean;
}

const COLORS = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
  'var(--series-9)', 'var(--series-10)', 'var(--series-11)', 'var(--series-12)',
];

function fixedColor(id: string): string {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return COLORS[(hash >>> 0) % COLORS.length];
}

function groupColor(name: string, index: number): string {
  const normalized = name.toLowerCase();
  if (/bill/.test(normalized)) return 'var(--spend-bills)';
  if (/travel|vacation/.test(normalized)) return 'var(--spend-travel)';
  if (/other/.test(normalized)) return 'var(--spend-other)';
  if (/grocer/.test(normalized)) return 'var(--spend-grocery)';
  if (/dining|restaurant|eating/.test(normalized)) return 'var(--spend-dining)';
  if (/food|grocer|dining|restaurant|eating/.test(normalized)) return 'var(--spend-food)';
  if (/rent|housing|home/.test(normalized)) return 'var(--spend-rent)';
  return COLORS[index % COLORS.length];
}

function categoryColor(id: string, name: string): string {
  return fixedColor(id);
}

export function spendingGroupColor(name: string, index = 0): string {
  return groupColor(name, index);
}

function groupOrder(name: string): number {
  const normalized = name.toLowerCase();
  if (/rent|housing|home/.test(normalized)) return 0;
  if (/bill/.test(normalized)) return 1;
  if (/other/.test(normalized)) return 2;
  if (/food|grocer|dining|restaurant|eating/.test(normalized)) return 3;
  if (/travel|vacation/.test(normalized)) return 4;
  return 5;
}

function isStartingBalance(name: string): boolean {
  return /starting\s*balances?/i.test(name.trim());
}

function excludedByNote(note: string | null | undefined): boolean {
  return /#(?:noise|payment)\b/i.test(note ?? '');
}

function foodGroup(group: string): boolean {
  return /food|grocer|dining|restaurant|eating/i.test(group);
}

function sumGroups(months: SpendingMonth[], categories: SpendingCategory[], match: (group: string) => boolean): number {
  const ids = new Set(categories.filter((c) => match(c.group)).map((c) => c.id));
  return months.reduce((sum, month) => sum + [...ids].reduce((subtotal, id) => subtotal + (month.categories[id] ?? 0), 0), 0);
}

/** Net expenses for a selected run of calendar months; refunds offset their original expense category. */
export function rollingSpending(
  snap: Snapshot,
  now = new Date(),
  range: SpendingRangeOptions = { months: 12, includeCurrentMonth: false },
): RollingSpending {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const endMonth = range.includeCurrentMonth ? currentMonth : addMonths(currentMonth, -1);
  const monthCount = Math.max(1, Math.floor(range.months));
  const startMonth = addMonths(endMonth, -(monthCount - 1));
  const months: SpendingMonth[] = Array.from({ length: monthCount }, (_, i) => ({
    month: addMonths(startMonth, i), total: 0, categories: {},
  }));
  const monthByKey = new Map(months.map((month) => [month.month, month]));
  const idx = buildIndexes(snap);
  const onBudgetAccounts = new Set(snap.accounts.filter((account) => !account.offbudget).map((account) => account.id));
  const groupById = new Map(snap.categoryGroups.map((group) => [group.id, group]));
  const otherGroup = snap.categoryGroups.find((group) => !group.is_income && /^other$/i.test(group.name.trim()));
  const categoryInfo = new Map<string, SpendingCategory>();

  for (const tx of snap.transactions) {
    if (tx.is_parent || isTransfer(tx, idx) || excludedByNote(tx.notes)) continue;
    const month = monthByKey.get(tx.date.slice(0, 7));
    if (!month) continue;
    if (!onBudgetAccounts.has(tx.account)) continue;

    const category = tx.category ? idx.categoryById.get(tx.category) : undefined;
    const group = category ? groupById.get(category.group_id) : undefined;
    if (category?.is_income || group?.is_income) continue;
    const name = category?.name ?? 'Uncategorized';
    const groupName = group?.name ?? 'Other';
    if (isStartingBalance(name) || isStartingBalance(groupName)) continue;
    // Uncategorized positive transactions are normally income. Categorized positive
    // transactions remain in the expense series so refunds reduce net spending.
    if (!category && tx.amount > 0) continue;

    const id = category?.id ?? 'uncategorized';
    if (!categoryInfo.has(id)) categoryInfo.set(id, {
      id,
      name,
      groupId: category?.group_id ?? otherGroup?.id ?? 'other',
      group: groupName,
      color: categoryColor(id, name),
    });
    const categoryNetExpense = -tx.amount;
    month.categories[id] = (month.categories[id] ?? 0) + categoryNetExpense;
    month.total += categoryNetExpense;
  }

  const categories = [...categoryInfo.values()].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groupNames = new Map(
    snap.categoryGroups
      .filter((group) => !group.is_income && !isStartingBalance(group.name))
      .map((group) => [group.id, group.name]),
  );
  const groupTotals = new Map([...groupNames.keys()].map((id) => [id, 0]));
  for (const category of categories) {
    const categoryTotal = months.reduce((sum, month) => sum + (month.categories[category.id] ?? 0), 0);
    if (category.groupId === 'uncategorized') {
      groupNames.set('uncategorized', 'Uncategorized');
      groupTotals.set('uncategorized', (groupTotals.get('uncategorized') ?? 0) + categoryTotal);
    } else {
      groupNames.set(category.groupId, category.group);
      groupTotals.set(category.groupId, (groupTotals.get(category.groupId) ?? 0) + categoryTotal);
    }
  }
  const groups = [...groupTotals].map(([id, total], index) => ({
    id,
    name: groupNames.get(id) ?? 'Other',
    total,
    color: groupColor(groupNames.get(id) ?? 'Other', index),
    categories: categories
      .filter((category) => category.groupId === id)
      .map((category) => ({
        id: category.id,
        name: category.name,
        total: months.reduce((sum, month) => sum + (month.categories[category.id] ?? 0), 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).sort((a, b) => groupOrder(a.name) - groupOrder(b.name) || a.name.localeCompare(b.name));
  const total = months.reduce((sum, month) => sum + month.total, 0);
  return {
    months,
    categories,
    groups,
    totals: {
      housing: sumGroups(months, categories, (group) => /housing|home/i.test(group)),
      food: sumGroups(months, categories, foodGroup),
      travel: sumGroups(months, categories, (group) => /travel|vacation/i.test(group)),
      total,
      average: Math.round(total / months.length),
    },
    startMonth,
    endMonth,
  };
}
