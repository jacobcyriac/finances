import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { DropdownMenu } from './ui/DropdownMenu';
import { buildIndexes, isTransfer } from '../analysis/_shared';
import { spendingGroupColor } from '../analysis/rolling-spending';
import { formatMoney } from '../lib/money';
import type { Snapshot } from '../types';

type SortKey = 'date' | 'account' | 'person' | 'category' | 'transaction' | 'details' | 'amount';
type RowLimit = 25 | 50 | 100 | 250 | 'all';
interface ChartFilter {
  month?: string;
  groupName?: string;
  categoryName?: string;
  categoryIds?: string[];
}

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

export function ExpenseTransactionsTable({ snapshot, startMonth, endMonth, monthCount, chartFilter, onClearChartFilter }: {
  snapshot: Snapshot;
  startMonth: string;
  endMonth: string;
  monthCount: number;
  chartFilter: ChartFilter;
  onClearChartFilter: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const stickyToolsRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [accountFilters, setAccountFilters] = useState<string[]>([]);
  const [personFilters, setPersonFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [rowLimit, setRowLimit] = useState<RowLimit>(25);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const panel = panelRef.current;
    const stickyTools = stickyToolsRef.current;
    if (!panel || !stickyTools) return;
    const updateToolsHeight = () => panel.style.setProperty('--expense-tools-height', `${stickyTools.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(updateToolsHeight);
    observer.observe(stickyTools);
    updateToolsHeight();
    return () => {
      observer.disconnect();
      panel.style.removeProperty('--expense-tools-height');
    };
  }, []);

  useEffect(() => setPage(0), [startMonth, endMonth, chartFilter]);

  const { rows, accounts, people, categories } = useMemo(() => {
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
      people: [...new Set(rows.map((row) => row.person))].sort((a, b) => a.localeCompare(b)),
      categories: [...new Map(rows.map((row) => [row.categoryId, row.category])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [snapshot, startMonth, endMonth]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) =>
      (!chartFilter.month || row.date.slice(0, 7) === chartFilter.month) &&
      (!chartFilter.categoryIds || chartFilter.categoryIds.includes(row.categoryId)) &&
      (accountFilters.length === 0 || accountFilters.includes(row.account)) &&
      (personFilters.length === 0 || personFilters.includes(row.person)) &&
      (categoryFilters.length === 0 || categoryFilters.includes(row.categoryId)) &&
      (!needle || [row.date, row.account, row.person, row.transaction, row.category, row.details, formatMoney(row.amount, snapshot.currency)]
        .some((value) => value.toLocaleLowerCase().includes(needle))),
    );
    const sorted = filtered.slice().sort((a, b) => {
      const result = compare(a[sortKey], b[sortKey]);
      return (sortDirection === 'asc' ? result : -result) || a.id.localeCompare(b.id);
    });
    return sorted;
  }, [rows, search, chartFilter, accountFilters, personFilters, categoryFilters, sortKey, sortDirection, snapshot.currency]);

  const summaryMonthCount = chartFilter.month ? 1 : monthCount;

  const filteredSummary = useMemo(() => {
    const total = filteredRows.reduce((sum, row) => sum + row.amount, 0);
    return { total, monthlyAverage: summaryMonthCount ? total / summaryMonthCount : 0 };
  }, [filteredRows, summaryMonthCount]);

  const pageSize = rowLimit === 'all' ? filteredRows.length : rowLimit;
  const pageCount = pageSize ? Math.ceil(filteredRows.length / pageSize) : 0;
  const visibleRows = rowLimit === 'all' ? filteredRows : filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const firstRow = filteredRows.length ? (rowLimit === 'all' ? 1 : page * pageSize + 1) : 0;
  const lastRow = rowLimit === 'all' ? filteredRows.length : Math.min((page + 1) * pageSize, filteredRows.length);

  const toggleFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
    setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
    setPage(0);
  };
  const chooseSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection(key === 'date' || key === 'amount' ? 'desc' : 'asc'); }
    setPage(0);
  };
  const sortHeader = (key: SortKey, label: string) => <th aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button className="table-sort" type="button" onClick={() => chooseSort(key)}>{label}{sortKey === key ? (sortDirection === 'asc' ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />) : null}</button>
  </th>;

  return <section ref={panelRef} className="panel table-panel expense-table-panel dashboard-block">
    <div ref={stickyToolsRef} className="expense-table-sticky-tools">
      <div className="section-heading">
        <div><h2>Transactions</h2></div>
        <div className="expense-row-summary" aria-label="Filtered expense summary">
          <div><strong>{filteredRows.length.toLocaleString()}</strong><span>transactions</span></div>
          <div><strong>{formatMoney(filteredSummary.total, snapshot.currency)}</strong><span>filtered total</span></div>
          <div><strong>{formatMoney(filteredSummary.monthlyAverage, snapshot.currency)}</strong><span>monthly average · {summaryMonthCount} {summaryMonthCount === 1 ? 'month' : 'months'}</span></div>
        </div>
      </div>
      {(chartFilter.month || chartFilter.groupName) && <div className="chart-filter-chip" role="status">
        <span>Chart filter</span>
        {chartFilter.month && <strong>{new Date(`${chartFilter.month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong>}
        {chartFilter.groupName && <strong>{chartFilter.categoryName ? `${chartFilter.groupName} · ${chartFilter.categoryName}` : chartFilter.groupName}</strong>}
        <button className="chart-filter-clear" type="button" onClick={onClearChartFilter}>Clear</button>
      </div>}
      <div className="expense-table-controls">
        <label className="expense-search-label">
          <span className="sr-only">Search expenses</span>
          <Search className="expense-search-icon" size={14} aria-hidden="true" />
          <input className="input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search payee, note, date…" />
        </label>
        <div className="expense-filter-label"><span>Source</span>
          <DropdownMenu className="filter-dropdown" label="Filter by source account" allLabel="All accounts" values={accountFilters} onChange={() => undefined} onToggle={toggleFilter(setAccountFilters)} options={accounts.map((account) => ({ value: account, label: account }))} />
        </div>
        <div className="expense-filter-label"><span>Person</span>
          <DropdownMenu className="filter-dropdown" label="Filter by person" allLabel="All people" values={personFilters} onChange={() => undefined} onToggle={toggleFilter(setPersonFilters)} options={people.map((person) => ({ value: person, label: person }))} />
        </div>
        <div className="expense-filter-label"><span>Category</span>
          <DropdownMenu className="filter-dropdown" label="Filter by category" allLabel="All categories" values={categoryFilters} onChange={() => undefined} onToggle={toggleFilter(setCategoryFilters)} options={categories.map(([id, name]) => ({ value: id, label: name }))} />
        </div>
        <label className="expense-filter-label rows-filter"><span>Rows</span>
          <DropdownMenu className="rows-dropdown" label="Rows per page" value={String(rowLimit)} onChange={(next) => { setRowLimit(next === 'all' ? 'all' : Number(next) as Exclude<RowLimit, 'all'>); setPage(0); }} options={[
            { value: '25', label: '25' }, { value: '50', label: '50' }, { value: '100', label: '100' }, { value: '250', label: '250' }, { value: 'all', label: 'All' },
          ]} />
        </label>
      </div>
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
  </section>;
}
