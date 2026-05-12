import { useSyncExternalStore } from 'react';

/**
 * Tiny pub/sub describing the SSE connection state. `useFamilyEvents` writes
 * to this store as the EventSource opens / drops / reconnects; UI like the TV
 * mode's "Live" indicator subscribes via `useSseStatus()`.
 */

export type SseStatus = 'connecting' | 'open' | 'closed';

let current: SseStatus = 'closed';
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setSseStatus(status: SseStatus): void {
  if (status === current) return;
  current = status;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return current;
}

export function useSseStatus(): SseStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
