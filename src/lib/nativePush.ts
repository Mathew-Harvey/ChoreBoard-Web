import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { App as CapApp, type URLOpenListenerEvent } from '@capacitor/app';
import {
  PushNotifications,
  type PushNotificationSchema,
  type ActionPerformed,
  type Token,
  type PermissionStatus,
} from '@capacitor/push-notifications';
import { api } from './api';
import { isNative, platform } from './runtime';

/**
 * Register the device with APNs / FCM, ship the token to the API, and wire
 * deep-link handlers so tapping a push notification routes inside the SPA
 * instead of bouncing through the browser.
 *
 * Only runs on native — the hook is a no-op on the web build. Only runs
 * when a *parent* is signed in (kids don't get push).
 *
 * Idempotent: safe to mount multiple times. The plugin's `register` call
 * collapses duplicate listeners.
 */
export function useNativePush(args: {
  enabled: boolean;
  isParent: boolean;
  navigate: NavigateFunction;
}): void {
  const { enabled, isParent, navigate } = args;

  useEffect(() => {
    if (!enabled || !isParent || !isNative()) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      try {
        const perm = await ensurePushPermission();
        if (perm !== 'granted') return;
        if (cancelled) return;

        // Listeners must be added BEFORE register() — otherwise the
        // `registration` event fires before we can subscribe.
        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener('registration', async (token: Token) => {
          try {
            await api.post('/api/devices', {
              platform: platform() === 'ios' ? 'ios' : 'android',
              token: token.value,
              appVersion: import.meta.env.VITE_APP_VERSION,
            });
          } catch (err) {
            // The token will be re-registered next launch; no action needed.
            console.warn('[push] device register failed', err);
          }
        });

        await PushNotifications.addListener('registrationError', (err) => {
          console.warn('[push] APNs/FCM registration error', err);
        });

        // Foreground notification — Capacitor delivers the payload but
        // doesn't show the system banner by default on iOS. Our config
        // sets `presentationOptions: ['alert', 'badge', 'sound']`, so the
        // OS does the right thing. Nothing else needed here unless we
        // want to update in-app state from the payload.
        await PushNotifications.addListener(
          'pushNotificationReceived',
          (_n: PushNotificationSchema) => {
            // SSE will already update the board for us. If we want extra
            // animation when push arrives mid-app, we can dispatch a
            // window event here.
          },
        );

        // Tap on a push when the app is in background or closed.
        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action: ActionPerformed) => {
            const url = pickUrl(action);
            if (!url) return;
            const path = stripOrigin(url);
            if (path) navigate(path);
          },
        );

        await PushNotifications.register();
      } catch (err) {
        console.warn('[push] native push setup failed', err);
      }
    })();

    // Universal Links / App Links — when an OS-level URL is opened (e.g.
    // a parent taps a `https://app.choreboard.io/admin/approvals/123`
    // link in Mail), Capacitor fires `appUrlOpen`. Intercept and route
    // inside the SPA instead of letting the WebView do a full navigation.
    const urlListenerPromise = CapApp.addListener('appUrlOpen', (e: URLOpenListenerEvent) => {
      const path = stripOrigin(e.url);
      if (path) navigate(path);
    });
    urlListenerPromise.then((handle) => {
      if (cancelled) {
        handle.remove();
        return;
      }
      cleanups.push(() => handle.remove());
    });

    return () => {
      cancelled = true;
      for (const fn of cleanups) fn();
      // Best-effort: drop push listeners. Safe to ignore failures.
      void PushNotifications.removeAllListeners();
    };
  }, [enabled, isParent, navigate]);
}

async function ensurePushPermission(): Promise<PermissionStatus['receive']> {
  const current = await PushNotifications.checkPermissions();
  if (current.receive === 'granted') return 'granted';
  if (current.receive === 'denied') return 'denied';
  const requested = await PushNotifications.requestPermissions();
  return requested.receive;
}

function pickUrl(action: ActionPerformed): string | null {
  const data = action.notification?.data as Record<string, unknown> | undefined;
  if (data && typeof data.url === 'string') return data.url;
  return null;
}

/**
 * Convert an absolute URL (e.g. https://app.choreboard.io/admin/approvals/123)
 * into a path the React Router can navigate to (`/admin/approvals/123`).
 *
 * Returns null for off-domain URLs — we don't want a malicious push payload
 * to navigate the WebView away from the app.
 */
function stripOrigin(absUrl: string): string | null {
  try {
    const u = new URL(absUrl);
    if (u.hostname !== 'app.choreboard.io' && u.hostname !== 'choreboard.io') return null;
    return `${u.pathname}${u.search}${u.hash}` || '/';
  } catch {
    // Not an absolute URL — assume it's already a path.
    if (absUrl.startsWith('/')) return absUrl;
    return null;
  }
}
