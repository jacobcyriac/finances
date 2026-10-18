import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { connect, getSnapshot, updateFromServer, disconnect } from './api/client';
import { Login } from './components/Login';
import { Dashboard as NetWorthDashboard } from './components/Dashboard';
import { MonthlySpendingBars } from './components/charts/MonthlySpendingBars';
import { GroupStackedBars } from './components/charts/GroupStackedBars';
import { ExpenseTransactionsTable } from './components/ExpenseTransactionsTable';
import { DropdownMenu } from './components/ui/DropdownMenu';
import { clearSessionCredentials, loadSessionCredentials, saveSessionCredentials } from './lib/session';
import { loadCachedSnapshot, saveCachedSnapshot } from './snapshot/cache';
import { availableSpendingRanges, rollingSpending } from './analysis/rolling-spending';
import type { SpendingRangePreset } from './analysis/rolling-spending';
import { formatMoney } from './lib/money';
import type { ConnectRequest } from './types';

type ThemePreference = 'system' | 'light' | 'dark';
interface ChartTableFilter {
  month?: string;
  groupId?: string;
  groupName?: string;
  categoryId?: string;
  categoryName?: string;
  categoryIds?: string[];
}
const THEME_STORAGE_KEY = 'finance-dashboard-theme';

function getSavedTheme(): ThemePreference {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function ThemeControl({ value, onChange }: { value: ThemePreference; onChange: (value: ThemePreference) => void }) {
  return <label className="theme-control">
    <span>Theme</span>
    <DropdownMenu className="theme-dropdown" label="Color theme" value={value} onChange={(next) => onChange(next as ThemePreference)} options={[
      { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
    ]} />
  </label>;
}

function PeriodControl({ options, value, onChange }: { options: SpendingRangePreset[]; value: string; onChange: (value: string) => void }) {
  const rollingRanges = options.filter((option) => option.kind === 'rolling');
  const yearRanges = options.filter((option) => option.kind === 'year');
  return <label className="period-header-control">
    <span>Period</span>
    <DropdownMenu className="period-dropdown" value={value} onChange={onChange} label="Spending period" options={[
      { value: 'this-month', label: 'This month' },
      ...rollingRanges.map((option) => ({ value: option.value, label: option.label, group: 'Rolling periods' })),
      ...yearRanges.map((option) => ({ value: option.value, label: option.label, group: 'Calendar years' })),
    ]} />
  </label>;
}

function SettingsDrawer({
  onClose, theme, onThemeChange, refreshStatus, refreshLabel, onUpdate, updating, updateDisabled, onDisconnect, disconnecting,
}: {
  onClose: () => void;
  theme: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
  refreshStatus: ReactNode;
  refreshLabel: string;
  onUpdate: () => void;
  updating: boolean;
  updateDisabled: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  return <div className="settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-drawer-header">
        <h2 id="settings-title">Settings</h2>
        <button className="settings-close-button" type="button" onClick={onClose} aria-label="Close settings" autoFocus>
          <X aria-hidden="true" />
        </button>
      </header>
      <section className="settings-section">
        <h3>Data</h3>
        <div className="settings-refresh-status">{refreshStatus}</div>
        <p className="settings-refresh-time">Last refreshed {refreshLabel}</p>
        <button className="btn-ghost settings-update-button" type="button" onClick={onUpdate} disabled={updateDisabled}>
          {updating ? 'Updating…' : 'Update from Actual'}
        </button>
      </section>
      <section className="settings-section settings-appearance">
        <h3>Appearance</h3>
        <ThemeControl value={theme} onChange={onThemeChange} />
      </section>
      <div className="settings-drawer-footer">
        <button className="btn-ghost settings-disconnect-button" type="button" onClick={onDisconnect} disabled={disconnecting}>
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </aside>
  </div>;
}

function MetricCard({ label, value, detail, color, variant }: { label: string; value: string; detail: string; color?: string; variant?: 'annualized' | 'monthly-average' }) {
  return <div className={`metric-card${variant ? ` metric-card-${variant}` : ''}`}>
    <div className="label">{label}</div>
    <div className="metric-reading">
      <div className="metric-value" style={color ? { color } : undefined}>{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  </div>;
}

function SpendingDashboard({ snapshot, rangeOptions, rangeValue, chartFilter, onChartFilterChange }: {
  snapshot: NonNullable<Awaited<ReturnType<typeof getSnapshot>>>;
  rangeOptions: SpendingRangePreset[];
  rangeValue: string;
  chartFilter: ChartTableFilter;
  onChartFilterChange: (filter: ChartTableFilter) => void;
}) {
  const defaultRange = rangeOptions.find((option) => option.value === 'rolling-12')
    ?? rangeOptions.filter((option) => option.kind === 'rolling').at(-1)
    ?? rangeOptions[0];
  const range = rangeOptions.find((option) => option.value === rangeValue) ?? defaultRange;
  const period = useMemo(() => rollingSpending(snapshot, new Date(), {
    months: range.months,
    startMonth: range.startMonth,
    endMonth: range.endMonth,
    includeCurrentMonth: range.kind === 'month',
  }), [snapshot, range]);
  const currency = snapshot.currency;
  const fmtWhole = (value: number) => formatMoney(Math.round(value / 100) * 100, currency).replace(/\.00(?=\D|$)/, '');
  const selectGroup = (groupId: string) => {
    const group = period.groups.find((item) => item.id === groupId);
    if (!group) return;
    if (chartFilter.groupId === groupId && !chartFilter.categoryId) {
      onChartFilterChange({ month: chartFilter.month });
      return;
    }
    onChartFilterChange({
      month: chartFilter.month,
      groupId,
      groupName: group.name,
      categoryIds: group.categories.map((category) => category.id),
    });
  };
  const selectCategory = (groupId: string, categoryId: string) => {
    const group = period.groups.find((item) => item.id === groupId);
    const category = group?.categories.find((item) => item.id === categoryId);
    if (!group || !category) return;
    if (chartFilter.categoryId === categoryId) {
      onChartFilterChange({ month: chartFilter.month });
      return;
    }
    onChartFilterChange({
      month: chartFilter.month,
      groupId,
      groupName: group.name,
      categoryId,
      categoryName: category.name,
      categoryIds: [categoryId],
    });
  };
  const selectMonthAndGroup = (month: string, groupId: string) => {
    const group = period.groups.find((item) => item.id === groupId);
    if (!group) return;
    const alreadySelected = chartFilter.month === month && chartFilter.groupId === groupId && !chartFilter.categoryId;
    if (alreadySelected) {
      onChartFilterChange({});
      return;
    }
    onChartFilterChange({
      month,
      groupId,
      groupName: group.name,
      categoryIds: group.categories.map((category) => category.id),
    });
  };

  return <main className="dashboard-shell ledger-layout">
    <div className="spending-overview">
      <section className="spending-summary" aria-label={`${range.label} spending summary`}>
        <div className="metric-grid metric-grid-overview">
          <MetricCard variant="annualized" label="Annualized spending" value={fmtWhole(period.totals.average * 12)} detail="/year" />
          <MetricCard variant="monthly-average" label="Monthly average" value={fmtWhole(period.totals.average)} detail="/month" />
        </div>
      </section>

      <section className="panel chart-panel categories-block dashboard-block">
        <div className="section-heading"><h2>Categories</h2></div>
        <GroupStackedBars key={range.value} groups={period.groups} currency={currency} onSelectGroup={selectGroup} onSelectCategory={selectCategory} />
      </section>

      <section className="panel chart-panel monthly-spending-block dashboard-block">
        <div className="section-heading"><h2>Monthly spend</h2></div>
        <MonthlySpendingBars key={range.value}
          months={period.months}
          groups={period.groups}
          currency={currency}
          onSelectMonth={(month) => onChartFilterChange({ ...chartFilter, month: chartFilter.month === month ? undefined : month })}
          onSelectMonthAndGroup={selectMonthAndGroup}
        />
      </section>
    </div>

    <ExpenseTransactionsTable
      snapshot={snapshot}
      startMonth={period.startMonth}
      endMonth={period.endMonth}
      monthCount={period.months.length}
      chartFilter={chartFilter}
      onClearChartFilter={() => onChartFilterChange({})}
    />

  <footer>Read-only analysis · Data is processed in this browser</footer>
  </main>;
}

function LoadingNote() {
  return <div className="center-note">Loading your budget…</div>;
}

export default function App() {
  const queryClient = useQueryClient();
  const appTabsRef = useRef<HTMLElement>(null);
  const [session, setSession] = useState(() => {
    const credentials = loadSessionCredentials();
    return { credentials, connected: Boolean(credentials) };
  });
  const [cacheReady, setCacheReady] = useState(false);
  const apiConnected = useRef(false);
  const skipNextUpdate = useRef(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'net-worth'>('expenses');
  const [theme, setTheme] = useState<ThemePreference>(getSavedTheme);
  const [rangeValue, setRangeValue] = useState('rolling-12');
  const [chartFilter, setChartFilter] = useState<ChartTableFilter>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  useEffect(() => {
    const header = appTabsRef.current;
    if (!header) return;
    const updateHeaderHeight = () => document.documentElement.style.setProperty('--sticky-nav-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    updateHeaderHeight();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--sticky-nav-height');
    };
  }, [session.connected, snapshot]);
  const rangeOptions = useMemo(() => snapshot ? availableSpendingRanges(snapshot) : [], [snapshot]);
  const defaultRange = rangeOptions.find((option) => option.value === 'rolling-12')
    ?? rangeOptions.filter((option) => option.kind === 'rolling').at(-1)
    ?? rangeOptions[0];
  const selectedRange = rangeOptions.find((option) => option.value === rangeValue) ?? defaultRange;
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
  const disconnectMutation = useMutation({ mutationFn: disconnect, onSuccess: onDisconnect });
  useEffect(() => {
    if (!settingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSettingsOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [settingsOpen]);
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
    <nav ref={appTabsRef} className="app-tabs" aria-label="Dashboard sections">
      <div className="app-toolbar">
        <div className="app-toolbar-main">
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
        </div>
        <div className="app-toolbar-actions">
          {activeTab === 'expenses' && selectedRange && <PeriodControl options={rangeOptions} value={selectedRange.value} onChange={(next) => { setRangeValue(next); setChartFilter({}); }} />}
          <button className="settings-trigger" type="button" aria-label="Open settings" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}>
            <SettingsIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
    {settingsOpen && <SettingsDrawer
      onClose={() => setSettingsOpen(false)}
      theme={theme}
      onThemeChange={setTheme}
      refreshStatus={<span className={`refresh-status${error ? ' is-error' : ''}`}>{isFetching ? 'Updating from Actual…' : error ? 'Update failed · showing saved data' : session.credentials ? 'Ready' : 'Using local data'}</span>}
      refreshLabel={refreshLabel}
      onUpdate={() => { void refetch(); }}
      updating={isFetching}
      updateDisabled={!session.credentials || isFetching}
      onDisconnect={() => disconnectMutation.mutate()}
      disconnecting={disconnectMutation.isPending}
    />}
    <section id="expenses-panel" className="app-tabpanel" role="tabpanel" aria-labelledby="expenses-tab" hidden={activeTab !== 'expenses'}>
      <SpendingDashboard
        snapshot={snapshot}
        rangeOptions={rangeOptions}
        rangeValue={selectedRange?.value ?? 'this-month'}
        chartFilter={chartFilter}
        onChartFilterChange={setChartFilter}
      />
    </section>
    <section id="net-worth-panel" className="app-tabpanel" role="tabpanel" aria-labelledby="net-worth-tab" hidden={activeTab !== 'net-worth'}>
      <NetWorthDashboard />
    </section>
  </>;
}
