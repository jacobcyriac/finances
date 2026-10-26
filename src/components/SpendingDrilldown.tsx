import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, CircleMinus, CirclePlus } from 'lucide-react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { formatMoney, formatMoneyWhole } from '../lib/money';
import { isRecurringSpend } from '../lib/recurring-spend';
import type { Snapshot } from '../types';

export interface DrilldownChartFilter {
  source?: 'categories' | 'monthly';
  selectionOrigin?: 'chart' | 'pills';
  month?: string;
  groupId?: string;
  groupName?: string;
  categoryId?: string;
  categoryName?: string;
  categoryIds?: string[];
}

export interface DrilldownExpenseRow {
  id: string;
  date: string;
  person: string;
  transaction: string;
  category: string;
  groupId: string;
  groupOrder: number;
  categoryId: string;
  categoryColor: string;
  amount: number;
}

interface DrilldownItem {
  id: string;
  label: string;
  transactions: number;
  total: number;
  categoryColor?: string;
  categoryIds?: string[];
  groupId?: string;
  groupLabel?: string;
}

const summarize = (id: string, label: string, rows: DrilldownExpenseRow[], categoryIds?: string[]): DrilldownItem => ({
  id,
  label,
  transactions: rows.length,
  total: rows.reduce((sum, row) => sum + row.amount, 0),
  categoryIds,
});

const dominantCategoryColor = (rows: DrilldownExpenseRow[]) => {
  const totals = new Map<string, { total: number; color: string }>();
  rows.forEach((row) => {
    const current = totals.get(row.categoryId) ?? { total: 0, color: row.categoryColor };
    current.total += row.amount;
    totals.set(row.categoryId, current);
  });
  let dominant: { total: number; color: string } | undefined;
  for (const category of totals.values()) if (!dominant || category.total > dominant.total) dominant = category;
  return dominant?.color;
};

