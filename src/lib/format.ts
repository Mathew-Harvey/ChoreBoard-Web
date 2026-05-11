const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export function money(cents: number): string {
  return aud.format(cents / 100);
}

export function timeUntil(target: Date | string, now: Date = new Date()): string {
  const t = typeof target === 'string' ? new Date(target) : target;
  let diff = Math.max(0, t.getTime() - now.getTime());
  const d = Math.floor(diff / 86_400_000);
  diff -= d * 86_400_000;
  const h = Math.floor(diff / 3_600_000);
  diff -= h * 3_600_000;
  const m = Math.floor(diff / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function clockTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function relativePast(d: Date | string, now: Date = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const sec = Math.round((now.getTime() - date.getTime()) / 1000);
  if (sec < 60) return `just now`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d2 = Math.floor(hr / 24);
  return `${d2}d ago`;
}

export function readableCadence(c: any): string {
  if (!c) return '';
  switch (c.kind) {
    case 'daily':
      return c.times.length > 1 ? `Daily ×${c.times.length} (${c.times.join(', ')})` : `Daily ${c.times[0] ?? ''}`;
    case 'weekly': {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${(c.days as number[]).map((d) => dayNames[d]).join('/')} ${c.time}`;
    }
    case 'every_n_days':
      return `Every ${c.n} days @ ${c.time}`;
    case 'every_n_weeks': {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `Every ${c.n} weeks on ${(c.days as number[]).map((d) => dayNames[d]).join('/')} ${c.time}`;
    }
    case 'monthly_dom':
      return `Monthly day ${c.day} @ ${c.time}`;
    case 'monthly_nth': {
      const ord = ['1st', '2nd', '3rd', '4th', '5th'][c.nth - 1] ?? `${c.nth}th`;
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${ord} ${dayNames[c.weekday]} of month @ ${c.time}`;
    }
    default:
      return '';
  }
}
