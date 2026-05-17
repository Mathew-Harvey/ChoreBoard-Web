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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Render the wall-clock string `HH:MM` in the viewer's locale's AM/PM
 * convention. The hour-of-day is the same number everywhere on earth —
 * this is a stylistic format, not a TZ conversion.
 */
function clockLabel(hhmm: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const date = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: m ? '2-digit' : undefined,
  }).format(date);
}

export function readableCadence(c: any): string {
  if (!c) return '';
  switch (c.kind) {
    case 'daily': {
      const times = (c.times as string[]).map(clockLabel);
      if (times.length === 0) return 'Daily';
      if (times.length === 1) return `Daily at ${times[0]}`;
      return `${times.length}× daily (${times.join(', ')})`;
    }
    case 'weekly':
      return `${(c.days as number[]).map((d) => DAY_NAMES[d]).join('/')} at ${clockLabel(c.time)}`;
    case 'every_n_days':
      return `Every ${c.n} days at ${clockLabel(c.time)}`;
    case 'every_n_weeks':
      return `Every ${c.n} weeks on ${(c.days as number[]).map((d) => DAY_NAMES[d]).join('/')} at ${clockLabel(c.time)}`;
    case 'monthly_dom':
      return `Day ${c.day} of every month at ${clockLabel(c.time)}`;
    case 'monthly_nth': {
      const ord = ['1st', '2nd', '3rd', '4th', 'Last'][c.nth - 1] ?? `${c.nth}th`;
      return `${ord} ${DAY_NAMES[c.weekday]} of every month at ${clockLabel(c.time)}`;
    }
    default:
      return '';
  }
}