const TransactionList = memo(function TransactionList({ rows, currency }: {
  rows: DrilldownExpenseRow[];
  currency: Snapshot['currency'];
}) {
  return <ul className="spending-drilldown-transaction-list">
    {rows.map((row) => <li key={row.id}>
      <div className="spending-drilldown-transaction">
        <span>{new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span title={`${row.person} · ${row.transaction}`}>{row.person} · {row.transaction}</span>
        <strong>{formatMoney(row.amount, currency)}</strong>
      </div>
    </li>)}
  </ul>;
});

export function SpendingDrilldown({ rows, periodMonths, chartFilter, onChartFilterChange, selectedPayee, onSelectedPayeeChange, currency }: {
  rows: DrilldownExpenseRow[];
  periodMonths: number;
  chartFilter: DrilldownChartFilter;
  onChartFilterChange: (filter: DrilldownChartFilter) => void;
  selectedPayee: string | null;
  onSelectedPayeeChange: Dispatch<SetStateAction<string | null>>;
  currency: Snapshot['currency'];
}) {
  const [activeColumn, setActiveColumn] = useState(0);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string> | null>(null);
  const [optimisticCollapsedGroupId, setOptimisticCollapsedGroupId] = useState<string | null>(null);
  const [pendingAllSelection, setPendingAllSelection] = useState(false);
  const [expandedPayeeId, setExpandedPayeeId] = useState<string | null>(selectedPayee);
  const [closingPayee, setClosingPayee] = useState<string | null>(null);
  const previousPayee = useRef(expandedPayeeId);
  const [slideDirection, setSlideDirection] = useState<'forward' | 'back'>('forward');
  const pendingGroupSelection = useRef<{ frame: number; timer: number } | null>(null);
  const pendingPayeeSelection = useRef<{ frame: number; timer: number } | null>(null);
  const cancelPendingPayeeSelection = () => {
    if (!pendingPayeeSelection.current) return;
    window.cancelAnimationFrame(pendingPayeeSelection.current.frame);
    window.clearTimeout(pendingPayeeSelection.current.timer);
    pendingPayeeSelection.current = null;
  };
  const cancelPendingGroupSelection = () => {
    if (!pendingGroupSelection.current) return;
    window.cancelAnimationFrame(pendingGroupSelection.current.frame);
    window.clearTimeout(pendingGroupSelection.current.timer);
    pendingGroupSelection.current = null;
  };
  useEffect(() => () => {
    if (pendingGroupSelection.current) {
      window.cancelAnimationFrame(pendingGroupSelection.current.frame);
      window.clearTimeout(pendingGroupSelection.current.timer);
    }
    if (pendingPayeeSelection.current) {
      window.cancelAnimationFrame(pendingPayeeSelection.current.frame);
      window.clearTimeout(pendingPayeeSelection.current.timer);
    }
  }, []);
  useEffect(() => {
    if (pendingGroupSelection.current) cancelPendingGroupSelection();
    setPendingAllSelection(false);
    setOptimisticCollapsedGroupId(null);
  }, [chartFilter]);
  useEffect(() => {
    cancelPendingPayeeSelection();
    setExpandedPayeeId(selectedPayee);
  }, [selectedPayee]);
  const selectGroupAfterPaint = (filter: DrilldownChartFilter) => {
    cancelPendingGroupSelection();
    cancelPendingPayeeSelection();
    setExpandedPayeeId(null);
    const pending = { frame: 0, timer: 0 };
    pending.frame = window.requestAnimationFrame(() => {
      pending.timer = window.setTimeout(() => {
        pendingGroupSelection.current = null;
        startTransition(() => {
          onChartFilterChange(filter);
          onSelectedPayeeChange(null);
        });
      }, 0);
    });
    pendingGroupSelection.current = pending;
  };
  const selectPayeeAfterPaint = (payee: string | null) => {
    cancelPendingPayeeSelection();
    setPendingAllSelection(false);
    setExpandedPayeeId(payee);
    const pending = { frame: 0, timer: 0 };
    pending.frame = window.requestAnimationFrame(() => {
      pending.timer = window.setTimeout(() => {
        pendingPayeeSelection.current = null;
        startTransition(() => onSelectedPayeeChange(payee));
      }, 0);
    });
    pendingPayeeSelection.current = pending;
  };
  const navigateToColumn = (column: number) => {
    if (column === activeColumn) return;
    setSlideDirection(column > activeColumn ? 'forward' : 'back');
    setActiveColumn(column);
  };
  useEffect(() => {
    const targetColumn = expandedPayeeId || chartFilter.categoryId ? 1 : null;
    if (targetColumn === null) return;
    setActiveColumn((current) => {
      if (current === targetColumn) return current;
      setSlideDirection(targetColumn > current ? 'forward' : 'back');
      return targetColumn;
    });
  }, [chartFilter.categoryId, expandedPayeeId]);
  useLayoutEffect(() => {
    const previous = previousPayee.current;
    previousPayee.current = expandedPayeeId;
    if (!previous || previous === expandedPayeeId) {
      setClosingPayee(null);
      return;
    }
    setClosingPayee(previous);
    const timer = window.setTimeout(() => setClosingPayee((current) => current === previous ? null : current), 240);
    return () => window.clearTimeout(timer);
  }, [expandedPayeeId]);
  const groups = useMemo(() => {
    const totals = new Map<string, DrilldownExpenseRow[]>();
    rows.forEach((row) => {
      if (!totals.has(row.groupId)) totals.set(row.groupId, []);
      totals.get(row.groupId)!.push(row);
    });
    return [...totals.entries()].map(([id, groupRows]) => summarize(
      id,
      groupRows[0]?.category.split(' · ')[0] ?? id,
      groupRows,
      [...new Set(groupRows.map((row) => row.categoryId))],
    )).map((group) => ({
      ...group,
      groupOrder: totals.get(group.id)?.[0]?.groupOrder ?? Number.MAX_SAFE_INTEGER,
      categoryColor: totals.get(group.id)?.[0]?.categoryColor,
    }))
      .sort((a, b) => a.groupOrder - b.groupOrder || a.label.localeCompare(b.label));
  }, [rows]);
  const largestGroupTotal = Math.max(0, ...groups.map((group) => group.total));

  // Keep every category available in this column. Active group/category filters
  // only affect emphasis here and the actual downstream drilldown results.
  const categoryRows = rows;
  const categories = useMemo(() => {
    const totals = new Map<string, DrilldownExpenseRow[]>();
    categoryRows.forEach((row) => {
      if (!totals.has(row.categoryId)) totals.set(row.categoryId, []);
      totals.get(row.categoryId)!.push(row);
    });
    const groupOrder = new Map(groups.map((group, index) => [group.id, index]));
    return [...totals.entries()].map(([id, category]) => ({
      ...summarize(id, category[0]?.category.split(' · ').at(-1) ?? id, category),
      categoryColor: dominantCategoryColor(category),
      groupId: category[0]?.groupId,
      groupLabel: category[0]?.category.split(' · ')[0] ?? '',
    })).sort((a, b) => (groupOrder.get(a.groupId ?? '') ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(b.groupId ?? '') ?? Number.MAX_SAFE_INTEGER)
      || b.total - a.total || a.label.localeCompare(b.label));
  }, [categoryRows, groups]);
  const largestCategoryTotal = Math.max(0, ...categories.map((category) => category.total));

  // Scope the payee tree to the active category or group. Keep the payee rows
  // available when a payee itself is selected, so that selection can be changed.
  const payeeRows = useMemo(() => {
    if (chartFilter.categoryId) return rows.filter((row) => row.categoryId === chartFilter.categoryId);
    if (chartFilter.groupId) return rows.filter((row) => row.groupId === chartFilter.groupId);
    return rows;
  }, [rows, chartFilter.categoryId, chartFilter.groupId]);
  const payeeGroups = useMemo(() => {
    const totals = new Map<string, DrilldownExpenseRow[]>();
    payeeRows.forEach((row) => {
      if (!totals.has(row.transaction)) totals.set(row.transaction, []);
      totals.get(row.transaction)!.push(row);
    });
    return [...totals.entries()].map(([label, payeeRows]) => {
      const item = { ...summarize(label, label, payeeRows), categoryColor: dominantCategoryColor(payeeRows) };
      return {
        item,
        transactions: payeeRows,
        monthlyAverage: isRecurringSpend(payeeRows, periodMonths) ? Math.round(item.total / periodMonths) : null,
      };
    }).sort((a, b) => b.item.total - a.item.total || b.item.transactions - a.item.transactions || a.item.label.localeCompare(b.item.label));
  }, [payeeRows, periodMonths]);
  const visiblePayeeTransactions = useMemo(() => new Map(payeeGroups
    .filter(({ item }) => item.id === expandedPayeeId || item.id === closingPayee)
    .map(({ item, transactions }) => [item.id, [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))])),
  [payeeGroups, expandedPayeeId, closingPayee]);

  const allCategories = useMemo(() => summarize('__all_categories__', 'All categories', categoryRows), [categoryRows]);
  const firstExpandableGroupId = groups.find((group) => (group.categoryIds?.length ?? 0) > 1)?.id;
  const drilldownAccentColor = chartFilter.categoryId
    ? categories.find((item) => item.id === chartFilter.categoryId)?.categoryColor ?? 'var(--line-strong)'
    : chartFilter.groupId
      ? groups.find((group) => group.id === chartFilter.groupId)?.categoryColor ?? 'var(--line-strong)'
      : 'var(--line-strong)';
  const selectCategory = (category: DrilldownItem) => {
    cancelPendingGroupSelection();
    cancelPendingPayeeSelection();
    setPendingAllSelection(false);
    setExpandedPayeeId(null);
    onChartFilterChange({ ...chartFilter, source: 'categories', groupId: category.groupId, groupName: category.groupLabel, categoryId: category.id, categoryName: category.label, categoryIds: [category.id] });
    onSelectedPayeeChange(null);
    navigateToColumn(1);
  };
  const selectAllCategories = () => {
    setPendingAllSelection(true);
    selectGroupAfterPaint(chartFilter.month ? { month: chartFilter.month } : {});
    navigateToColumn(1);
  };
  const isAllSelected = pendingAllSelection || (!chartFilter.groupId && !chartFilter.categoryId);

  return <section className="spending-drilldown-module" aria-label="Explore spending">
    <nav className="spending-drilldown-breadcrumbs" aria-label="Explore spending navigation">
      {[
        { label: 'Categories', column: 0 },
        { label: chartFilter.categoryName ?? chartFilter.groupName ?? 'Payees', column: 1 },
      ].map((crumb, index) => <span className="spending-drilldown-crumb" key={`${crumb.column}-${crumb.label}`}>
        {index > 0 && <span className="spending-drilldown-crumb-separator" aria-hidden="true">›</span>}
        <button type="button" aria-current={activeColumn === crumb.column ? 'step' : undefined} onClick={() => navigateToColumn(crumb.column)}>{crumb.label}</button>
      </span>)}
    </nav>
    <div className="spending-drilldown-columns">
      <section className={`spending-drilldown-column spending-drilldown-categories${activeColumn === 0 ? ` is-active is-${slideDirection}` : ''}`} aria-label="Categories">
        <ul>
          {[
            <li className="spending-drilldown-group spending-drilldown-group-block" key="all-categories">
                <div className={`spending-drilldown-group-row spending-drilldown-all-row${isAllSelected ? ' is-selected' : ''}`} style={{ '--category-color': 'var(--text-dim)', '--spend-fill-width': '80%' } as CSSProperties}>
                  <span className="spending-drilldown-group-spacer" aria-hidden="true"><CirclePlus className="spending-drilldown-group-symbol is-disabled" size={16} /></span>
                  <button type="button" className="spending-drilldown-group-filter" aria-pressed={isAllSelected} onClick={selectAllCategories}>
                    <span className="spending-drilldown-item-name">All</span>
                    <strong>{formatMoneyWhole(allCategories.total, currency)}</strong>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </div>
            </li>,
            ...groups.map((group) => {
                const groupCategories = categories.filter((item) => item.groupId === group.id);
                const canExpand = groupCategories.length > 1;
                const isExpanded = canExpand && (expandedGroupIds === null
                  ? group.id === firstExpandableGroupId
                  : expandedGroupIds.has(group.id));
                const groupColor = group.categoryColor ?? 'var(--line-strong)';
                const isSelectedGroup = chartFilter.groupId === group.id && (!chartFilter.categoryId || optimisticCollapsedGroupId === group.id);
                return <li className="spending-drilldown-group-block" key={`group-${group.id}`}><ul>
                  <li className="spending-drilldown-group">
                    <div
                      className={`spending-drilldown-group-header${isSelectedGroup ? ' is-selected' : ''}`}
                      style={{
                        '--category-color': groupColor,
                        '--spend-fill-width': `${largestGroupTotal > 0 ? Math.min(80, Math.max(0, group.total / largestGroupTotal * 80)) : 0}%`,
                      } as CSSProperties}
                    >
                      <button
                        type="button"
                        className="spending-drilldown-group-toggle"
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${group.label}`}
                        aria-expanded={canExpand ? isExpanded : undefined}
                        disabled={!canExpand}
                        onClick={() => {
                          setExpandedGroupIds((current) => {
                            const next = new Set(current ?? (firstExpandableGroupId ? [firstExpandableGroupId] : []));
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          });
                          if (isExpanded && chartFilter.groupId === group.id && chartFilter.categoryId) {
                            setOptimisticCollapsedGroupId(group.id);
                            selectGroupAfterPaint({
                              ...chartFilter,
                              source: 'categories',
                              groupId: group.id,
                              groupName: group.label,
                              categoryId: undefined,
                              categoryName: undefined,
                              categoryIds: group.categoryIds,
                            });
                          }
                        }}
                      >
                        {isExpanded ? <CircleMinus className="spending-drilldown-group-symbol" size={16} aria-hidden="true" /> : <CirclePlus className="spending-drilldown-group-symbol" size={16} aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        className="spending-drilldown-group-select"
                        aria-pressed={isSelectedGroup}
                        onClick={() => {
                        cancelPendingPayeeSelection();
                        setPendingAllSelection(false);
                        setExpandedPayeeId(null);
                        navigateToColumn(1);
                        if (isSelectedGroup && !selectedPayee) cancelPendingGroupSelection();
                        else selectGroupAfterPaint({ ...chartFilter, source: 'categories', groupId: group.id, groupName: group.label, categoryId: undefined, categoryName: undefined, categoryIds: group.categoryIds });
                      }}
                      >
                      <span className="spending-drilldown-item-name">{group.label}</span>
                      <strong>{formatMoneyWhole(group.total, currency)}</strong>
                      <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                  {groupCategories.map((item) => <li className={`spending-drilldown-category-child${isExpanded ? ' is-expanded' : ''}`} key={item.id} aria-hidden={!isExpanded}>
                    <button
                      type="button"
                      tabIndex={isExpanded ? 0 : -1}
                      className={`has-category-outline has-spend-bar${chartFilter.categoryId === item.id ? ' is-selected' : ''}`}
                      style={{
                        '--category-color': item.categoryColor ?? 'var(--line-strong)',
                        '--spend-fill-width': `${largestCategoryTotal > 0 ? Math.min(80, Math.max(0, item.total / largestCategoryTotal * 80)) : 0}%`,
                      } as CSSProperties}
                      aria-pressed={chartFilter.categoryId === item.id}
                      onClick={() => selectCategory(item)}
                    >
                      <span className="spending-drilldown-item-name" title={item.label}>{item.label}</span>
                      <strong>{formatMoneyWhole(item.total, currency)}</strong>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </li>)}
                </ul></li>;
            }),
          ]}
        </ul>
      </section>
      <section className={`spending-drilldown-column spending-drilldown-results${activeColumn === 1 ? ` is-active is-${slideDirection}` : ''}`} style={{ '--drilldown-accent-color': drilldownAccentColor } as CSSProperties} aria-label="Payees and transactions">
        <ul>
          {payeeGroups.map(({ item, monthlyAverage }) => {
            const isExpanded = expandedPayeeId === item.id;
            const hasVisibleTransactions = isExpanded || closingPayee === item.id;
            return <li className="spending-drilldown-payee" key={item.id} style={{ '--category-color': item.categoryColor ?? 'var(--line-strong)' } as CSSProperties}>
              <button
                type="button"
                className={`spending-drilldown-payee-row has-category-outline${isExpanded ? ' is-selected' : ''}`}
                aria-expanded={isExpanded}
                aria-pressed={isExpanded}
                onClick={() => {
                  cancelPendingGroupSelection();
                  selectPayeeAfterPaint(isExpanded ? null : item.id);
                }}
              >
                <span className="spending-drilldown-item-name" title={item.label}>{item.label}</span>
                <span className="spending-drilldown-payee-count">{item.transactions.toLocaleString()} tx</span>
                {monthlyAverage !== null && <span className="spending-drilldown-payee-monthly" title="Average per month">{formatMoney(monthlyAverage, currency)} <small>/mo</small></span>}
                <strong className="spending-drilldown-payee-total">{formatMoney(item.total, currency)}</strong>
              </button>
              <div className={`spending-drilldown-payee-transactions${isExpanded ? ' is-expanded' : ''}`} aria-hidden={!isExpanded}>
                <div className="spending-drilldown-payee-transactions-inner">
                  {hasVisibleTransactions && <TransactionList rows={visiblePayeeTransactions.get(item.id) ?? []} currency={currency} />}
                </div>
              </div>
            </li>;
          })}
        </ul>
      </section>
    </div>
  </section>;
}
