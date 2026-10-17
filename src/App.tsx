import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { connect, getSnapshot, updateFromServer, disconnect } from './api/client';
import { Login } from './components/Login';
import { Dashboard as NetWorthDashboard } from './components/Dashboard';
import { SpendingTreemap } from './components/charts/SpendingTreemap';
import { GroupStackedBars } from './components/charts/GroupStackedBars';
import { ExpenseTransactionsTable } from './components/ExpenseTransactionsTable';
import { clearSessionCredentials, loadSessionCredentials, saveSessionCredentials } from './lib/session';
import { loadCachedSnapshot, saveCachedSnapshot } from './snapshot/cache';
import { availableSpendingRanges, rollingSpending } from './analysis/rolling-spending';
import { formatMoney, formatCompact } from './lib/money';
import type { ConnectRequest, CurrencyFormat } from './types';

type ThemePreference = 'system' | 'light' | 'dark';
const THEME_STORAGE_KEY = 'finance-dashboard-theme';

function getSavedTheme(): ThemePreference {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function ThemeControl({ value, onChange }: { value: ThemePreference; onChange: (value: ThemePreference) => void }) {
  return <label className="theme-control">
    <span>Theme</span>
    <select className="theme-select" value={value} onChange={(event) => onChange(event.target.value as ThemePreference)} aria-label="Color theme">
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>;
}

const monthName = (key: string, options: Intl.DateTimeFormatOptions = { month: 'short', year: '2-digit' }) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, options);

function TotalLabel(props: { x?: string | number; y?: string | number; value?: string | number; currency: CurrencyFormat }) {
  if (props.x == null || props.y == null || props.value == null) return null;
  const x = Number(props.x);
  const y = Number(props.y);
  const value = Number(props.value);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) return null;
  return <text x={x} y={y - 5} textAnchor="middle" fill="var(--chart-total-label)" fontSize={10}>
    {formatCompact(value, props.currency)}
  </text>;
}

