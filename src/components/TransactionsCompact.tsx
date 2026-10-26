import { useMemo, useState, type CSSProperties } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { CircleMinus, CirclePlus } from 'lucide-react';
import { formatMoney, formatMoneyWhole } from '../lib/money';
import { isRecurringSpend } from '../lib/recurring-spend';
import type { Snapshot } from '../types';
import type { DrilldownChartFilter, DrilldownExpenseRow } from './SpendingDrilldown';

interface PayeeGroup {
  label: string;
  rows: DrilldownExpenseRow[];
  total: number;
  monthlyAverage: number | null;
  categoryColor: string;
}

function categoryColorFor(rows: DrilldownExpenseRow[]) {
  const totals = new Map<string, { total: number; color: string }>();
  rows.forEach((row) => {
    const current = totals.get(row.categoryId) ?? { total: 0, color: row.categoryColor };
    current.total += row.amount;
    totals.set(row.categoryId, current);
  });
  let dominant: { total: number; color: string } | undefined;
  for (const category of totals.values()) if (!dominant || category.total > dominant.total) dominant = category;
  return dominant?.color ?? 'var(--line-strong)';
}

/** Compact-view fork of the payee and transaction column from Explore spending. */
export function TransactionsCompact({ rows, periodMonths, chartFilter, selectedPayee, onSelectedPayeeChange, currency }: {
  rows: DrilldownExpenseRow[];
  periodMonths: number;
  chartFilter: DrilldownChartFilter;
  selectedPayee: string | null;
  onSelectedPayeeChange: Dispatch<SetStateAction<string | null>>;
  currency: Snapshot['currency'];
}) {
  const [expandedPayeeId, setExpandedPayeeId] = useState<string | null>(null);

  const payeeGroups = useMemo(() => {
    const scopedRows = chartFilter.categoryId
      ? rows.filter((row) => row.categoryId === chartFilter.categoryId)
      : chartFilter.groupId
        ? rows.filter((row) => row.groupId === chartFilter.groupId)
        : rows;
    const totals = new Map<string, DrilldownExpenseRow[]>();
    scopedRows.forEach((row) => {
      const group = totals.get(row.transaction) ?? [];
      group.push(row);
      totals.set(row.transaction, group);
    });
    return [...totals.entries()].map(([label, payeeRows]): PayeeGroup => {
      const total = payeeRows.reduce((sum, row) => sum + row.amount, 0);
      return {
        label,
        rows: payeeRows,
        total,
        monthlyAverage: isRecurringSpend(payeeRows, periodMonths) ? Math.round(total / periodMonths) : null,
        categoryColor: categoryColorFor(payeeRows),
      };
    }).sort((a, b) => b.total - a.total || b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }, [rows, periodMonths, chartFilter.categoryId, chartFilter.groupId]);

  return <section className="transactions-compact-module spending-drilldown-module" aria-label="Compact transactions">
    <section className="spending-drilldown-column spending-drilldown-results" aria-label="Payees and transactions">
      <ul>
        {payeeGroups.map((payee) => {
          const isExpanded = expandedPayeeId === payee.label;
          const transactions = isExpanded
            ? [...payee.rows].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
            : [];
          return <li className="spending-drilldown-payee" key={payee.label} style={{ '--category-color': payee.categoryColor } as CSSProperties}>
            <div className="transactions-compact-payee-heading">
              <button
                type="button"
                className="transactions-compact-payee-toggle"
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${payee.label} transactions`}
                aria-expanded={isExpanded}
                onClick={() => {
                  if (isExpanded) {
                    setExpandedPayeeId(null);
                    return;
                  }
                  setExpandedPayeeId(payee.label);
                  onSelectedPayeeChange(payee.label);
                }}
              >
                {isExpanded ? <CircleMinus size={16} aria-hidden="true" /> : <CirclePlus size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className={`spending-drilldown-payee-row has-category-outline${selectedPayee === payee.label ? ' is-selected' : ''}`}
                aria-label={`Filter transactions by ${payee.label}`}
                aria-pressed={selectedPayee === payee.label}
                onClick={() => onSelectedPayeeChange((current) => current === payee.label ? null : payee.label)}
              >
                <span className="spending-drilldown-item-name" title={payee.label}>{payee.label}</span>
                <span className="spending-drilldown-payee-count">{payee.rows.length.toLocaleString()} tx</span>
                {payee.monthlyAverage !== null && <span className="spending-drilldown-payee-monthly" title="Average per month">{formatMoneyWhole(payee.monthlyAverage, currency)} <small>/mo</small></span>}
                <strong className="spending-drilldown-payee-total">{formatMoneyWhole(payee.total, currency)}</strong>
              </button>
            </div>
            <div className={`spending-drilldown-payee-transactions${isExpanded ? ' is-expanded' : ''}`} aria-hidden={!isExpanded}>
              <div className="spending-drilldown-payee-transactions-inner">
                {isExpanded && <ul className="spending-drilldown-transaction-list">
                  {transactions.map((row) => <li key={row.id}>
                    <div className="spending-drilldown-transaction">
                      <span>{new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <span title={`${row.person} · ${row.transaction}`}>{row.person} · {row.transaction}</span>
                      <strong>{formatMoney(row.amount, currency)}</strong>
                    </div>
                  </li>)}
                </ul>}
              </div>
            </div>
          </li>;
        })}
      </ul>
    </section>
  </section>;
}
