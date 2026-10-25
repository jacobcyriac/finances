import type { CurrencyFormat } from '../../types';
import { SpendingColumns } from './SpendingColumns';

const PEOPLE = ['Jacob', 'Prachi', 'Joint'] as const;

export function PersonSpendingBars({ totals, currency, selectedPerson, onSelect }: {
  totals: Record<string, number>;
  currency: CurrencyFormat;
  selectedPerson: string | null;
  onSelect: (person: string | null) => void;
}) {
  const allTotal = Object.values(totals).reduce((sum, total) => sum + total, 0);
  return <div className="person-total-chart" role="group" aria-label="Filter by person">
    <SpendingColumns
      variant="people"
      currency={currency}
      selection={{ columnId: selectedPerson ?? 'all' }}
      columns={[
        { id: 'all', label: 'All', total: allTotal, onSelect: () => onSelect(null) },
        ...PEOPLE.map((person) => ({ id: person, label: person, total: totals[person] ?? 0, onSelect: () => onSelect(person) })),
      ].map((person) => ({
        ...person,
        color: 'var(--brand)',
        segments: [{ id: 'total', label: person.label, amount: person.total, color: 'var(--brand)', onSelect: person.onSelect }],
      }))}
    />
  </div>;
}
