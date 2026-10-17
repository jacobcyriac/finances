import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { rollingSpending } from './rolling-spending';

function fixture(): Snapshot {
  return {
    budgetName: 'Fixture',
    currency: { code: 'USD', symbol: '$', symbolFirst: true },
    accounts: [
      { id: 'checking', name: 'Checking', offbudget: false, closed: false, balance: 0 },
      { id: 'brokerage', name: 'Brokerage', offbudget: true, closed: false, balance: 0 },
    ],
    categories: [
      { id: 'rent', name: 'Rent', group_id: 'housing', is_income: false },
      { id: 'groceries', name: 'Groceries', group_id: 'food', is_income: false },
      { id: 'flight', name: 'Flights', group_id: 'travel', is_income: false },
      { id: 'salary', name: 'Salary', group_id: 'income', is_income: true },
      { id: 'opening', name: 'Starting Balances', group_id: 'starting', is_income: false },
    ],
    categoryGroups: [
      { id: 'housing', name: 'Housing', is_income: false },
      { id: 'food', name: 'Food', is_income: false },
      { id: 'travel', name: 'Travel', is_income: false },
      { id: 'income', name: 'Income', is_income: true },
      { id: 'starting', name: 'Starting Balances', is_income: false },
    ],
    payees: [{ id: 'transfer-payee', name: 'Transfer', transfer_acct: 'brokerage' }],
    transactions: [
      { id: 'rent', account: 'checking', date: '2026-09-01', amount: -100_000, payee: null, category: 'rent', transfer_id: null, is_parent: false, is_child: false },
      { id: 'refund', account: 'checking', date: '2026-09-03', amount: 10_000, payee: null, category: 'rent', transfer_id: null, is_parent: false, is_child: false },
      { id: 'food', account: 'checking', date: '2026-09-04', amount: -5_000, payee: null, category: 'groceries', transfer_id: null, is_parent: false, is_child: false },
      { id: 'travel', account: 'checking', date: '2026-09-05', amount: -20_000, payee: null, category: 'flight', transfer_id: null, is_parent: false, is_child: false },
      { id: 'uncategorized', account: 'checking', date: '2026-09-06', amount: -1_000, payee: null, category: null, transfer_id: null, is_parent: false, is_child: false },
      { id: 'noise', account: 'checking', date: '2026-09-07', amount: -50_000, payee: null, category: 'rent', transfer_id: null, is_parent: false, is_child: false, notes: 'reimbursement #noise' },
      { id: 'payment', account: 'checking', date: '2026-09-08', amount: -50_000, payee: null, category: 'rent', transfer_id: null, is_parent: false, is_child: false, notes: '#payment' },
      { id: 'income', account: 'checking', date: '2026-09-09', amount: 500_000, payee: null, category: 'salary', transfer_id: null, is_parent: false, is_child: false },
      { id: 'opening', account: 'checking', date: '2026-09-10', amount: 900_000, payee: null, category: 'opening', transfer_id: null, is_parent: false, is_child: false },
      { id: 'transfer', account: 'checking', date: '2026-09-11', amount: -40_000, payee: 'transfer-payee', category: null, transfer_id: 'transfer-1', is_parent: false, is_child: false },
      { id: 'offbudget', account: 'brokerage', date: '2026-09-12', amount: -70_000, payee: null, category: 'travel', transfer_id: null, is_parent: false, is_child: false },
      { id: 'old', account: 'checking', date: '2025-09-30', amount: -90_000, payee: null, category: 'rent', transfer_id: null, is_parent: false, is_child: false },
      { id: 'current', account: 'checking', date: '2026-10-01', amount: -90_000, payee: null, category: 'rent', transfer_id: null, is_parent: false, is_child: false },
    ],
    generatedAt: '2026-10-17T12:00:00.000Z',
  };
}

describe('rollingSpending', () => {
  it('uses 12 completed months and applies the same net expense filters to category totals', () => {
    const result = rollingSpending(fixture(), new Date(2026, 9, 17));
    expect(result.startMonth).toBe('2025-10');
    expect(result.endMonth).toBe('2026-09');
    expect(result.months).toHaveLength(12);
    expect(result.months.at(-1)?.total).toBe(116_000);
    expect(result.totals).toEqual({ housing: 90_000, food: 5_000, travel: 20_000, total: 116_000, average: 9_667 });
    expect(result.months.at(-1)?.categories.uncategorized).toBe(1_000);
    expect(result.categories.map((category) => category.name)).not.toContain('Salary');
    expect(result.categories.map((category) => category.name)).not.toContain('Starting Balances');
  });

  it('keeps each category color stable across repeated calculations', () => {
    const first = rollingSpending(fixture(), new Date(2026, 9, 17));
    const second = rollingSpending(fixture(), new Date(2026, 9, 17));
    expect(first.categories.map(({ id, color }) => [id, color])).toEqual(second.categories.map(({ id, color }) => [id, color]));
  });
});
