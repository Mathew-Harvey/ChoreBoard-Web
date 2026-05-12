/**
 * Thin fetch wrapper used by every screen.
 *
 * Two transports, picked by `runtime.ts`:
 *
 *   - **Web build** at app.choreboard.io: relies on the HttpOnly session
 *     cookie. `credentials: 'include'` so cross-origin requests to
 *     api.choreboard.io send it.
 *
 *   - **Native build** (Capacitor iOS / Android): relies on a Bearer token
 *     stored in `Capacitor.Preferences` (see `sessionToken.ts`), and an
 *     absolute API base URL (because the WebView loads from
 *     capacitor://localhost where relative `/api/...` paths don't make
 *     sense).
 *
 * The server accepts either transport — see `auth/plugin.ts` on the API.
 */

import { apiBaseUrl, clientHint, isNative, resolveApiUrl } from './runtime';
import { getCachedToken, saveToken } from './sessionToken';

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

type ResponseBody = Record<string, unknown> & {
  session?: { token?: string; expiresAt?: string };
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = resolveApiUrl(path);
  const headers: Record<string, string> = {
    'X-Client': clientHint(),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // Native: attach Bearer header from the in-memory cache (loaded once at
  // boot in App.tsx). Web: skip; the cookie does the work.
  const token = isNative() ? getCachedToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* not json */
    }
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : null) ?? res.statusText;
    throw new ApiError(res.status, message, payload);
  }

  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    return (await res.text()) as unknown as T;
  }
  const json = (await res.json()) as ResponseBody;

  // Side effect: any response that includes `{ session: { token } }` is
  // either a fresh login or a session refresh. On native we persist the
  // token; on web we ignore it (the cookie is the source of truth).
  if (isNative() && json && typeof json === 'object' && json.session?.token) {
    await saveToken(json.session.token);
  }

  return json as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

/**
 * Re-exported so callers can build SSE URLs that include the session token
 * as a query param. EventSource cannot set headers, so the native build
 * cannot use the Bearer transport for SSE — see `useFamilyEvents.ts`.
 */
export { apiBaseUrl, isNative };
