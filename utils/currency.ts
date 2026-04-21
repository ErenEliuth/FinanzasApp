/**
 * Utility for currency formatting in Sanctuary.
 * Supports USD, EUR, DOP, and COP.
 *
 * Architecture:
 *  - All data in DB is stored in COP (base currency).
 *  - `convertCurrency(amount, target, rates)` → COP → Target.
 *  - `convertToBase(amount, source, rates)` → Target → COP.
 *  - `formatInputDisplay` → handles locale-aware input formatting.
 *  - `parseInputToNumber` → parses formatted input back to a plain number.
 *  - `fetchExchangeRates` → fetches live rates, caches in AsyncStorage for 6h.
 */

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  locale: string;
  /** true = currency uses decimal places (e.g. USD 1.50), false = integer only (COP 1500) */
  hasDecimals: boolean;
}

export const CURRENCIES: Currency[] = [
    { code: 'COP', name: 'Pesos Colombianos',  symbol: '$',   locale: 'es-CO', hasDecimals: false },
    { code: 'USD', name: 'Dólares Americanos', symbol: 'US$', locale: 'en-US', hasDecimals: true  },
    { code: 'EUR', name: 'Euros',              symbol: '€',   locale: 'de-DE', hasDecimals: true  },
    { code: 'DOP', name: 'Pesos Dominicanos',  symbol: 'RD$', locale: 'es-DO', hasDecimals: true  },
];

/**
 * Fallback rates: how many COP = 1 unit of the currency.
 * These are ONLY used if the live fetch fails AND nothing is cached.
 */
export const DEFAULT_RATES: Record<string, number> = {
    COP: 1,
    USD: 4200,
    EUR: 4600,
    DOP: 72,
};

export function getCurrencyInfo(code: string): Currency {
    return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Formats a plain number to a display currency string.
 * Always uses the Intl API with the correct locale and fraction digits.
 */
export function formatCurrency(amount: number, code: string, isHidden: boolean = false): string {
    if (isHidden) return '****';
    const info = getCurrencyInfo(code);
    return new Intl.NumberFormat(info.locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: info.hasDecimals ? 2 : 0,
        maximumFractionDigits: info.hasDecimals ? 2 : 0,
    }).format(amount);
}

// ─── Input Helpers ────────────────────────────────────────────────────────────

/**
 * Formats a raw user-typed string for display inside a TextInput.
 *
 * Rules per currency:
 *  - COP  (es-CO): integer only, thousands separator = "."  →  "1.500.000"
 *  - USD  (en-US): decimals allowed, thousands separator = "," → "1,500.00"
 *  - EUR  (de-DE): decimals allowed, thousands separator = "." → "1.500,00"
 *  - DOP  (es-DO): decimals allowed, thousands separator = "," → "1,500.00"
 *
 * To avoid ambiguity we ALWAYS store the decimal separator as "." internally
 * and map the locale's decimal char only for display in formatCurrency.
 * Inside the input we use "." universally as the decimal separator so the
 * numeric keyboard is consistent on all platforms.
 */
export function formatInputDisplay(text: string, code: string): string {
    if (!text) return '';
    const info = getCurrencyInfo(code);

    if (!info.hasDecimals) {
        // --- Integer-only currencies (COP) ---
        const digits = text.replace(/\D/g, '');
        if (!digits) return '';
        const val = parseInt(digits, 10);
        if (isNaN(val)) return '';
        // Use locale to format with the correct thousands separator
        return new Intl.NumberFormat(info.locale).format(val);
    }

    // --- Decimal currencies (USD, EUR, DOP) ---
    // We use "." as the universal decimal separator in the input field.
    // Strip everything except digits and the first "."
    let clean = text.replace(/[^0-9.]/g, '');

    // If the user typed multiple dots, keep only the first one
    const firstDot = clean.indexOf('.');
    if (firstDot !== -1) {
        clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '');
    }

    const parts = clean.split('.');
    const integerRaw = parts[0];
    const decimalRaw = parts[1]; // undefined if no dot yet

    // Format the integer part with thousands separators
    let formattedInt = '';
    if (integerRaw) {
        const intVal = parseInt(integerRaw, 10);
        if (!isNaN(intVal)) {
            // Always use comma as thousands separator for decimal currencies
            // regardless of locale, so the dot stays free for decimals.
            formattedInt = intVal.toLocaleString('en-US');
        }
    }

    // Reassemble
    if (typeof decimalRaw !== 'undefined') {
        // User typed the dot
        return `${formattedInt}.${decimalRaw.slice(0, 2)}`;
    }
    return formattedInt;
}

/**
 * Parses a formatted input string back to a clean JS number.
 * Works for all locales because we keep "." as the decimal separator
 * internally (see formatInputDisplay above).
 */
