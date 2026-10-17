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
  group: string;
  color: string;
}

export interface RollingSpending {
  months: SpendingMonth[];
  categories: SpendingCategory[];
  totals: { housing: number; food: number; travel: number; total: number; average: number };
  startMonth: string;
  endMonth: string;
}

const COLORS = [
  '#7c83ff', '#49b8a3', '#f2a65a', '#e47791', '#68a6e8', '#b28de0',
  '#d4be62', '#4aa4a1', '#da7e53', '#8da85d', '#cf71c3', '#8492a6',
];

function fixedColor(id: string): string {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return COLORS[(hash >>> 0) % COLORS.length];
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

/** Completed 12-month net expenses; refunds offset their original expense category. */
export function rollingSpending(snap: Snapshot, now = new Date()): RollingSpending {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const endMonth = addMonths(currentMonth, -1);
  const startMonth = addMonths(endMonth, -11);
  const months: SpendingMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: addMonths(startMonth, i), total: 0, categories: {},
  }));
  const monthByKey = new Map(months.map((month) => [month.month, month]));
  const idx = buildIndexes(snap);
  const onBudgetAccounts = new Set(snap.accounts.filter((account) => !account.offbudget).map((account) => account.id));
  const groupById = new Map(snap.categoryGroups.map((group) => [group.id, group]));
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
    const groupName = group?.name ?? 'Uncategorized';
    if (isStartingBalance(name) || isStartingBalance(groupName)) continue;
    // Uncategorized positive transactions are normally income. Categorized positive
    // transactions remain in the expense series so refunds reduce net spending.
    if (!category && tx.amount > 0) continue;

    const id = category?.id ?? 'uncategorized';
    if (!categoryInfo.has(id)) categoryInfo.set(id, {
      id,
      name,
      group: groupName,
      color: fixedColor(id),
    });
    const categoryNetExpense = -tx.amount;
    month.categories[id] = (month.categories[id] ?? 0) + categoryNetExpense;
    month.total += categoryNetExpense;
  }

  const categories = [...categoryInfo.values()].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const total = months.reduce((sum, month) => sum + month.total, 0);
  return {
    months,
    categories,
    totals: {
      housing: sumGroups(months, categories, (group) => /housing|home/i.test(group)),
      food: sumGroups(months, categories, foodGroup),
      travel: sumGroups(months, categories, (group) => /travel|vacation/i.test(group)),
      total,
      average: Math.round(total / 12),
    },
    startMonth,
    endMonth,
  };
}
