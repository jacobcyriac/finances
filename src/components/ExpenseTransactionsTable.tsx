import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { buildIndexes, isTransfer } from '../analysis/_shared';
import { spendingGroupColor } from '../analysis/rolling-spending';
import { formatMoney } from '../lib/money';
import type { Snapshot } from '../types';

type SortKey = 'date' | 'account' | 'person' | 'category' | 'transaction' | 'details' | 'amount';
type RowLimit = 25 | 50 | 100 | 250 | 'all';

interface ExpenseRow {
  id: string;
  date: string;
  account: string;
  person: string;
  transaction: string;
  category: string;
  categoryId: string;
  categoryColor: string;
  details: string;
  amount: number;
}

const isStartingBalance = (name: string) => /starting\s*balances?/i.test(name.trim());
const excludedByNote = (note: string | null | undefined) => /#(?:noise|payment)\b/i.test(note ?? '');

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function ExpenseTransactionsTable({ snapshot, startMonth, endMonth, monthCount }: { snapshot: Snapshot; startMonth: string; endMonth: string; monthCount: number }) {
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [rowLimit, setRowLimit] = useState<RowLimit>(25);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [startMonth, endMonth]);

  const { rows, accounts, categories } = useMemo(() => {
    const indexes = buildIndexes(snapshot);
    const onBudget = new Set(snapshot.accounts.filter((account) => !account.offbudget).map((account) => account.id));
    const accountNames = new Map(snapshot.accounts.map((account) => [account.id, account.name]));
    const accountGroups = new Map((snapshot.accountGroups ?? []).map((group) => [group.id, group.name]));
    const personByAccount = new Map(snapshot.accounts.map((account) => [
      account.id,
      account.account_group_id ? accountGroups.get(account.account_group_id) ?? 'Ungrouped' : 'Ungrouped',
    ]));
    const groupNames = new Map(snapshot.categoryGroups.map((group) => [group.id, group.name]));
    const groupIndexes = new Map(snapshot.categoryGroups.map((group, index) => [group.id, index]));
    const rows = snapshot.transactions.flatMap((tx): ExpenseRow[] => {
      if (tx.is_parent || isTransfer(tx, indexes) || excludedByNote(tx.notes) || !onBudget.has(tx.account)) return [];
      const transactionMonth = tx.date.slice(0, 7);
      if (transactionMonth < startMonth || transactionMonth > endMonth) return [];
      const category = tx.category ? indexes.categoryById.get(tx.category) : undefined;
      const group = category ? groupNames.get(category.group_id) : undefined;
      if (category?.is_income || (category && snapshot.categoryGroups.find((item) => item.id === category.group_id)?.is_income)) return [];
      if (isStartingBalance(category?.name ?? '') || isStartingBalance(group ?? '')) return [];
      if (!category && tx.amount > 0) return [];
      const groupName = group ?? 'Other';
      return [{
        id: tx.id,
        date: tx.date,
        account: accountNames.get(tx.account) ?? 'Unknown account',
        person: personByAccount.get(tx.account) ?? 'Ungrouped',
        transaction: tx.payee ? indexes.payeeById.get(tx.payee)?.name ?? 'Unknown payee' : '—',
        category: `${groupName} · ${category?.name ?? 'Uncategorized'}`,
        categoryId: category?.id ?? 'uncategorized',
        categoryColor: spendingGroupColor(groupName, category ? groupIndexes.get(category.group_id) ?? 0 : 0),
        details: tx.notes?.trim() || '—',
        amount: -tx.amount,
      }];
    });
    return {
      rows,
      accounts: [...new Set(rows.map((row) => row.account))].sort((a, b) => a.localeCompare(b)),
      categories: [...new Map(rows.map((row) => [row.categoryId, row.category])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [snapshot, startMonth, endMonth]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) =>
      (accountFilter === 'all' || row.account === accountFilter) &&
      (categoryFilter === 'all' || row.categoryId === categoryFilter) &&
      (!needle || [row.date, row.account, row.person, row.transaction, row.category, row.details, formatMoney(row.amount, snapshot.currency)]
        .some((value) => value.toLocaleLowerCase().includes(needle))),
    );
    const sorted = filtered.slice().sort((a, b) => {
      const result = compare(a[sortKey], b[sortKey]);
      return (sortDirection === 'asc' ? result : -result) || a.id.localeCompare(b.id);
    });
    return sorted;
  }, [rows, search, accountFilter, categoryFilter, sortKey, sortDirection, snapshot.currency]);

  const filteredSummary = useMemo(() => {
    const total = filteredRows.reduce((sum, row) => sum + row.amount, 0);
    return { total, monthlyAverage: monthCount ? total / monthCount : 0 };
  }, [filteredRows, monthCount]);

  const pageSize = rowLimit === 'all' ? filteredRows.length : rowLimit;
  const pageCount = pageSize ? Math.ceil(filteredRows.length / pageSize) : 0;
  const visibleRows = rowLimit === 'all' ? filteredRows : filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const firstRow = filteredRows.length ? (rowLimit === 'all' ? 1 : page * pageSize + 1) : 0;
  const lastRow = rowLimit === 'all' ? filteredRows.length : Math.min((page + 1) * pageSize, filteredRows.length);

  const setFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
  };
  const chooseSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection(key === 'date' || key === 'amount' ? 'desc' : 'asc'); }
    setPage(0);
  };
  const sortHeader = (key: SortKey, label: string) => <th aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button className="table-sort" type="button" onClick={() => chooseSort(key)}>{label}{sortKey === key ? <span aria-hidden="true">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span> : null}</button>
  </th>;

  return <section className="panel table-panel expense-table-panel">
    <div className="section-heading">
      <div><h2>Expenses in selected period</h2><p>Refunds appear as negative amounts</p></div>
      <div className="expense-row-summary" aria-label="Filtered expense summary">
        <div><strong>{filteredRows.length.toLocaleString()}</strong><span>transactions</span></div>
        <div><strong>{formatMoney(filteredSummary.total, snapshot.currency)}</strong><span>filtered total</span></div>
        <div><strong>{formatMoney(filteredSummary.monthlyAverage, snapshot.currency)}</strong><span>monthly average · {monthCount} {monthCount === 1 ? 'month' : 'months'}</span></div>
      </div>
    </div>
    <div className="expense-table-controls">
      <label className="expense-search-label">
        <span className="sr-only">Search expenses</span>
        <input className="input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search payee, note, date…" />
      </label>
      <label className="expense-filter-label"><span>Source</span>
        <select className="theme-select" value={accountFilter} onChange={(event) => setFilter(setAccountFilter)(event.target.value)}>
          <option value="all">All accounts</option>{accounts.map((account) => <option key={account} value={account}>{account}</option>)}
        </select>
      </label>
      <label className="expense-filter-label"><span>Category</span>
        <select className="theme-select" value={categoryFilter} onChange={(event) => setFilter(setCategoryFilter)(event.target.value)}>
          <option value="all">All categories</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="expense-filter-label rows-filter"><span>Rows</span>
        <select className="theme-select" value={rowLimit} onChange={(event) => { setRowLimit(event.target.value === 'all' ? 'all' : Number(event.target.value) as Exclude<RowLimit, 'all'>); setPage(0); }}>
          <option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="250">250</option><option value="all">All</option>
        </select>
      </label>
    </div>
    <div className="table-scroll expense-table-scroll">
      <table className="expense-table">
        <colgroup>
          <col className="expense-col-date" /><col className="expense-col-account" /><col className="expense-col-person" />
          <col className="expense-col-category" /><col className="expense-col-transaction" /><col className="expense-col-details" /><col className="expense-col-amount" />
        </colgroup>
        <thead><tr>
          {sortHeader('date', 'Date')}{sortHeader('account', 'Source account')}{sortHeader('person', 'Person')}
          {sortHeader('category', 'Category')}{sortHeader('transaction', 'Transaction')}{sortHeader('details', 'Details')}{sortHeader('amount', 'Amount')}
        </tr></thead>
        <tbody>{visibleRows.map((row) => <tr key={row.id}>
          <td>{new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
          <td>{row.account}</td><td>{row.person}</td><td><span className="expense-category-pill" title={row.category} style={{ '--category-color': row.categoryColor } as CSSProperties}>{row.category}</span></td><td>{row.transaction}</td><td className="expense-details-cell" title={row.details}>{row.details}</td>
          <td className={`numeric expense-amount ${row.amount < 0 ? 'is-refund' : ''}`}>{formatMoney(row.amount, snapshot.currency)}</td>
        </tr>)}
        {visibleRows.length === 0 && <tr><td className="expense-empty-cell" colSpan={7}>No expenses match these filters.</td></tr>}</tbody>
      </table>
    </div>
    <div className="expense-table-footer">
      <span>Showing {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {filteredRows.length.toLocaleString()}</span>
      {rowLimit !== 'all' && <div className="expense-pagination">
        <button className="btn-ghost" type="button" disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
        <span>{pageCount ? `${page + 1} / ${pageCount}` : '0 / 0'}</span>
        <button className="btn-ghost" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button>
      </div>}
    </div>
    <p className="footnote">Person is the transaction’s account group (for example, Jacob, Prachi, or Joint). Transfers, income, starting balances, and transactions tagged <code>#noise</code> or <code>#payment</code> are excluded.</p>
  </section>;
}
