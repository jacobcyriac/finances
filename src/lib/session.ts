import { ACTUAL_SERVER_URL, ACTUAL_SYNC_ID } from '../config';
import { normalizeServerURL } from './url';
import type { ConnectRequest } from '../types';

const SESSION_KEY = 'actual-dashboard-session-v1';

/** Keep reconnect credentials across reloads in this tab, clearing them when the tab session ends. */
export function loadSessionCredentials(): ConnectRequest | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { password?: unknown; encryptionKey?: unknown };
    if (typeof saved.password !== 'string' || !saved.password) return null;
    return {
      serverURL: normalizeServerURL(ACTUAL_SERVER_URL),
      syncId: ACTUAL_SYNC_ID,
      password: saved.password,
      encryptionKey: typeof saved.encryptionKey === 'string' ? saved.encryptionKey : '',
    };
  } catch {
    return null;
  }
}

export function saveSessionCredentials(credentials: ConnectRequest): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      password: credentials.password,
      encryptionKey: credentials.encryptionKey,
    }));
  } catch {
    // If browser storage is unavailable, the connection still works for this page load.
  }
}

export function clearSessionCredentials(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage restrictions; there may be nothing to clear.
  }
}