function groupFill(colorToken: string): string {
  const named = colorToken.match(/--(spend-[a-z-]+)/)?.[1];
  if (named) return `var(--${named}-tile)`;
  const series = colorToken.match(/--series-(\d+)/)?.[1] ?? '1';
  return `var(--treemap-series-${series})`;
}

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail: string; color?: string }) {
  return <div className="metric-card">
    <div className="label">{label}</div>
    <div className="metric-reading">
      <div className="metric-value" style={color ? { color } : undefined}>{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  </div>;
}

function SpendingDashboard({ snapshot, onDisconnect }: { snapshot: NonNullable<Awaited<ReturnType<typeof getSnapshot>>>; onDisconnect: () => void }) {
  const [spendingView, setSpendingView] = useState<'treemap' | 'bars'>('treemap');
  const [rangeValue, setRangeValue] = useState('rolling-12');
  const rangeOptions = useMemo(() => availableSpendingRanges(snapshot), [snapshot]);
  const defaultRange = rangeOptions.find((option) => option.value === 'rolling-12')
    ?? rangeOptions.filter((option) => option.kind === 'rolling').at(-1)
    ?? rangeOptions[0];
  const range = rangeOptions.find((option) => option.value === rangeValue) ?? defaultRange;
  const rollingRanges = rangeOptions.filter((option) => option.kind === 'rolling');
  const yearRanges = rangeOptions.filter((option) => option.kind === 'year');
  const period = useMemo(() => rollingSpending(snapshot, new Date(), {
    months: range.months,
    startMonth: range.startMonth,
    endMonth: range.endMonth,
    includeCurrentMonth: range.kind === 'month',
  }), [snapshot, range]);
  const showPeriodTotal = period.months.length !== 12;
  const currency = snapshot.currency;
  const fmt = (value: number) => formatMoney(value, currency);
  const fmtWhole = (value: number) => formatMoney(Math.round(value / 100) * 100, currency).replace(/\.00(?=\D|$)/, '');
  const disconnectMutation = useMutation({ mutationFn: disconnect, onSuccess: onDisconnect });
  const data = period.months.map((month) => ({
    ...month,
    label: monthName(month.month),
    groups: Object.fromEntries(period.groups.map((group) => [
      group.id,
      group.categories.reduce((sum, category) => sum + (month.categories[category.id] ?? 0), 0),
    ])),
  }));
  const groupNames = new Map(period.groups.map((group) => [group.id, group.name]));

  return <main className="dashboard-shell">
    <header className="page-header">
      <div>
        <div className="eyebrow"><span className="status-dot" /> Actual Budget · Spending</div>
        <h1>{snapshot.budgetName}</h1>
        <p className="subtitle">{period.startMonth === period.endMonth
          ? `Net expenses for ${monthName(period.startMonth, { month: 'long', year: 'numeric' })}.`
          : `Net expenses from ${monthName(period.startMonth, { month: 'short', year: 'numeric' })} through ${monthName(period.endMonth, { month: 'short', year: 'numeric' })}.`}</p>
        <div className="period-controls" aria-label="Spending date range">
          <label className="period-select-label"><span>Period</span>
            <select className="theme-select" value={range.value} onChange={(event) => setRangeValue(event.target.value)}>
              <option value="this-month">This month</option>
              {rollingRanges.length > 0 && <optgroup label="Rolling periods">
                {rollingRanges.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </optgroup>}
              {yearRanges.length > 0 && <optgroup label="Calendar years">
                {yearRanges.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </optgroup>}
            </select>
          </label>
        </div>
      </div>
      <div className="header-actions">
        {currency.code && <span className="chip">{currency.code}</span>}
        <button className="btn-ghost" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>Disconnect</button>
      </div>
    </header>

    <section className="spending-summary" aria-label={`${range.label} spending summary`}>
      <div className={`metric-grid metric-grid-overview${showPeriodTotal ? ' metric-grid-three' : ''}`}>
        {showPeriodTotal && <MetricCard label="Total spending" value={fmtWhole(period.totals.total)} detail={range.label} />}
        <MetricCard label="Annualized spending" value={fmtWhole(period.totals.average * 12)} detail="/year" />
        <MetricCard label="Monthly average" value={fmtWhole(period.totals.average)} detail="/month" />
      </div>
    </section>

    <section className="panel chart-panel treemap-panel">
      <div className="section-heading">
        <div>
          <h2>Spending by group &amp; category</h2>
          <p>{spendingView === 'treemap' ? 'Group columns · category tiles sized by 12-month net spending' : 'Horizontal stacked bars · category segments sized within each group'}</p>
        </div>
        <div className="spending-view-toggle" role="group" aria-label="Spending chart view">
          <button type="button" aria-label="Treemap view" title="Treemap view" aria-pressed={spendingView === 'treemap'} onClick={() => setSpendingView('treemap')}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="7" rx="1"/><rect x="12.5" y="2.5" width="5" height="4" rx="1"/><rect x="12.5" y="7.5" width="5" height="10" rx="1"/><rect x="2.5" y="10.5" width="9" height="7" rx="1"/></svg>
          </button>
          <button type="button" aria-label="Stacked bar view" title="Stacked bar view" aria-pressed={spendingView === 'bars'} onClick={() => setSpendingView('bars')}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 4.5h5v3h-5zM7.5 4.5h7v3h-7zM14.5 4.5h3v3h-3zM2.5 9.5h3v3h-3zM5.5 9.5h8v3h-8zM13.5 9.5h4v3h-4zM2.5 14.5h7v3h-7zM9.5 14.5h4v3h-4zM13.5 14.5h4v3h-4z"/></svg>
          </button>
        </div>
      </div>
      {spendingView === 'treemap'
        ? <SpendingTreemap groups={period.groups} currency={currency} />
        : <GroupStackedBars groups={period.groups} currency={currency} />}
    </section>

    <section className="panel chart-panel">
      <div className="section-heading">
        <div><h2>Monthly spending</h2><p>Stacked by group · refunds reduce the group they belong to</p></div>
        <div className="chart-total">{fmt(period.totals.total)} <span>12 months</span></div>
      </div>
      {period.groups.length === 0 ? <div className="empty-chart">No eligible expenses were found in this period.</div> : <>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 34, right: 10, left: 8, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} />
              <YAxis axisLine={false} tickLine={false} width={56} tickFormatter={(value) => formatCompact(value, currency)} />
              <Tooltip
                cursor={{ fill: 'var(--chart-cursor)' }}
                formatter={(value, name) => [fmt(Number(value ?? 0)), groupNames.get(String(name)) ?? String(name)]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.month ? monthName(payload[0].payload.month, { month: 'long', year: 'numeric' }) : ''}
                contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 12, color: 'var(--text)' }}
              />
              {period.groups.map((group) => <Bar key={group.id} dataKey={`groups.${group.id}`} name={group.id} stackId="spend" fill={groupFill(group.color)} maxBarSize={38} isAnimationActive={false} />)}
              <Line type="monotone" dataKey="total" stroke="transparent" dot={false} activeDot={false} isAnimationActive={false}>
                <LabelList dataKey="total" content={(props) => <TotalLabel {...props} currency={currency} />} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="legend-list" aria-label="Spending group colors">
          {period.groups.map((group) => <span key={group.id}><i style={{ background: groupFill(group.color) }} />{group.name}</span>)}
        </div>
      </>}
    </section>

    <ExpenseTransactionsTable snapshot={snapshot} startMonth={period.startMonth} endMonth={period.endMonth} monthCount={period.months.length} />

  <footer>Read-only analysis · Data is processed in this browser</footer>
  </main>;
}

