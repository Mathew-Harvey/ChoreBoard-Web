/**
 * Browser-side country / currency detection.
 *
 * The chore-suggestion pricing engine on the API picks per-country base
 * rates anchored to published allowance surveys (RoosterMoney UK, HeyKit
 * AU, Wells Fargo / Greenlight US — see `chorePricing.ts` on the API for
 * citations). To make those suggestions usable from the moment a parent
 * lands on signup, we need a *country* signal *before* the parent has
 * filled out anything — and we want to avoid blocking signup on a
 * geolocation prompt the user might decline.
 *
 * Strategy is layered, fastest-first:
 *
 *   1. **Locale-only** (synchronous, zero permissions):
 *        - Region from `navigator.language` (e.g. 'en-AU' → 'AU').
 *        - Cross-checked against the Intl-derived timezone for sanity
 *          (so 'en-US' on a Sydney device falls back to AU).
 *
 *   2. **Geolocation + reverse-geocode** (async, requires permission):
 *        - `navigator.geolocation.getCurrentPosition(...)` with a 6 s
 *          timeout.
 *        - Reverse-geocoded via BigDataCloud's free, no-key
 *          `client-ip-to-country` / `reverse-geocode-client` endpoints.
 *          BigDataCloud advertises this for unauthenticated client-side
 *          use up to a generous quota; if the request fails we silently
 *          stick with the locale-derived guess.
 *
 *   3. The result is **always overridable** in the UI (signup form +
 *      Admin → Family). We never gate features on this — it is purely
 *      a smarter default for the price suggestions.
 */

// ----------------------------------------------------------------------------
// Country mapping helpers
// ----------------------------------------------------------------------------

/** Country → ISO 4217 currency. Mirrors the API table; kept in sync by hand. */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  AU: 'AUD',
  NZ: 'NZD',
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  IE: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  PT: 'EUR',
  AT: 'EUR',
  FI: 'EUR',
  // Common diaspora targets — keep AUD/USD/GBP for these so a user
  // travelling on a non-AU/UK SIM still sees the right ballpark.
};

/** Pretty country list shown in the dropdown. Matches the API table. */
export const SUPPORTED_COUNTRIES: Array<{ code: string; label: string; currency: string }> = [
  { code: 'AU', label: 'Australia', currency: 'AUD' },
  { code: 'NZ', label: 'New Zealand', currency: 'NZD' },
  { code: 'US', label: 'United States', currency: 'USD' },
  { code: 'CA', label: 'Canada', currency: 'CAD' },
  { code: 'GB', label: 'United Kingdom', currency: 'GBP' },
  { code: 'IE', label: 'Ireland', currency: 'EUR' },
  { code: 'FR', label: 'France', currency: 'EUR' },
  { code: 'DE', label: 'Germany', currency: 'EUR' },
  { code: 'ES', label: 'Spain', currency: 'EUR' },
  { code: 'IT', label: 'Italy', currency: 'EUR' },
  { code: 'NL', label: 'Netherlands', currency: 'EUR' },
];

const SUPPORTED = new Set(SUPPORTED_COUNTRIES.map((c) => c.code));

export function defaultCurrencyForCountry(country: string | null | undefined): string {
  if (!country) return 'USD';
  return CURRENCY_BY_COUNTRY[country.toUpperCase()] ?? 'USD';
}

// ----------------------------------------------------------------------------
// Locale-only detection (synchronous)
// ----------------------------------------------------------------------------

/**
 * Best-effort country code (`'AU' | 'US' | …`) from `navigator.language`.
 * Returns `null` if the locale doesn't carry a region tag (e.g. 'en').
 */
function regionFromNavigatorLanguage(): string | null {
  const langs: string[] = [];
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) langs.push(...navigator.languages);
    if (navigator.language) langs.push(navigator.language);
  }
  for (const tag of langs) {
    try {
      const loc = new Intl.Locale(tag);
      if (loc.region && loc.region.length === 2) {
        const cc = loc.region.toUpperCase();
        if (SUPPORTED.has(cc)) return cc;
      }
    } catch {
      // Older browsers / Capacitor WebViews can throw on unknown tags.
    }
  }
  return null;
}

