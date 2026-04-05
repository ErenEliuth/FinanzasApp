/**
 * Real-time price fetching for stocks and crypto.
 * Uses Yahoo Finance (stocks) and CoinGecko (crypto).
 */

export interface SearchResult {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  type: 'stock' | 'crypto' | 'etf' | 'fixed' | 'real_estate' | 'fund';
  exchange?: string;
  currency?: string;
}

const CRYPTO_IDS: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'BNB': 'binancecoin',
  'XRP': 'ripple', 'ADA': 'cardano', 'DOGE': 'dogecoin', 'DOT': 'polkadot',
  'AVAX': 'avalanche-2', 'MATIC': 'matic-network', 'LINK': 'chainlink',
  'UNI': 'uniswap', 'ATOM': 'cosmos', 'LTC': 'litecoin',
};

const POPULAR_ASSETS: SearchResult[] = [
  { ticker: 'ECOPETROL', name: 'Ecopetrol S.A.', price: 2640, change: 30, changePercent: 1.15, type: 'stock', exchange: 'BVC' },
  { ticker: 'BCOLOMBIA', name: 'Bancolombia S.A.', price: 35200, change: -180, changePercent: -0.51, type: 'stock', exchange: 'BVC' },
  { ticker: 'PFBCOLOM', name: 'Bancolombia Pref.', price: 34500, change: 200, changePercent: 0.58, type: 'stock', exchange: 'BVC' },
  { ticker: 'GEB', name: 'Grupo Energía Bogotá', price: 2620, change: 15, changePercent: 0.58, type: 'stock', exchange: 'BVC' },
  { ticker: 'ISA', name: 'Interconexión Eléctrica', price: 19100, change: -50, changePercent: -0.26, type: 'stock', exchange: 'BVC' },
  { ticker: 'PFAVAL', name: 'Grupo Aval Pref.', price: 480, change: 5, changePercent: 1.05, type: 'stock', exchange: 'BVC' },
  { ticker: 'NUTRESA', name: 'Grupo Nutresa', price: 48000, change: 320, changePercent: 0.67, type: 'stock', exchange: 'BVC' },
  { ticker: 'AAPL', name: 'Apple Inc.', price: 188.5, change: 2.1, changePercent: 1.13, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 820, change: 15.3, changePercent: 1.9, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'TSLA', name: 'Tesla, Inc.', price: 175, change: -3.2, changePercent: -1.8, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', price: 425, change: 4.5, changePercent: 1.07, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', price: 155, change: 1.8, changePercent: 1.17, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 185, change: 2.3, changePercent: 1.26, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'NU', name: 'Nu Holdings (NuBank)', price: 12.5, change: 0.3, changePercent: 2.46, type: 'stock', exchange: 'NYSE', currency: 'USD' },
  { ticker: 'TRIIRENTA', name: 'triirenta Accival Vista', price: 1, change: 0, changePercent: 5.94, type: 'fund', exchange: 'Trii' },
  { ticker: 'FICACC', name: 'FIC Acciones Colombia', price: 15400, change: 120, changePercent: 0.78, type: 'fund', exchange: 'Trii' },
  { ticker: 'FICRENTA', name: 'FIC Renta Fija', price: 21500, change: 45, changePercent: 0.21, type: 'fund', exchange: 'Trii' },
  { ticker: 'ICOLEAP', name: 'iShares MSCI Colombia ETF', price: 25.4, change: 0.15, changePercent: 0.59, type: 'etf', exchange: 'NYSE', currency: 'USD' },
  { ticker: 'BTC', name: 'Bitcoin', price: 67500, change: 1200, changePercent: 1.81, type: 'crypto', currency: 'USD' },
  { ticker: 'ETH', name: 'Ethereum', price: 3350, change: 85, changePercent: 2.6, type: 'crypto', currency: 'USD' },
  { ticker: 'SOL', name: 'Solana', price: 142, change: 5.2, changePercent: 3.8, type: 'crypto', currency: 'USD' },
  { ticker: 'BNB', name: 'BNB (Binance)', price: 580, change: -8, changePercent: -1.36, type: 'crypto', currency: 'USD' },
  { ticker: 'XRP', name: 'XRP (Ripple)', price: 0.62, change: 0.02, changePercent: 3.33, type: 'crypto', currency: 'USD' },
  { ticker: 'ADA', name: 'Cardano', price: 0.45, change: 0.01, changePercent: 2.27, type: 'crypto', currency: 'USD' },
];

