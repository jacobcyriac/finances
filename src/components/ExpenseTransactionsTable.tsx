import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { DropdownMenu } from './ui/DropdownMenu';
import { TypingText } from './ui/FilterAnimations';
import { SpendingDrilldown, type DrilldownChartFilter, type DrilldownExpenseRow } from './SpendingDrilldown';
import { TransactionsCompact } from './TransactionsCompact';
import { buildIndexes, isTransfer } from '../analysis/_shared';
import { spendingGroupColor } from '../analysis/rolling-spending';
import { formatMoney } from '../lib/money';
import { isRecurringSpend } from '../lib/recurring-spend';
import type { DashboardModuleVisibility } from '../lib/dashboard-modules';
import type { Snapshot } from '../types';

type SortKey = 'date' | 'account' | 'person' | 'category' | 'transaction' | 'details' | 'amount';
type RowLimit = 25 | 50 | 100 | 250 | 'all';
type ChartFilter = DrilldownChartFilter;

interface ExpenseRow extends DrilldownExpenseRow {
  id: string;
  account: string;
  person: string;
  details: string;
  searchText: string;
}

const isStartingBalance = (name: string) => /starting\s*balances?/i.test(name.trim());
const excludedByNote = (note: string | null | undefined) => /#(?:noise|payment)\b/i.test(note ?? '');

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function QueryFilterChip({ label, onRemove, color }: { label: string; onRemove: () => void; color?: string }) {
  return <span className={`query-filter-chip${color ? ' is-category' : ''}`} style={color ? { '--filter-chip-color': color } as CSSProperties : undefined}>
    <TypingText key={label} text={label} />
    <button className="query-chip-remove" type="button" aria-label={`Remove ${label} filter`} onClick={onRemove}><X size={15} aria-hidden="true" /></button>
  </span>;
}

