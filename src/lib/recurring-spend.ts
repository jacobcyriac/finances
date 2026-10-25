export function isRecurringSpend(rows: readonly { date: string }[], periodMonths: number): boolean {
  if (rows.length < 6 || periodMonths < 2) return false;
  const activeMonths = new Set(rows.map((row) => row.date.slice(0, 7))).size;
  return activeMonths >= 2 && rows.length / periodMonths * 12 >= 6;
}
