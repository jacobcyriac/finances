export const DASHBOARD_MODULES = [
  { id: 'search', label: 'Search bar' },
  { id: 'summary', label: 'Spending totals' },
  { id: 'people', label: 'People chart' },
  { id: 'categories', label: 'Categories chart' },
  { id: 'monthly', label: 'Monthly spend chart' },
  { id: 'drilldown', label: 'Explore spending' },
  { id: 'payees', label: 'Top payees' },
  { id: 'transactions', label: 'Transactions' },
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULES)[number]['id'];
export type DashboardModuleVisibility = Record<DashboardModuleId, boolean>;

export const DEFAULT_DASHBOARD_MODULES: DashboardModuleVisibility = {
  search: true,
  summary: true,
  people: true,
  categories: true,
  monthly: true,
  drilldown: true,
  payees: true,
  transactions: true,
};

const STORAGE_KEY = 'finance-dashboard-modules';

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
