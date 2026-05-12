import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

/**
 * Tiny toast store — a module-level pub/sub with `useSyncExternalStore` for
 * subscription, so any component (mutations, error boundaries, focus rings)
 * can call `toast(...)` without dragging in a context or extra deps.
 */

export type ToastTone = 'success' | 'error' | 'info' | 'money';
export type ToastEntry = {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  icon?: string;
  ttl: number;
  createdAt: number;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let state: ToastEntry[] = [];

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return state;
}

let nextId = 1;

export function toast(input: {
  tone?: ToastTone;
  title: string;
  body?: string;
  icon?: string;
  ttl?: number;
}): string {
  const id = `t${nextId++}`;
  const entry: ToastEntry = {
    id,
    tone: input.tone ?? 'info',
    title: input.title,
    body: input.body,
    icon: input.icon,
    ttl: input.ttl ?? 3600,
    createdAt: Date.now(),
  };
  // Cap stack to 4 so the screen doesn't fill up under heavy use.
  state = [entry, ...state].slice(0, 4);
  emit();
  return id;
}

export function dismissToast(id: string) {
  state = state.filter((t) => t.id !== id);
  emit();
}

/** Convenience helpers for the common cases. */
export const toastSuccess = (title: string, body?: string) =>
  toast({ tone: 'success', title, body, icon: '✓' });
export const toastMoney = (title: string, body?: string) =>
  toast({ tone: 'money', title, body, icon: '💰' });
export const toastError = (title: string, body?: string) =>
  toast({ tone: 'error', title, body, icon: '⚠', ttl: 5200 });
export const toastInfo = (title: string, body?: string) =>
  toast({ tone: 'info', title, body });

/**
 * Mount once near the app root. Renders a stack of toasts; floats bottom-center
 * on phone, top-right on tablet+. Each toast auto-dismisses after its `ttl`.
 */
export function ToastViewport() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Drop expired entries on a single shared interval to avoid a timer per toast.
  useEffect(() => {
    if (items.length === 0) return;
    const tick = () => {
      const now = Date.now();
      const next = state.filter((t) => now - t.createdAt < t.ttl);
      if (next.length !== state.length) {
        state = next;
        emit();
      }
    };
    const h = setInterval(tick, 200);
    return () => clearInterval(h);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none safe-pb fixed inset-x-3 bottom-3 z-[60] flex flex-col-reverse items-stretch gap-2 sm:bottom-auto sm:left-auto sm:right-6 sm:top-[120px] sm:w-[360px] sm:items-end"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <ToastCard key={t.id} entry={t} />
      ))}
    </div>
  );
}

function ToastCard({ entry }: { entry: ToastEntry }) {
  const tone = entry.tone;
  const accent =
    tone === 'success' || tone === 'money'
      ? 'bg-money text-white'
      : tone === 'error'
        ? 'bg-accent-red text-white'
        : 'bg-ink-900 text-cream-50';
  return (
    <div
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl ring-2 ring-ink-900 shadow-paper-sm animate-floatIn ${accent}`}
      style={{ padding: '12px 14px' }}
      onClick={() => dismissToast(entry.id)}
      role="button"
      aria-label="Dismiss notification"
    >
      {entry.icon && (
        <span aria-hidden className="text-lg leading-none">
          {entry.icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold leading-tight">{entry.title}</div>
        {entry.body && (
          <div className="mt-0.5 text-xs opacity-90">{entry.body}</div>
        )}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation();
          dismissToast(entry.id);
        }}
        className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-lg text-base leading-none opacity-70 transition hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Wrapping `children` is purely structural — toast() works without a Provider.
 * Exposed in case future versions need scoping per route.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