/**
 * Fetch live crypto price from CoinGecko (free, no API key needed)
 */
export async function fetchCryptoPrice(ticker: string): Promise<{ price: number; change24h: number } | null> {
  const id = CRYPTO_IDS[ticker.toUpperCase()];
  if (!id) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`
    );
    const data = await res.json();
    if (data[id]) {
      return { price: data[id].usd, change24h: data[id].usd_24h_change || 0 };
    }
    return null;
  } catch { return null; }
}

const YAHOO_MAPPING: Record<string, string> = {
  'ECOPETROL': 'ECOPETROL.CL',
  'BCOLOMBIA': 'BCOLOMBIA.CL',
  'PFBCOLOM': 'PFBCOLOM.CL',
  'GEB': 'GEB.CL',
  'ISA': 'ISA.CL',
  'PFAVAL': 'PFAVAL.CL',
  'NUTRESA': 'NUTRESA.CL',
};

/**
 * Fetch live stock/etf price from Yahoo Finance via public raw proxy
 */
export async function fetchStockPrice(ticker: string): Promise<number | null> {
  try {
    const yTicker = YAHOO_MAPPING[ticker.toUpperCase()] || ticker.toUpperCase();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yTicker}?interval=1d`;
    // Using simple proxy to allow CORS without wrapper
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
      return data.chart.result[0].meta.regularMarketPrice;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Simulate organic fund growth based on APY (changePercent) since Jan 1 2024
 */
export function simulateFundGrowth(basePrice: number, apy: number): number {
  const start = new Date('2024-01-01T00:00:00Z').getTime();
  const now = Date.now();
  const daysPassed = Math.max(1, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
  return basePrice * Math.pow(1 + apy / 365 / 100, daysPassed);
}

/**
 * Search assets by query (name or ticker). Returns matching results from popular + live APIs.
 */
export async function searchAssets(query: string): Promise<SearchResult[]> {
  if (!query || query.length < 1) return POPULAR_ASSETS.slice(0, 8);
  
  const q = query.toUpperCase().trim();
  const local = POPULAR_ASSETS.filter(
    a => a.ticker.includes(q) || a.name.toUpperCase().includes(q)
  );

  // Try to fetch live crypto prices and simulate fund growth
  const enriched = await Promise.all(
    local.map(async (asset) => {
      if (asset.type === 'crypto') {
        const live = await fetchCryptoPrice(asset.ticker);
        if (live) {
          return { ...asset, price: live.price, changePercent: live.change24h };
        }
      } else if (asset.type === 'fund') {
        const simulatedPrice = simulateFundGrowth(asset.price, asset.changePercent);
        // Calculate the "changePercent" for funds based on the APY simulation vs original price (just an aesthetic metric)
        const dailyChange = apyToDailyYieldPercent(asset.changePercent);
        return { ...asset, price: simulatedPrice, changePercent: dailyChange };
      }
      return asset;
    })
  );

  return enriched.length > 0 ? enriched : local;
}

function apyToDailyYieldPercent(apy: number) {
  return ((Math.pow(1 + apy / 100, 1 / 365) - 1) * 100);
}

/**
 * Get live price for a position (crypto via CoinGecko, stocks via Yahoo, funds via logic)
 */
export async function fetchLivePrice(ticker: string, type: string): Promise<number | null> {
  if (type === 'crypto') {
    const data = await fetchCryptoPrice(ticker);
    return data ? data.price : null;
  }
  
  if (type === 'fund') {
    const found = POPULAR_ASSETS.find(a => a.ticker === ticker);
    if (found) {
      return simulateFundGrowth(found.price, found.changePercent || 6);
    }
  }

  if (type === 'stock' || type === 'etf') {
    const liveStock = await fetchStockPrice(ticker);
    if (liveStock) return liveStock;
  }

  // Fallback for missing references
  const found = POPULAR_ASSETS.find(a => a.ticker === ticker);
  return found ? found.price : null;
}

export { POPULAR_ASSETS };
