/**
 * Utility for currency formatting in Sanctuary.
 * Supports USD, EUR, DOP, and COP.
 */

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  locale: string;
}

export const CURRENCIES: Currency[] = [
    { code: 'COP', name: 'Pesos Colombianos', symbol: '$', locale: 'es-CO' },
    { code: 'USD', name: 'Dólares Americanos', symbol: 'US$', locale: 'en-US' },
    { code: 'EUR', name: 'Euros', symbol: '€', locale: 'de-DE' },
    { code: 'DOP', name: 'Pesos Dominicanos', symbol: 'RD$', locale: 'es-DO' },
];

/**
 * DEFAULT_RATES defines how many BASE units (COP by default) equals 1 unit of the target currency.
 * e.g. 1 USD = 3921 COP
 */
export const DEFAULT_RATES: Record<string, number> = {
    COP: 1,
    USD: 3950,
    EUR: 4250,
    DOP: 67,
};

export function getCurrencyInfo(code: string): Currency {
    return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

export function formatCurrency(amount: number, code: string, isHidden: boolean = false): string {
    if (isHidden) return '****';
    const info = getCurrencyInfo(code);
    return new Intl.NumberFormat(info.locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: code === 'COP' || code === 'DOP' ? 0 : 2,
        maximumFractionDigits: code === 'COP' || code === 'DOP' ? 0 : 2,
    }).format(amount);
}

/**
 * Converts an amount from base currency to target currency.
 */
export function convertCurrency(amount: number, targetCode: string, rates: Record<string, number>): number {
    const rate = rates[targetCode] || 1;
    if (targetCode === 'COP') return amount; // Base stays same
    return amount / rate;
}

/**
 * Converts an amount back to base currency.
 */
export function convertToBase(amount: number, currentCode: string, rates: Record<string, number>): number {
    const rate = rates[currentCode] || 1;
    return amount * rate;
}

/**
 * Fetches latest exchange rates from a public API.
 * Base is COP, but we return how many COP = 1 target unit.
 */
export async function fetchExchangeRates(): Promise<Record<string, number> | null> {
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/COP');
        const data = await response.json();
        if (data && data.rates) {
            const newRates: Record<string, number> = { COP: 1 };
            // Invert rates: the API gives 1 COP = X USD, we want 1 USD = (1/X) COP
            if (data.rates.USD) newRates.USD = parseFloat((1 / data.rates.USD).toFixed(4));
            if (data.rates.EUR) newRates.EUR = parseFloat((1 / data.rates.EUR).toFixed(4));
            if (data.rates.DOP) newRates.DOP = parseFloat((1 / data.rates.DOP).toFixed(4));
            return newRates;
        }
        return null;
    } catch (e) {
        console.error('Error fetching rates:', e);
        return null;
    }
}
