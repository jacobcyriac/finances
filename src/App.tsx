import { memo, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { connect, getSnapshot, updateFromServer, disconnect } from './api/client';
import { Login } from './components/Login';
import { Dashboard as NetWorthDashboard } from './components/Dashboard';
import { MonthlySpendingBars } from './components/charts/MonthlySpendingBars';
import { PersonSpendingBars } from './components/charts/PersonSpendingBars';
import { GroupStackedBars } from './components/charts/GroupStackedBars';
import { CategoryPills } from './components/CategoryPills';
import { ExpenseTransactionsTable } from './components/ExpenseTransactionsTable';
import { DropdownMenu } from './components/ui/DropdownMenu';
import { TickerNumber, TypingText } from './components/ui/FilterAnimations';
import { clearSessionCredentials, loadSessionCredentials, saveSessionCredentials } from './lib/session';
import { loadCachedSnapshot, saveCachedSnapshot } from './snapshot/cache';
import { availableSpendingRanges, rollingSpending } from './analysis/rolling-spending';
import type { SpendingRangePreset } from './analysis/rolling-spending';
import { formatMoney } from './lib/money';
import { DASHBOARD_MODULES, loadDashboardModulesByTab, saveDashboardModulesByTab, type DashboardModuleId, type DashboardModuleVisibility, type DashboardViewTab } from './lib/dashboard-modules';
import type { ConnectRequest } from './types';

const MemoNetWorthDashboard = memo(NetWorthDashboard);

type ThemePreference = 'system' | 'light' | 'dark';
interface ChartTableFilter {
  source?: 'categories' | 'monthly';
  month?: string;
  groupId?: string;
  groupName?: string;
  categoryId?: string;
  categoryName?: string;
  categoryIds?: string[];
}
interface FilteredChartData {
  totals: Record<string, number>;
  byMonth: Record<string, Record<string, number>>;
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

function PeriodControl({ options, value, onChange, onClear, labelOverride, variant = 'query' }: { options: SpendingRangePreset[]; value: string; onChange: (value: string) => void; onClear: () => void; labelOverride?: string; variant?: 'query' | 'toolbar' }) {
  const rollingRanges = options.filter((option) => option.kind === 'rolling');
  const yearRanges = options.filter((option) => option.kind === 'year');
  const currentLabel = labelOverride ?? options.find((option) => option.value === value)?.label ?? 'All available';
  const dropdownOptions = [
    { value: 'all-time', label: 'All available' },
    { value: 'this-month', label: 'This month' },
    ...rollingRanges.map((option) => ({ value: option.value, label: option.label, group: 'Rolling periods' })),
    ...yearRanges.map((option) => ({ value: option.value, label: option.label, group: 'Calendar years' })),
  ];
  if (variant === 'toolbar') return <DropdownMenu className="toolbar-period-dropdown" variant="borderless" value={value} onChange={onChange} label="Choose spending period" triggerLabel={<TypingText key={currentLabel} text={currentLabel} />} options={dropdownOptions} />;
  return <div className="period-header-control">
    <span className="period-control-label"><TypingText key={currentLabel} text={currentLabel} /></span>
    {(value !== 'rolling-12' || labelOverride) && <button className="query-clear-button period-clear-button" type="button" onClick={onClear} aria-label="Clear period filter"><X size={16} aria-hidden="true" /></button>}
    <DropdownMenu className="period-dropdown query-period-dropdown" triggerIconOnly value={value} onChange={onChange} label="Choose spending period" options={dropdownOptions} />
  </div>;
}

function SettingsDrawer({
  onClose, theme, onThemeChange, refreshStatus, refreshLabel, onUpdate, updating, updateDisabled, onDisconnect, disconnecting, modules, showModules, onModuleToggle,
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
  modules: DashboardModuleVisibility;
  showModules: boolean;
  onModuleToggle: (id: DashboardModuleId) => void;
}) {
  return <div className="settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-drawer-header">
        <h2 id="settings-title">Settings</h2>
        <button className="btn-bordered settings-close-button" type="button" onClick={onClose} aria-label="Close settings" autoFocus>
          <X aria-hidden="true" />
        </button>
      </header>
      <section className="settings-section">
        <h3>Data</h3>
        <div className="settings-refresh-status">{refreshStatus}</div>
        <p className="settings-refresh-time">Last refreshed {refreshLabel}</p>
        <button className="btn-bordered settings-update-button" type="button" onClick={onUpdate} disabled={updateDisabled}>
          {updating ? 'Updating…' : 'Update from Actual'}
        </button>
      </section>
      <section className="settings-section settings-appearance">
        <h3>Appearance</h3>
        <ThemeControl value={theme} onChange={onThemeChange} />
      </section>
      {showModules && <section className="settings-section settings-modules">
        <h3>Dashboard modules</h3>
        <div className="settings-module-list">
          {DASHBOARD_MODULES.map((module) => <button
            key={module.id}
            className="btn-bordered settings-module-toggle"
            type="button"
            role="switch"
            aria-checked={modules[module.id]}
            onClick={() => onModuleToggle(module.id)}
          >
            <span>{module.label}</span>
            <span className={`settings-toggle-track${modules[module.id] ? ' is-on' : ''}`} aria-hidden="true"><span /></span>
          </button>)}
        </div>
      </section>}
      <div className="settings-drawer-footer">
        <button className="btn-bordered is-danger settings-disconnect-button" type="button" onClick={onDisconnect} disabled={disconnecting}>
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </aside>
  </div>;
}

function MetricCard({ label, value, detail, color, variant }: { label: string; value: string; detail: string; color?: string; variant?: 'annualized' | 'monthly-average' | 'total' }) {
  return <div className={`metric-card${variant ? ` metric-card-${variant}` : ''}`}>
    <div className="label">{label}</div>
    <div className="metric-reading">
      <div className="metric-value" style={color ? { color } : undefined}><TickerNumber value={value} /></div>
      <div className="metric-detail">{detail}</div>
    </div>
  </div>;
}

function SpendingDashboard({ snapshot, rangeOptions, rangeValue, chartFilter, onChartFilterChange, periodControl, filteredSummary, onFilteredSummaryChange, filteredChartData, onFilteredChartDataChange, personTotals, onPersonTotalsChange, personFilters, onPersonFiltersChange, onClearAllFilters, clearAllSignal, moduleVisibility, presentation = 'expenses' }: {
  snapshot: NonNullable<Awaited<ReturnType<typeof getSnapshot>>>;
  rangeOptions: SpendingRangePreset[];
  rangeValue: string;
  chartFilter: ChartTableFilter;
  onChartFilterChange: (filter: ChartTableFilter) => void;
  periodControl: ReactNode;
  filteredSummary: { total: number; annualized: number; monthlyAverage: number; recurring: boolean; transactionCount: number } | null;
  onFilteredSummaryChange: (summary: { total: number; annualized: number; monthlyAverage: number; recurring: boolean; transactionCount: number }) => void;
  filteredChartData: FilteredChartData | null;
  onFilteredChartDataChange: (data: FilteredChartData) => void;
  personTotals: Record<string, number>;
  onPersonTotalsChange: (totals: Record<string, number>) => void;
  personFilters: string[];
  onPersonFiltersChange: Dispatch<SetStateAction<string[]>>;
  onClearAllFilters: () => void;
  clearAllSignal: number;
  moduleVisibility: DashboardModuleVisibility;
  presentation?: DashboardViewTab;
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
  const categoryMonth = chartFilter.month
    ? period.months.find((month) => month.month === chartFilter.month)
    : undefined;
  const chartMonths = filteredChartData ? period.months.map((month) => {
    const categories = filteredChartData.byMonth[month.month] ?? {};
    return { ...month, categories, total: Object.values(categories).reduce((sum, value) => sum + value, 0) };
  }) : period.months;
  const chartTotals = filteredChartData?.totals;
  const categoryGroups = period.groups.map((group) => {
    const source = categoryMonth
      ? (filteredChartData?.byMonth[categoryMonth.month] ?? categoryMonth.categories)
      : chartTotals;
    const categories = group.categories
      .map((category) => ({ ...category, total: source ? source[category.id] ?? 0 : category.total }));
    return { ...group, categories, total: categories.reduce((sum, category) => sum + category.total, 0) };
  });
  const selectedCategoryGroup = chartFilter.groupId
    ? categoryGroups.find((group) => group.id === chartFilter.groupId)
    : undefined;
  const categoryPillGroup = presentation === 'compact' && chartFilter.selectionOrigin === 'pills'
    ? undefined
    : selectedCategoryGroup;
  const categoryPillItems = presentation !== 'compact' && categoryPillGroup
    ? categoryPillGroup.categories.map((category) => ({ ...category, color: categoryPillGroup.color, groupId: categoryPillGroup.id }))
    : categoryGroups.flatMap((group) => group.categories.map((category) => ({ ...category, color: group.color, groupId: group.id })));
  const monthlyGroups = chartFilter.groupId && chartFilter.categoryIds && (chartFilter.source === 'categories' || chartFilter.categoryId)
    ? categoryGroups
      .filter((group) => group.id === chartFilter.groupId)
      .map((group) => chartFilter.categoryIds
        ? { ...group, categories: group.categories.filter((category) => chartFilter.categoryIds?.includes(category.id)) }
        : group)
    : categoryGroups;
  const monthlyCategoryIds = new Set(monthlyGroups.flatMap((group) => group.categories.map((category) => category.id)));
  const monthlyChartMonths = chartMonths.map((month) => ({
    ...month,
    total: [...monthlyCategoryIds].reduce((sum, categoryId) => sum + (month.categories[categoryId] ?? 0), 0),
  }));
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
      ...chartFilter,
      source: 'categories',
      selectionOrigin: 'chart',
      groupId,
      groupName: group.name,
      categoryId: undefined,
      categoryName: undefined,
      categoryIds: group.categories.map((category) => category.id),
    });
  };
  const selectCategory = (groupId: string, categoryId: string) => {
    const group = period.groups.find((item) => item.id === groupId);
    const category = group?.categories.find((item) => item.id === categoryId);
    if (!group || !category) return;
    if (chartFilter.categoryId === categoryId) {
      // Toggling the selected category off should remove the entire category
      // dimension. Keeping its group/categoryIds here silently turns it into a
      // group filter. Preserve only an independently selected month.
      onChartFilterChange(chartFilter.month ? { month: chartFilter.month } : {});
      return;
    }
    onChartFilterChange({
      ...chartFilter,
      source: 'categories',
      selectionOrigin: 'chart',
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
    const keepCategory = chartFilter.groupId === groupId && Boolean(chartFilter.categoryId);
    onChartFilterChange({
      ...chartFilter,
      source: 'monthly',
      month,
      groupId,
      groupName: group.name,
      categoryId: keepCategory ? chartFilter.categoryId : undefined,
      categoryName: keepCategory ? chartFilter.categoryName : undefined,
      categoryIds: keepCategory ? chartFilter.categoryIds : group.categories.map((category) => category.id),
    });
  };

  const selectMonth = (month: string) => {
    onChartFilterChange(chartFilter.month === month
      ? { ...chartFilter, month: undefined }
      : { ...chartFilter, month });
  };

  return <main className={`dashboard-shell ledger-layout${presentation === 'compact' ? ' compact-dashboard' : ''}`}>
    <div className="spending-overview">
      {(moduleVisibility.summary || moduleVisibility.people || moduleVisibility.monthly) && <div className="spending-top-row">
        {moduleVisibility.summary && <section className={`spending-summary${moduleVisibility.summaryPeople ? ` has-summary-people-chart${moduleVisibility.peopleSelector ? '' : ' without-person-selector'}` : ''}`} aria-label={`${range.label} spending summary`}>
          <div className="metric-grid metric-grid-overview">
            {filteredSummary && !filteredSummary.recurring
              ? <MetricCard variant="total" label="Total spending" value={fmtWhole(filteredSummary.total)} detail={`${filteredSummary.transactionCount.toLocaleString()} transactions`} />
              : <>
                <MetricCard variant="annualized" label="Annualized spending" value={fmtWhole(filteredSummary?.annualized ?? period.totals.average * 12)} detail="/year" />
                <MetricCard variant="monthly-average" label="Monthly average" value={fmtWhole(filteredSummary?.monthlyAverage ?? period.totals.average)} detail="/month" />
              </>}
          </div>
          {moduleVisibility.peopleSelector && <div className="spending-person-selector" role="group" aria-label="Filter spending by person">
            {[
              { label: 'All', value: null },
              { label: 'Prachi', value: 'Prachi' },
              { label: 'Jacob', value: 'Jacob' },
              { label: 'Joint', value: 'Joint' },
            ].map(({ label, value }) => {
              const isActive = value === null ? personFilters.length === 0 : personFilters.length === 1 && personFilters[0] === value;
              return <button
                key={label}
                type="button"
                className={isActive ? 'is-active' : ''}
                aria-pressed={isActive}
                onClick={() => onPersonFiltersChange(value ? [value] : [])}
              >{label}</button>;
            })}
          </div>}
          {moduleVisibility.summaryPeople && <div className="summary-people-chart">
            <PersonSpendingBars
              totals={personTotals}
              currency={currency}
              selectedPerson={personFilters[0] ?? null}
              onSelect={(person) => onPersonFiltersChange((current) => person && !(current.length === 1 && current[0] === person) ? [person] : [])}
            />
          </div>}
        </section>}

        {moduleVisibility.people && <section className="person-spending-block dashboard-block" aria-label="Spend by person">
          <PersonSpendingBars
            totals={personTotals}
            currency={currency}
            selectedPerson={personFilters[0] ?? null}
            onSelect={(person) => onPersonFiltersChange((current) => person && !(current.length === 1 && current[0] === person) ? [person] : [])}
          />
        </section>}

        {moduleVisibility.monthly && <section className="panel chart-panel monthly-spending-block dashboard-block" aria-label="Monthly spend">
          <MonthlySpendingBars key={range.value}
            months={monthlyChartMonths}
            groups={monthlyGroups}
            currency={currency}
            categoryLabel={chartFilter.categoryName}
            selection={chartFilter.month ? { columnId: chartFilter.month, segmentId: chartFilter.groupId } : undefined}
            onSelectMonth={selectMonth}
            onSelectMonthAndGroup={selectMonthAndGroup}
          />
        </section>}
      </div>}

      {moduleVisibility.categories && <section className="panel chart-panel categories-block dashboard-block">
        {presentation !== 'compact' && <div className="section-heading"><h2>Categories</h2></div>}
        <GroupStackedBars key={range.value} groups={categoryGroups} currency={currency} selection={chartFilter.groupId ? { columnId: chartFilter.groupId } : undefined} onSelectGroup={selectGroup} />
      </section>}
      {moduleVisibility.categoryPills && categoryGroups.length > 0 && <section className="category-pills-module" aria-label="Category totals">
        <CategoryPills
          categories={categoryPillItems}
          currency={currency}
          selectedCategoryId={chartFilter.categoryId}
          allTotal={categoryPillGroup?.total ?? categoryGroups.reduce((total, group) => total + group.total, 0)}
          groupColor={categoryPillGroup?.color ?? 'var(--text-muted)'}
          filteredGroupId={presentation === 'compact' && chartFilter.selectionOrigin === 'chart' ? chartFilter.groupId : undefined}
          showAll={presentation !== 'compact'}
          onSelect={(categoryId) => categoryId === null
            ? onChartFilterChange(chartFilter.month ? { month: chartFilter.month } : {})
            : (() => {
                const groupId = categoryPillItems.find((category) => category.id === categoryId)?.groupId;
                const group = period.groups.find((item) => item.id === groupId);
                const category = group?.categories.find((item) => item.id === categoryId);
                if (!group || !category) return;
                if (chartFilter.categoryId === category.id) {
                  onChartFilterChange(chartFilter.month ? { month: chartFilter.month } : {});
                  return;
                }
                onChartFilterChange({ ...chartFilter, source: 'categories', selectionOrigin: 'pills', groupId: group.id, groupName: group.name, categoryId: category.id, categoryName: category.name, categoryIds: [category.id] });
              })()}
        />
      </section>}
    </div>

    <ExpenseTransactionsTable
      snapshot={snapshot}
      startMonth={period.startMonth}
      endMonth={period.endMonth}
      chartFilter={chartFilter}
      onChartFilterChange={onChartFilterChange}
      periodControl={periodControl}
      onFilteredSummaryChange={onFilteredSummaryChange}
      onFilteredChartDataChange={onFilteredChartDataChange}
      onPersonTotalsChange={onPersonTotalsChange}
      personFilters={personFilters}
      onPersonFiltersChange={onPersonFiltersChange}
      onClearAllFilters={onClearAllFilters}
      clearAllSignal={clearAllSignal}
      moduleVisibility={moduleVisibility}
      compactView={presentation === 'compact'}
    />

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
  const [activeTab, setActiveTab] = useState<DashboardViewTab | 'net-worth'>('expenses');
  const [theme, setTheme] = useState<ThemePreference>(getSavedTheme);
  const [rangeValue, setRangeValue] = useState('rolling-12');
  const [chartFilter, setChartFilter] = useState<ChartTableFilter>({});
  const [filteredSummary, setFilteredSummary] = useState<{ total: number; annualized: number; monthlyAverage: number; recurring: boolean; transactionCount: number } | null>(null);
  const [filteredChartData, setFilteredChartData] = useState<FilteredChartData | null>(null);
  const [personTotals, setPersonTotals] = useState<Record<string, number>>({});
  const [personFilters, setPersonFilters] = useState<string[]>([]);
  const [clearAllSignal, setClearAllSignal] = useState(0);
  const handleFilteredChartDataChange = useCallback((data: FilteredChartData) => setFilteredChartData(data), []);
  const handleClearAllFilters = useCallback(() => {
    setRangeValue('rolling-12');
    setChartFilter({});
    setPersonFilters([]);
    setClearAllSignal((signal) => signal + 1);
  }, []);
  useEffect(() => {
    if (!session.connected) return;
    const onPageClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      if (target.closest('button, a, input, textarea, select, [role="button"], [role="option"], [role="combobox"], [role="listbox"], [contenteditable="true"], .dropdown-popover, .settings-drawer, .chart-pointer-tooltip')) return;
      if (target.closest('h1, h2, h3, h4, h5, h6, p, span, label, td, th, li, svg, img')) return;
      handleClearAllFilters();
    };
    document.addEventListener('click', onPageClick);
    return () => document.removeEventListener('click', onPageClick);
  }, [session.connected, handleClearAllFilters]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moduleVisibilityByTab, setModuleVisibilityByTab] = useState(loadDashboardModulesByTab);
  const moduleVisibility = activeTab === 'net-worth' ? moduleVisibilityByTab.expenses : moduleVisibilityByTab[activeTab];
  const toggleModule = (id: DashboardModuleId) => {
    if (activeTab === 'net-worth') return;
    const next = {
      ...moduleVisibilityByTab,
      [activeTab]: { ...moduleVisibilityByTab[activeTab], [id]: !moduleVisibilityByTab[activeTab][id] },
    };
    saveDashboardModulesByTab(next);
    setModuleVisibilityByTab(next);
  };
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
  const periodProps = {
    options: rangeOptions,
    value: selectedRange?.value ?? 'rolling-12',
    onChange: (next: string) => { setRangeValue(next); setChartFilter({}); },
    onClear: () => { setRangeValue('rolling-12'); if (chartFilter.month) setChartFilter({ ...chartFilter, month: undefined }); },
    labelOverride: chartFilter.month ? new Date(`${chartFilter.month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : undefined,
  };
  return <>
    <nav className="app-tabs" aria-label="Dashboard sections">
      <div className="app-toolbar">
        <div className="app-toolbar-main">
        <div className="app-tab-list" role="tablist" aria-label="Financial dashboards">
          <button
            id="expenses-tab"
            className="app-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'expenses'}
            aria-controls="spending-panel"
            onClick={() => setActiveTab('expenses')}
          >Expenses</button>
          <button
            id="compact-tab"
            className="app-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'compact'}
            aria-controls="spending-panel"
            onClick={() => setActiveTab('compact')}
          >Compact</button>
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
          {activeTab !== 'net-worth' && <PeriodControl {...periodProps} variant="toolbar" />}
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
      modules={moduleVisibility}
      showModules={activeTab !== 'net-worth'}
      onModuleToggle={toggleModule}
    />}
    <section id="spending-panel" className="app-tabpanel" role="tabpanel" aria-labelledby={activeTab === 'compact' ? 'compact-tab' : 'expenses-tab'} hidden={activeTab === 'net-worth'}>
      <SpendingDashboard
        snapshot={snapshot}
        rangeOptions={rangeOptions}
        rangeValue={selectedRange?.value ?? 'this-month'}
        chartFilter={chartFilter}
        onChartFilterChange={setChartFilter}
        filteredSummary={filteredSummary}
        onFilteredSummaryChange={setFilteredSummary}
        filteredChartData={filteredChartData}
        onFilteredChartDataChange={handleFilteredChartDataChange}
        personTotals={personTotals}
        onPersonTotalsChange={setPersonTotals}
        personFilters={personFilters}
        onPersonFiltersChange={setPersonFilters}
        onClearAllFilters={handleClearAllFilters}
        clearAllSignal={clearAllSignal}
        moduleVisibility={moduleVisibility}
        periodControl={<PeriodControl {...periodProps} />}
        presentation={activeTab === 'compact' ? 'compact' : 'expenses'}
      />
    </section>
    <section id="net-worth-panel" className="app-tabpanel" role="tabpanel" aria-labelledby="net-worth-tab" hidden={activeTab !== 'net-worth'}>
      <MemoNetWorthDashboard />
    </section>
  </>;
}