export function parseInputToNumber(text: string, code: string): number {
    if (!text) return 0;
    const info = getCurrencyInfo(code);

    if (!info.hasDecimals) {
        // Remove all non-digits (e.g. thousands separators)
        const clean = text.replace(/\D/g, '');
        const val = parseInt(clean, 10);
        return isNaN(val) ? 0 : val;
    }

    // Remove thousands separators (commas) then parse float
    const clean = text.replace(/,/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Converts an amount from base currency (COP) to the target display currency.
 * @param amount - value in COP
 * @param targetCode - target currency code
 * @param rates - live rates object (1 COP = 1/rate[target])
 */
export function convertCurrency(
    amount: number,
    targetCode: string,
    rates: Record<string, number>
): number {
    if (targetCode === 'COP') return amount;
    const rate = rates[targetCode] ?? DEFAULT_RATES[targetCode] ?? 1;
    if (rate === 0) return amount;
    return amount / rate;
}

/**
 * Converts an amount from the user's display currency back to the base (COP).
 * Call this before persisting to DB.
 * @param amount - value as the user typed it (in their selected currency)
 * @param sourceCode - the currency the user is currently using
 * @param rates - live rates object
 */
export function convertToBase(
    amount: number,
    sourceCode: string,
    rates: Record<string, number>
): number {
    if (sourceCode === 'COP') return amount;
    const rate = rates[sourceCode] ?? DEFAULT_RATES[sourceCode] ?? 1;
    return amount * rate;
}

// ─── Rate Fetching ────────────────────────────────────────────────────────────

const RATES_CACHE_KEY = '@sanctuary_exchange_rates';
const RATES_TIMESTAMP_KEY = '@sanctuary_rates_timestamp';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fetches live exchange rates from open.er-api.com.
 * Caches in AsyncStorage with a 6-hour TTL.
 *
 * Rate format stored/returned: { COP: 1, USD: 4200, EUR: 4600, DOP: 72 }
 * Meaning: 1 USD = 4200 COP, 1 EUR = 4600 COP, etc.
 *
 * @param forceRefresh - if true, bypasses the cache and always fetches.
 */
export async function fetchExchangeRates(
    forceRefresh = false
): Promise<Record<string, number> | null> {
    try {
        // Dynamic import so this file tree-shakes cleanly in web builds
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

        if (!forceRefresh) {
            const [cachedRatesStr, cachedTimestampStr] = await Promise.all([
                AsyncStorage.getItem(RATES_CACHE_KEY),
                AsyncStorage.getItem(RATES_TIMESTAMP_KEY),
            ]);

            if (cachedRatesStr && cachedTimestampStr) {
                const age = Date.now() - parseInt(cachedTimestampStr, 10);
                if (age < CACHE_TTL_MS) {
                    // Cache still valid
                    return JSON.parse(cachedRatesStr);
                }
            }
        }

        // Fetch from API — base = USD, invert to get COP per 1 unit
        const response = await fetch('https://open.er-api.com/v6/latest/USD', {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (!data?.rates || data.result !== 'success') {
            throw new Error('Invalid API response');
        }

        // data.rates gives: 1 USD = X units of each currency
        // e.g. data.rates.COP = 4200  → 1 USD = 4200 COP
        const copPerUsd: number = data.rates.COP;
        if (!copPerUsd) throw new Error('COP rate missing from API');

        const newRates: Record<string, number> = { COP: 1 };

        // Convert each currency: how many COP = 1 unit of that currency?
        // copPerUnit = copPerUsd / (usdPer1Unit)
        // Since data.rates.X = how many X per 1 USD → 1 X = copPerUsd / data.rates.X COP
        const currencies = ['USD', 'EUR', 'DOP'];
        for (const code of currencies) {
            if (data.rates[code]) {
                // Round to 2 decimal places to avoid floating point drift
                newRates[code] = Math.round((copPerUsd / data.rates[code]) * 100) / 100;
            }
        }

        // Persist to cache
        await Promise.all([
            AsyncStorage.setItem(RATES_CACHE_KEY, JSON.stringify(newRates)),
            AsyncStorage.setItem(RATES_TIMESTAMP_KEY, String(Date.now())),
        ]);

        return newRates;
    } catch (e) {
        console.warn('[Sanctuary] fetchExchangeRates failed:', e);
        return null;
    }
}

/**
 * Returns true when the cached rates are older than the TTL (or missing).
 * Use this to decide whether to show a "rates may be outdated" warning.
 */
export async function areRatesStale(): Promise<boolean> {
    try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const ts = await AsyncStorage.getItem(RATES_TIMESTAMP_KEY);
        if (!ts) return true;
        return Date.now() - parseInt(ts, 10) > CACHE_TTL_MS;
    } catch {
        return true;
    }
}