export function ExpenseTransactionsTable({ snapshot, startMonth, endMonth, chartFilter, onChartFilterChange, periodControl, onFilteredSummaryChange, onFilteredChartDataChange, onPersonTotalsChange, personFilters, onPersonFiltersChange, onClearAllFilters, clearAllSignal, moduleVisibility, compactView }: {
  snapshot: Snapshot;
  startMonth: string;
  endMonth: string;
  chartFilter: ChartFilter;
  onChartFilterChange: (filter: ChartFilter) => void;
  periodControl: ReactNode;
  onFilteredSummaryChange: (summary: { total: number; annualized: number; monthlyAverage: number; recurring: boolean; transactionCount: number }) => void;
  onFilteredChartDataChange: (data: { totals: Record<string, number>; byMonth: Record<string, Record<string, number>> }) => void;
  onPersonTotalsChange: (totals: Record<string, number>) => void;
  personFilters: string[];
  onPersonFiltersChange: Dispatch<SetStateAction<string[]>>;
  onClearAllFilters: () => void;
  clearAllSignal: number;
  moduleVisibility: DashboardModuleVisibility;
  compactView: boolean;
}) {
  const [search, setSearch] = useState('');
  const [accountFilters, setAccountFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [selectedPayee, setSelectedPayee] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [rowLimit, setRowLimit] = useState<RowLimit>(25);
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [startMonth, endMonth, chartFilter]);
  useEffect(() => {
    setSearch('');
    setAccountFilters([]);
    setCategoryFilters([]);
    setSelectedPayee(null);
    setPage(0);
  }, [clearAllSignal]);

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
    const incomeGroupIds = new Set(snapshot.categoryGroups.filter((group) => group.is_income).map((group) => group.id));
    const groupIndexes = new Map(snapshot.categoryGroups.map((group, index) => [group.id, index]));
    const otherGroup = snapshot.categoryGroups.find((group) => group.name.toLowerCase() === 'other' && !group.is_income);
    const rows = snapshot.transactions.flatMap((tx): ExpenseRow[] => {
      if (tx.is_parent || isTransfer(tx, indexes) || excludedByNote(tx.notes) || !onBudget.has(tx.account)) return [];
      const transactionMonth = tx.date.slice(0, 7);
      if (transactionMonth < startMonth || transactionMonth > endMonth) return [];
      const category = tx.category ? indexes.categoryById.get(tx.category) : undefined;
      const group = category ? groupNames.get(category.group_id) : undefined;
      if (category?.is_income || (category && incomeGroupIds.has(category.group_id))) return [];
      if (isStartingBalance(category?.name ?? '') || isStartingBalance(group ?? '')) return [];
      if (!category && tx.amount > 0) return [];
      const groupName = group ?? 'Other';
      const account = accountNames.get(tx.account) ?? 'Unknown account';
      const person = personByAccount.get(tx.account) ?? 'Ungrouped';
      const transaction = tx.payee ? indexes.payeeById.get(tx.payee)?.name ?? 'Unknown payee' : '—';
      const categoryLabel = `${groupName} · ${category?.name ?? 'Uncategorized'}`;
      const details = tx.notes?.trim() || '—';
      const amount = -tx.amount;
      return [{
        id: tx.id,
        date: tx.date,
        account,
        person,
        transaction,
        category: categoryLabel,
        groupId: category?.group_id ?? otherGroup?.id ?? 'other',
        groupOrder: groupIndexes.get(category?.group_id ?? otherGroup?.id ?? '') ?? Number.MAX_SAFE_INTEGER,
        categoryId: category?.id ?? 'uncategorized',
        categoryColor: spendingGroupColor(groupName, category ? groupIndexes.get(category.group_id) ?? 0 : otherGroup ? groupIndexes.get(otherGroup.id) ?? 0 : 0),
        details,
        amount,
        searchText: [tx.date, account, person, transaction, categoryLabel, details, formatMoney(amount, snapshot.currency)].join(' ').toLocaleLowerCase(),
      }];
    });
    return {
      rows,
      accounts: [...new Set(rows.map((row) => row.account))].sort((a, b) => a.localeCompare(b)),
      people: [...new Set(rows.map((row) => row.person))].sort((a, b) => a.localeCompare(b)),
      categories: [...new Map(rows.map((row) => [row.categoryId, row.category])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [snapshot, startMonth, endMonth]);

  // Search and the account/category controls are shared by the table, charts,
  // person totals and drilldown. Apply them once, then branch by dimension.
  const searchedRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return rows.filter((row) =>
      (accountFilters.length === 0 || accountFilters.includes(row.account)) &&
      (categoryFilters.length === 0 || categoryFilters.includes(row.categoryId)) &&
      (!needle || row.searchText.includes(needle)),
    );
  }, [rows, search, accountFilters, categoryFilters]);

  const personScopedRows = useMemo(() => personFilters.length
    ? searchedRows.filter((row) => personFilters.includes(row.person))
    : searchedRows, [searchedRows, personFilters]);

  const matchingRows = useMemo(() => {
    const categoryIds = chartFilter.categoryIds ? new Set(chartFilter.categoryIds) : null;
    const filtered = personScopedRows.filter((row) =>
      (!chartFilter.month || row.date.slice(0, 7) === chartFilter.month) &&
      (!categoryIds || categoryIds.has(row.categoryId)),
    );
    return filtered.sort((a, b) => {
      const result = compare(a[sortKey], b[sortKey]);
      return (sortDirection === 'asc' ? result : -result) || a.id.localeCompare(b.id);
    });
  }, [personScopedRows, chartFilter.month, chartFilter.categoryIds, sortKey, sortDirection]);

  const drilldownRows = useMemo(() => chartFilter.month
    ? personScopedRows.filter((row) => row.date.slice(0, 7) === chartFilter.month)
    : personScopedRows, [personScopedRows, chartFilter.month]);

  const filteredRows = useMemo(() => selectedPayee
    ? matchingRows.filter((row) => row.transaction === selectedPayee)
    : matchingRows, [matchingRows, selectedPayee]);
  const chartSelectedPayee = compactView ? null : selectedPayee;

  const personTotals = useMemo(() => {
    const categoryIds = chartFilter.categoryIds ? new Set(chartFilter.categoryIds) : null;
    return searchedRows.reduce<Record<string, number>>((totals, row) => {
      if (chartFilter.month && row.date.slice(0, 7) !== chartFilter.month) return totals;
      if (categoryIds && !categoryIds.has(row.categoryId)) return totals;
      if (chartSelectedPayee && row.transaction !== chartSelectedPayee) return totals;
      totals[row.person] = (totals[row.person] ?? 0) + row.amount;
      return totals;
    }, {});
  }, [searchedRows, chartFilter.month, chartFilter.categoryIds, chartSelectedPayee]);

  useEffect(() => onPersonTotalsChange(personTotals), [personTotals, onPersonTotalsChange]);

  const chartRows = useMemo(() => chartSelectedPayee
    ? personScopedRows.filter((row) => row.transaction === chartSelectedPayee)
    : personScopedRows, [personScopedRows, chartSelectedPayee]);

  const filteredChartData = useMemo(() => chartRows.reduce((data, row) => {
    data.totals[row.categoryId] = (data.totals[row.categoryId] ?? 0) + row.amount;
    const month = row.date.slice(0, 7);
    data.byMonth[month] ??= {};
    data.byMonth[month][row.categoryId] = (data.byMonth[month][row.categoryId] ?? 0) + row.amount;
    return data;
  }, { totals: {} as Record<string, number>, byMonth: {} as Record<string, Record<string, number>> }), [chartRows]);

  useEffect(() => onFilteredChartDataChange(filteredChartData), [filteredChartData, onFilteredChartDataChange]);

  const topPayees = useMemo(() => {
    const totals = new Map<string, { transactions: number; total: number }>();
    for (const row of matchingRows) {
      if (row.transaction === '—') continue;
      const current = totals.get(row.transaction) ?? { transactions: 0, total: 0 };
      current.transactions += 1;
      current.total += row.amount;
      totals.set(row.transaction, current);
    }
    const ranked = [...totals.entries()]
      .map(([payee, summary]) => ({ payee, ...summary }))
      .sort((a, b) => b.total - a.total || b.transactions - a.transactions || a.payee.localeCompare(b.payee))
      .slice(0, 10);
    if (selectedPayee && !ranked.some((payee) => payee.payee === selectedPayee)) {
      const selected = totals.get(selectedPayee) ?? { transactions: 0, total: 0 };
      ranked.splice(9, 1, { payee: selectedPayee, ...selected });
    }
    return ranked;
  }, [matchingRows, selectedPayee]);

  const filteredTotal = filteredRows.reduce((sum, row) => sum + row.amount, 0);
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  const periodMonths = chartFilter.month ? 1 : Math.max(1, (endYear - startYear) * 12 + endMonthNumber - startMonthNumber + 1);
  const filteredMonthlyAverage = Math.round(filteredTotal / periodMonths);
  const recurring = isRecurringSpend(filteredRows, periodMonths);
  useLayoutEffect(() => {
    onFilteredSummaryChange({ total: filteredTotal, annualized: filteredMonthlyAverage * 12, monthlyAverage: filteredMonthlyAverage, recurring, transactionCount: filteredRows.length });
  }, [filteredTotal, filteredMonthlyAverage, recurring, filteredRows.length, onFilteredSummaryChange]);

  const pageSize = rowLimit === 'all' ? filteredRows.length : rowLimit;
  const pageCount = pageSize ? Math.ceil(filteredRows.length / pageSize) : 0;
  const visibleRows = rowLimit === 'all' ? filteredRows : filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const firstRow = filteredRows.length ? (rowLimit === 'all' ? 1 : page * pageSize + 1) : 0;
  const lastRow = rowLimit === 'all' ? filteredRows.length : Math.min((page + 1) * pageSize, filteredRows.length);

  const toggleFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
    setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
    setPage(0);
  };
  const togglePersonFilter = (value: string) => {
    onPersonFiltersChange((current) => current.length === 1 && current[0] === value ? [] : [value]);
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
  const filterHeader = (key: SortKey, label: string, labelText: string, values: string[], onToggle: (value: string) => void, options: { value: string; label: string }[], allLabel: string) => <th aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <div className="table-header-controls">
      <button className="table-sort" type="button" onClick={() => chooseSort(key)}>{label}{sortKey === key ? (sortDirection === 'asc' ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />) : null}</button>
      <DropdownMenu className="table-header-filter" triggerIconOnly label={`Filter by ${labelText.toLowerCase()}`} allLabel={allLabel} values={values} onChange={() => undefined} onToggle={onToggle} options={options} />
    </div>
  </th>;
  const removeChartFilter = () => onChartFilterChange({ month: chartFilter.month });
  const showAllTransactionsPrefix = !search.trim() && !chartFilter.groupName && !selectedPayee && accountFilters.length === 0 && personFilters.length === 0 && categoryFilters.length === 0;
  const chartCategoryColor = chartFilter.categoryId ? rows.find((row) => row.categoryId === chartFilter.categoryId)?.categoryColor : undefined;
  const clearAllFilters = () => onClearAllFilters();
  const showDrilldown = compactView ? moduleVisibility.transactionsCompact : moduleVisibility.drilldown;
  const hasTransactionModules = showDrilldown || moduleVisibility.payees || moduleVisibility.transactions;

  return <>
    {moduleVisibility.search && <div className="transaction-query-wrap">
    <section className="transaction-query-bar" aria-label="Transaction search and period">
      <div className="transaction-query-main">
        <div className="transaction-search-label" role="search">
          <div className="transaction-period-chip">{periodControl}</div>
          {showAllTransactionsPrefix && <span className="query-empty-title"><TypingText key="all-transactions" text="All transactions" /></span>}
          {chartFilter.groupName && <QueryFilterChip label={chartFilter.categoryName ?? chartFilter.groupName} color={chartCategoryColor} onRemove={removeChartFilter} />}
          {selectedPayee && <QueryFilterChip label={selectedPayee} onRemove={() => { setSelectedPayee(null); setPage(0); }} />}
          {accountFilters.map((value) => <QueryFilterChip key={`account-${value}`} label={value} onRemove={() => setAccountFilters((current) => current.filter((item) => item !== value))} />)}
          {personFilters.map((value) => <QueryFilterChip key={`person-${value}`} label={value} onRemove={() => onPersonFiltersChange((current) => current.filter((item) => item !== value))} />)}
          {categoryFilters.map((value) => {
            const categoryLabel = categories.find(([id]) => id === value)?.[1] ?? value;
            const color = rows.find((row) => row.categoryId === value)?.categoryColor;
            return <QueryFilterChip key={`category-${value}`} label={categoryLabel.split(' · ').at(-1) ?? categoryLabel} color={color} onRemove={() => setCategoryFilters((current) => current.filter((item) => item !== value))} />;
          })}
          <input className="input" type="text" aria-label="Search expenses" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search people, tags, payees" />
        </div>
        <button className="query-clear-all" type="button" onClick={clearAllFilters} aria-label="Clear all filters" title="Clear all filters"><X size={32} strokeWidth={1.7} aria-hidden="true" /></button>
      </div>
    </section>
    </div>}
    {hasTransactionModules && <section className="panel table-panel expense-table-panel dashboard-block">
    {showDrilldown && (compactView
      ? <TransactionsCompact
        rows={drilldownRows}
        periodMonths={periodMonths}
        chartFilter={chartFilter}
        selectedPayee={selectedPayee}
        onSelectedPayeeChange={setSelectedPayee}
        currency={snapshot.currency}
      />
      : <SpendingDrilldown
        rows={drilldownRows}
        periodMonths={periodMonths}
        chartFilter={chartFilter}
        onChartFilterChange={onChartFilterChange}
        selectedPayee={selectedPayee}
        onSelectedPayeeChange={setSelectedPayee}
        currency={snapshot.currency}
      />)}
    {moduleVisibility.payees && <section className="top-payees-module" aria-labelledby="top-payees-heading">
      <div className="top-payees-heading">
        <h2 id="top-payees-heading">Top payees</h2>
        <span>By total spend · Click to filter</span>
      </div>
      {topPayees.length ? <ol className="top-payees-list">
        {topPayees.map((payee) => <li key={payee.payee} className={selectedPayee && selectedPayee !== payee.payee ? 'is-dimmed' : undefined}>
          <button className="top-payee-row" type="button" aria-pressed={selectedPayee === payee.payee} onClick={() => { setSelectedPayee((current) => current === payee.payee ? null : payee.payee); setPage(0); }}>
            <span className="top-payee-name" title={payee.payee}>{payee.payee}</span>
            <span className="top-payee-count">{payee.transactions.toLocaleString()} <span>tx</span></span>
            <span className="top-payee-total">{formatMoney(payee.total, snapshot.currency)}</span>
          </button>
        </li>)}
      </ol> : <p className="top-payees-empty">No payees match these filters.</p>}
    </section>}
    {moduleVisibility.transactions && <div className="expense-transactions-module">
    <div className="table-scroll expense-table-scroll">
      <table className="expense-table">
        <colgroup>
          <col className="expense-col-date" /><col className="expense-col-account" /><col className="expense-col-person" />
          <col className="expense-col-category" /><col className="expense-col-transaction" /><col className="expense-col-details" /><col className="expense-col-amount" />
        </colgroup>
        <thead><tr>
          {sortHeader('date', 'Date')}
          {filterHeader('account', 'Source account', 'source account', accountFilters, toggleFilter(setAccountFilters), accounts.map((account) => ({ value: account, label: account })), 'All accounts')}
          {filterHeader('person', 'Person', 'person', personFilters, togglePersonFilter, people.map((person) => ({ value: person, label: person })), 'All people')}
          {filterHeader('category', 'Category', 'category', categoryFilters, toggleFilter(setCategoryFilters), categories.map(([id, name]) => ({ value: id, label: name })), 'All categories')}
          {sortHeader('transaction', 'Transaction')}{sortHeader('details', 'Details')}{sortHeader('amount', 'Amount')}
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
      <div className="expense-footer-actions">
      <label className="expense-footer-rows"><span>Rows</span><DropdownMenu className="rows-dropdown" label="Rows per page" value={String(rowLimit)} onChange={(next) => { setRowLimit(next === 'all' ? 'all' : Number(next) as Exclude<RowLimit, 'all'>); setPage(0); }} options={[
        { value: '25', label: '25' }, { value: '50', label: '50' }, { value: '100', label: '100' }, { value: '250', label: '250' }, { value: 'all', label: 'All' },
      ]} /></label>
      {rowLimit !== 'all' && <div className="expense-pagination">
        <button className="btn-ghost" type="button" disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
        <span>{pageCount ? `${page + 1} / ${pageCount}` : '0 / 0'}</span>
        <button className="btn-ghost" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</button>
      </div>}
      </div>
    </div>
    </div>}
    </section>}
  </>;
}
