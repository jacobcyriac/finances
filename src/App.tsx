import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { getSnapshot, disconnect } from './api/client';
import { Login } from './components/Login';
import { rollingSpending } from './analysis/rolling-spending';
import { formatMoney, formatCompact } from './lib/money';
import type { CurrencyFormat } from './types';

const monthName = (key: string, options: Intl.DateTimeFormatOptions = { month: 'short', year: '2-digit' }) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, options);

function TotalLabel(props: { x?: string | number; y?: string | number; value?: string | number; currency: CurrencyFormat }) {
  if (props.x == null || props.y == null || props.value == null) return null;
  const x = Number(props.x);
  const y = Number(props.y);
  const value = Number(props.value);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) return null;
  return <text x={x} y={y - 5} textAnchor="middle" fill="#c6c8d4" fontSize={10}>
    {formatCompact(value, props.currency)}
  </text>;
}

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail: string; color?: string }) {
  return <div className="panel metric-card">
    <div className="label">{label}</div>
    <div className="metric-value" style={color ? { color } : undefined}>{value}</div>
    <div className="metric-detail">{detail}</div>
  </div>;
}

function SpendingDashboard({ snapshot, onDisconnect }: { snapshot: NonNullable<Awaited<ReturnType<typeof getSnapshot>>>; onDisconnect: () => void }) {
  const period = useMemo(() => rollingSpending(snapshot), [snapshot]);
  const currency = snapshot.currency;
  const fmt = (value: number) => formatMoney(value, currency);
  const disconnectMutation = useMutation({ mutationFn: disconnect, onSuccess: onDisconnect });
  const data = period.months.map((month) => ({ ...month, label: monthName(month.month) }));
  const categoryNames = new Map(period.categories.map((category) => [category.id, category.name]));

  return <main className="dashboard-shell">
    <header className="page-header">
      <div>
        <div className="eyebrow"><span className="status-dot" /> Actual Budget · Spending</div>
        <h1>{snapshot.budgetName}</h1>
        <p className="subtitle">Net expenses for the 12 completed months from {monthName(period.startMonth, { month: 'long', year: 'numeric' })} through {monthName(period.endMonth, { month: 'long', year: 'numeric' })}.</p>
      </div>
      <div className="header-actions">
        {currency.code && <span className="chip">{currency.code}</span>}
        <button className="btn-ghost" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>Disconnect</button>
      </div>
    </header>

    <section className="metric-grid" aria-label="12-month spending summary">
      <MetricCard label="Housing" value={fmt(period.totals.housing)} detail="12-month total" color="#76a8f5" />
      <MetricCard label="Food" value={fmt(period.totals.food)} detail="12-month total" color="#55c4a6" />
      <MetricCard label="Travel" value={fmt(period.totals.travel)} detail="12-month total" color="#f0aa65" />
      <MetricCard label="Total spending" value={fmt(period.totals.total)} detail="All included categories" />
      <MetricCard label="Monthly average" value={fmt(period.totals.average)} detail="Total divided by 12" />
    </section>

    <section className="panel chart-panel">
      <div className="section-heading">
        <div><h2>Monthly spending</h2><p>Stacked by category · refunds reduce the category they belong to</p></div>
        <div className="chart-total">{fmt(period.totals.total)} <span>12 months</span></div>
      </div>
      {period.categories.length === 0 ? <div className="empty-chart">No eligible expenses were found in this period.</div> : <>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 34, right: 10, left: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="rgba(170,175,200,.12)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} />
              <YAxis axisLine={false} tickLine={false} width={56} tickFormatter={(value) => formatCompact(value, currency)} />
              <Tooltip
                cursor={{ fill: 'rgba(160,165,190,.07)' }}
                formatter={(value, name) => [fmt(Number(value ?? 0)), categoryNames.get(String(name)) ?? String(name)]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.month ? monthName(payload[0].payload.month, { month: 'long', year: 'numeric' }) : ''}
                contentStyle={{ background: '#20232c', border: '1px solid #3c414e', borderRadius: 12, color: '#f4f4f8' }}
              />
              {period.categories.map((category) => <Bar key={category.id} dataKey={`categories.${category.id}`} name={category.id} stackId="spend" fill={category.color} maxBarSize={38} isAnimationActive={false} />)}
              <Line type="monotone" dataKey="total" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false}>
                <LabelList dataKey="total" content={(props) => <TotalLabel {...props} currency={currency} />} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="legend-list" aria-label="Category colors">
          {period.categories.map((category) => <span key={category.id}><i style={{ background: category.color }} />{category.name}</span>)}
        </div>
      </>}
    </section>

    <section className="panel table-panel">
      <div className="section-heading">
        <div><h2>Monthly detail</h2><p>Amounts shown as positive net spending; refunds are deducted.</p></div>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Month</th>{period.categories.map((category) => <th key={category.id} className="numeric">{category.name}</th>)}<th className="numeric total-col">Total</th></tr></thead>
          <tbody>{data.map((month) => <tr key={month.month}>
            <th scope="row">{monthName(month.month, { month: 'long', year: 'numeric' })}</th>
            {period.categories.map((category) => <td className="numeric" key={category.id}>{fmt(month.categories[category.id] ?? 0)}</td>)}
            <td className="numeric total-col">{fmt(month.total)}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row">12-month total</th>{period.categories.map((category) => <td className="numeric" key={category.id}>{fmt(period.months.reduce((sum, month) => sum + (month.categories[category.id] ?? 0), 0))}</td>)}<td className="numeric total-col">{fmt(period.totals.total)}</td></tr></tfoot>
        </table>
      </div>
      <div className="footnote">Income and starting balance categories, transfers, and transactions tagged <code>#noise</code> or <code>#payment</code> are excluded. Uncategorized expenses are included.</div>
    </section>

    <footer>Read-only analysis · Data is processed in this browser · Last loaded {new Date(snapshot.generatedAt).toLocaleString()}</footer>
  </main>;
}

function LoadingNote() {
  return <div className="center-note">Loading your budget…</div>;
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const { data: snapshot, isLoading, error } = useQuery({ queryKey: ['snapshot'], queryFn: getSnapshot, enabled: connected });
  if (!connected) return <Login onConnected={() => setConnected(true)} />;
  if (isLoading) return <LoadingNote />;
  if (error || !snapshot) return <div className="center-note">Could not load the budget snapshot. Disconnect and reconnect to try again.</div>;
  return <SpendingDashboard snapshot={snapshot} onDisconnect={() => setConnected(false)} />;
}