function LoadingNote() {
  return <div className="center-note">Loading your budget…</div>;
}

export default function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(() => {
    const credentials = loadSessionCredentials();
    return { credentials, connected: Boolean(credentials) };
  });
  const [cacheReady, setCacheReady] = useState(false);
  const apiConnected = useRef(false);
  const skipNextUpdate = useRef(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'net-worth'>('expenses');
  const [theme, setTheme] = useState<ThemePreference>(getSavedTheme);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);
  useEffect(() => {
    let active = true;
    void loadCachedSnapshot().then((cached) => {
      if (!active) return;
      if (cached) queryClient.setQueryData(['snapshot'], cached);
      setCacheReady(true);
    });
    return () => { active = false; };
  }, [queryClient]);
  const { data: snapshot, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['snapshot'],
    queryFn: async () => {
      if (session.credentials) {
        if (!apiConnected.current) {
          await connect(session.credentials);
          apiConnected.current = true;
        } else if (skipNextUpdate.current) {
          // The login form already synchronized the budget before opening the dashboard.
          skipNextUpdate.current = false;
        } else {
          await updateFromServer();
        }
      }
      const latest = await getSnapshot();
      if (session.credentials) await saveCachedSnapshot(latest).catch(() => {});
      return latest;
    },
    enabled: session.connected && cacheReady,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const onConnected = (credentials: ConnectRequest | null) => {
    if (credentials) {
      saveSessionCredentials(credentials);
      apiConnected.current = true; // Login has already downloaded and synchronized the budget.
      skipNextUpdate.current = true;
    } else {
      clearSessionCredentials(); // Demo and file import connections have no server login to resume.
      apiConnected.current = false;
      skipNextUpdate.current = false;
    }
    setSession({ credentials, connected: true });
  };
  const onDisconnect = () => {
    clearSessionCredentials();
    apiConnected.current = false;
    skipNextUpdate.current = false;
    setSession({ credentials: null, connected: false });
  };
  if (!session.connected) return <>
    <div className="login-theme-control"><ThemeControl value={theme} onChange={setTheme} /></div>
    <Login onConnected={onConnected} />
  </>;
  if (!cacheReady || (isLoading && !snapshot)) return <LoadingNote />;
  if (!snapshot) return <div className="center-note">
    <div className="center-note-content">
      <p>{session.credentials ? (error as Error)?.message ?? 'Could not reconnect to your budget.' : 'Could not load the budget snapshot.'}</p>
      <button className="btn-ghost" onClick={onDisconnect}>Return to sign in</button>
    </div>
  </div>;
  const refreshLabel = new Date(snapshot.generatedAt).toLocaleString();
  return <>
    <nav className="app-tabs" aria-label="Dashboard sections">
      <div className="app-toolbar">
        <div className="app-tab-list" role="tablist" aria-label="Financial dashboards">
          <button
            id="expenses-tab"
            className="app-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'expenses'}
            aria-controls="expenses-panel"
            onClick={() => setActiveTab('expenses')}
          >Expenses</button>
          <button
            id="net-worth-tab"
            className="app-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'net-worth'}
            aria-controls="net-worth-panel"
            onClick={() => setActiveTab('net-worth')}
          >Net Worth</button>
        </div>
        <ThemeControl value={theme} onChange={setTheme} />
        <div className="refresh-controls">
          <div className="refresh-copy" aria-live="polite">
            <span className={`refresh-status${error ? ' is-error' : ''}`}>
              {isFetching ? 'Updating from Actual…' : error ? 'Update failed · showing saved data' : 'Ready'}
            </span>
            <span className="refresh-time">Last refreshed {refreshLabel}</span>
          </div>
          <button
            className="btn-ghost update-button"
            type="button"
            onClick={() => void refetch()}
            disabled={!session.credentials || isFetching}
            title={session.credentials ? 'Sync the latest data from Actual' : 'Connect to Actual to refresh this data'}
          >{isFetching ? 'Updating…' : 'Update'}</button>
        </div>
      </div>
    </nav>
    <section id="expenses-panel" className="app-tabpanel" role="tabpanel" aria-labelledby="expenses-tab" hidden={activeTab !== 'expenses'}>
      <SpendingDashboard snapshot={snapshot} onDisconnect={onDisconnect} />
    </section>
    <section id="net-worth-panel" className="app-tabpanel" role="tabpanel" aria-labelledby="net-worth-tab" hidden={activeTab !== 'net-worth'}>
      <NetWorthDashboard onDisconnect={onDisconnect} />
    </section>
  </>;
}
