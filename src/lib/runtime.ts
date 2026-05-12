import { Capacitor } from '@capacitor/core';

/**
 * Runtime adapters that branch between the browser build (served at
 * app.choreboard.io) and the Capacitor native build (the iOS / Android shells
 * around the same SPA bundle).
 *
 * The whole point of these helpers is to keep the rest of the codebase
 * platform-agnostic. Anywhere you'd otherwise write `if (window.something)`
 * to fork behaviour, add a method here instead.
 */

/**
 * True when the SPA is running inside the Capacitor iOS or Android shell.
 * Capacitor sets this synchronously at startup so it's safe at module top
 * level.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'ios' | 'android' | 'web' */
export function platform(): 'ios' | 'android' | 'web' {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android' ? p : 'web';
}

/**
 * Absolute API base URL. Empty string on web in dev (so requests go through
 * the Vite proxy), the configured `VITE_API_BASE_URL` everywhere else.
 *
 * The native build ALWAYS needs an absolute URL because it loads from
 * capacitor://localhost and there is no proxy.
 */
export function apiBaseUrl(): string {
  const explicit = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (isNative()) {
    // Sensible production default. Override with VITE_API_BASE_URL if you
    // run a staging API.
    return 'https://api.choreboard.io';
  }
  return '';
}

/**
 * Sent as the `X-Client` request header so the API knows whether to issue
 * a cookie session (web) or a bearer token (native). See
 * `auth/plugin.ts → pickTransport` on the server side.
 */
export function clientHint(): 'native' | 'web' {
  return isNative() ? 'native' : 'web';
}

/**
 * Build an absolute API URL from a path that starts with `/api/...`.
 *
 *   resolveApiUrl('/api/auth/me')  → '/api/auth/me' on web in dev
 *                                  → 'https://api.choreboard.io/api/auth/me' on native
 */
export function resolveApiUrl(path: string): string {
  const base = apiBaseUrl();
  if (!base) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
