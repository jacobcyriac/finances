import { ACTUAL_SERVER_URL, ACTUAL_SYNC_ID } from '../config';
import { normalizeServerURL } from './url';
import type { ConnectRequest } from '../types';

const SESSION_KEY = 'actual-dashboard-session-v1';

/** Keep reconnect credentials on this browser until the user disconnects. */
export function loadSessionCredentials(): ConnectRequest | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { password?: unknown; encryptionKey?: unknown };
    if (typeof saved.password !== 'string' || !saved.password) return null;
    const credentials = {
      serverURL: normalizeServerURL(ACTUAL_SERVER_URL),
      syncId: ACTUAL_SYNC_ID,
      password: saved.password,
      encryptionKey: typeof saved.encryptionKey === 'string' ? saved.encryptionKey : '',
    };
    // Migrate an existing tab session without asking the user to sign in again.
    saveSessionCredentials(credentials);
    return credentials;
  } catch {
    return null;
  }
}

export function saveSessionCredentials(credentials: ConnectRequest): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      password: credentials.password,
      encryptionKey: credentials.encryptionKey,
    }));
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // If browser storage is unavailable, the connection still works for this page load.
  }
}

export function clearSessionCredentials(): void {
  for (const storageName of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[storageName].removeItem(SESSION_KEY);
    } catch {
      // Ignore storage restrictions; there may be nothing to clear.
    }
  }
}
