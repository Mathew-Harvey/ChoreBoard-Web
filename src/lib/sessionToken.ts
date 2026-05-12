import { Preferences } from '@capacitor/preferences';
import { isNative } from './runtime';

/**
 * Bearer-token storage for the Capacitor native build.
 *
 * The token is the same opaque session id the API issues for cookie
 * sessions. We never persist it on the web — browsers get the cookie
 * (HttpOnly, SameSite=Lax) which is more secure than localStorage. This
 * module is a no-op on web.
 *
 * Lifecycle:
 *   - On boot, App.tsx calls `loadStoredToken()` once before mounting the
 *     React Query provider, so the very first /api/auth/me call already has
 *     the right Authorization header.
 *   - On login / signup / kid-login success, `saveToken(token)` persists it.
 *   - On logout (and on owner-delete-family / self-delete), `clearToken()`
 *     wipes it.
 */

const STORAGE_KEY = 'cb_session_token';

let cached: string | null = null;

/** Synchronous accessor for the in-memory token. Call after `loadStoredToken()`. */
export function getCachedToken(): string | null {
  return cached;
}

/**
 * Read the persisted token off disk into the in-memory cache. Resolves
 * once so subsequent sync calls to `getCachedToken()` return the right
 * thing. Safe to call multiple times.
 */
export async function loadStoredToken(): Promise<string | null> {
  if (!isNative()) {
    cached = null;
    return null;
  }
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    cached = value || null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveToken(token: string | null | undefined): Promise<void> {
  if (!isNative()) return;
  if (!token) {
    await clearToken();
    return;
  }
  cached = token;
  try {
    await Preferences.set({ key: STORAGE_KEY, value: token });
  } catch {
    // Storage failure is non-fatal — the in-memory cache still works for
    // this session; the user just has to log in again next launch.
  }
}

export async function clearToken(): Promise<void> {
  cached = null;
  if (!isNative()) return;
  try {
    await Preferences.remove({ key: STORAGE_KEY });
  } catch {
    // ignore
  }
}
