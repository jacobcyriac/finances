export const DASHBOARD_MODULES = [
  { id: 'search', label: 'Search bar' },
  { id: 'summary', label: 'Spending totals' },
  { id: 'peopleSelector', label: 'People selector' },
  { id: 'summaryPeople', label: 'People chart in totals' },
  { id: 'people', label: 'People chart' },
  { id: 'categories', label: 'Categories chart' },
  { id: 'categoryPills', label: 'Selected group categories' },
  { id: 'monthly', label: 'Monthly spend chart' },
  { id: 'drilldown', label: 'Explore spending' },
  { id: 'transactionsCompact', label: 'Transactions Compact' },
  { id: 'payees', label: 'Top payees' },
  { id: 'transactions', label: 'Transactions' },
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULES)[number]['id'];
export type DashboardModuleVisibility = Record<DashboardModuleId, boolean>;

export const DEFAULT_DASHBOARD_MODULES: DashboardModuleVisibility = {
  search: false,
  summary: true,
  peopleSelector: false,
  summaryPeople: false,
  people: false,
  categories: true,
  categoryPills: true,
  monthly: false,
  drilldown: false,
  transactionsCompact: true,
  payees: false,
  transactions: false,
};

const STORAGE_KEY = 'finance-dashboard-modules';
const TAB_STORAGE_KEY = 'finance-dashboard-modules-by-tab';

export type DashboardViewTab = 'expenses' | 'compact';
export type DashboardModuleVisibilityByTab = Record<DashboardViewTab, DashboardModuleVisibility>;

export function loadDashboardModulesByTab(): DashboardModuleVisibilityByTab {
  try {
    const savedByTab = localStorage.getItem(TAB_STORAGE_KEY);
    if (savedByTab) {
      const parsed = JSON.parse(savedByTab) as Partial<Record<DashboardViewTab, Partial<DashboardModuleVisibility>>>;
      const normalize = (value?: Partial<DashboardModuleVisibility>) => Object.fromEntries(
        DASHBOARD_MODULES.map(({ id }) => [id, value?.[id] !== false]),
      ) as DashboardModuleVisibility;
      return { expenses: normalize(parsed.expenses), compact: normalize(parsed.compact) };
    }

    // Preserve existing users' Expenses settings; Compact starts with all modules shown.
    return { expenses: loadDashboardModules(), compact: { ...DEFAULT_DASHBOARD_MODULES } };
  } catch {
    return { expenses: { ...DEFAULT_DASHBOARD_MODULES }, compact: { ...DEFAULT_DASHBOARD_MODULES } };
  }
}

export function saveDashboardModulesByTab(modules: DashboardModuleVisibilityByTab) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(modules));
  } catch {
    /* Storage can be unavailable in restricted browser contexts. */
  }
}

export function loadDashboardModules(): DashboardModuleVisibility {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_DASHBOARD_MODULES;
    const parsed = JSON.parse(saved) as Partial<DashboardModuleVisibility>;
    return Object.fromEntries(DASHBOARD_MODULES.map(({ id }) => [id, parsed[id] !== false])) as DashboardModuleVisibility;
  } catch {
    return DEFAULT_DASHBOARD_MODULES;
  }
}

export function saveDashboardModules(modules: DashboardModuleVisibility) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
}