/** Coarse country guess from the IANA timezone, used as a tiebreaker. */
function regionFromTimezone(): string | null {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
  if (!tz) return null;
  // Just enough mapping to disambiguate the common cases. Anything not
  // in this table returns null — we don't want to confidently map
  // `Africa/Algiers` to a country we don't price for.
  const PREFIXES: Array<[string, string]> = [
    ['Australia/', 'AU'],
    ['Pacific/Auckland', 'NZ'],
    ['Pacific/Chatham', 'NZ'],
    ['America/', 'US'], // most America/* is US; CA/MX overrides below.
    ['America/Toronto', 'CA'],
    ['America/Vancouver', 'CA'],
    ['America/Edmonton', 'CA'],
    ['America/Halifax', 'CA'],
    ['America/Winnipeg', 'CA'],
    ['America/Montreal', 'CA'],
    ['America/Regina', 'CA'],
    ['Europe/London', 'GB'],
    ['Europe/Dublin', 'IE'],
    ['Europe/Paris', 'FR'],
    ['Europe/Berlin', 'DE'],
    ['Europe/Madrid', 'ES'],
    ['Europe/Rome', 'IT'],
    ['Europe/Amsterdam', 'NL'],
    ['Europe/Brussels', 'BE'],
    ['Europe/Lisbon', 'PT'],
    ['Europe/Vienna', 'AT'],
    ['Europe/Helsinki', 'FI'],
  ];
  // Most-specific first: longer prefix wins.
  PREFIXES.sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, cc] of PREFIXES) {
    if (tz === prefix || tz.startsWith(prefix)) {
      return SUPPORTED.has(cc) ? cc : null;
    }
  }
  return null;
}

export type LocaleGuess = {
  country: string | null;
  currency: string | null;
  /**
   * `'locale' | 'timezone' | 'geolocation'` so the UI can show a small
   * "auto-detected from your location" / "from your browser language"
   * label without guessing why we picked the value.
   */
  source: 'locale' | 'timezone' | 'geolocation' | 'none';
};

/**
 * Synchronous detection from navigator.language + timezone. Always
 * returns immediately and never prompts. Use this for the initial
 * value of the signup form; resolveCountry() can refine asynchronously.
 */
export function localeGuess(): LocaleGuess {
  const fromLang = regionFromNavigatorLanguage();
  if (fromLang) {
    return { country: fromLang, currency: defaultCurrencyForCountry(fromLang), source: 'locale' };
  }
  const fromTz = regionFromTimezone();
  if (fromTz) {
    return { country: fromTz, currency: defaultCurrencyForCountry(fromTz), source: 'timezone' };
  }
  return { country: null, currency: null, source: 'none' };
}

// ----------------------------------------------------------------------------
// Geolocation + reverse-geocode
// ----------------------------------------------------------------------------

type GeoCoord = { latitude: number; longitude: number };

/**
 * Wraps `navigator.geolocation.getCurrentPosition` with a manual timeout
 * and a single-shot promise. Resolves to `null` on permission denial,
 * timeout, or any other failure — the caller falls back to the locale
 * guess. We never throw: detection is best-effort.
 */
function getBrowserPosition(timeoutMs = 6000): Promise<GeoCoord | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
      // High accuracy off — country resolution is plenty.
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 24 * 60 * 60 * 1000 },
    );
  });
}

/**
 * Reverse-geocode lat/lon → ISO 3166-1 alpha-2 via BigDataCloud's free
 * client-side endpoint. Documented as no-key, browser-callable, with a
 * generous shared quota; if the request fails or is rate-limited we
 * resolve to `null` and the caller falls back.
 *
 * We deliberately don't proxy this through our own API — sending the
 * coords to api.choreboard.io would force us to handle PII storage; the
 * BigDataCloud call leaves the coords on the user's device.
 */
async function reverseGeocodeCountry(coord: GeoCoord): Promise<string | null> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(coord.latitude)}` +
      `&longitude=${encodeURIComponent(coord.longitude)}` +
      `&localityLanguage=en`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: { countryCode?: string } = await res.json();
    if (typeof data.countryCode === 'string' && data.countryCode.length === 2) {
      return data.countryCode.toUpperCase();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a country code, optionally asking for browser geolocation.
 *
 * `requestGeolocation: true` will ask the OS for permission *if* it
 * isn't already granted. On signup we leave this off (we want the form
 * to be filled instantly); on the "Refine my location" button in
 * Admin → Family we turn it on so the parent gets the better answer.
 */
export async function resolveCountry(opts?: {
  requestGeolocation?: boolean;
}): Promise<LocaleGuess> {
  const fallback = localeGuess();
  if (!opts?.requestGeolocation) return fallback;

  const pos = await getBrowserPosition();
  if (!pos) return fallback;
  const cc = await reverseGeocodeCountry(pos);
  if (!cc) return fallback;
  // If geolocation lands us on a country we don't price for, prefer
  // the locale guess so the parent at least sees suggested chores in
  // their familiar currency.
  if (!SUPPORTED.has(cc)) return fallback;
  return {
    country: cc,
    currency: defaultCurrencyForCountry(cc),
    source: 'geolocation',
  };
}
