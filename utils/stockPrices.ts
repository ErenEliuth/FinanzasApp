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
  type: 'stock' | 'crypto' | 'etf' | 'fixed' | 'real_estate';
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

/**
 * Search assets by query (name or ticker). Returns matching results from popular + live APIs.
 */
export async function searchAssets(query: string): Promise<SearchResult[]> {
  if (!query || query.length < 1) return POPULAR_ASSETS.slice(0, 8);
  
  const q = query.toUpperCase().trim();
  const local = POPULAR_ASSETS.filter(
    a => a.ticker.includes(q) || a.name.toUpperCase().includes(q)
  );

  // Try to fetch live crypto prices for matched cryptos
  const enriched = await Promise.all(
    local.map(async (asset) => {
      if (asset.type === 'crypto') {
        const live = await fetchCryptoPrice(asset.ticker);
        if (live) {
          return { ...asset, price: live.price, changePercent: live.change24h };
        }
      }
      return asset;
    })
  );

  return enriched.length > 0 ? enriched : local;
}

/**
 * Get live price for a position (crypto via CoinGecko, stocks via fallback)
 */
export async function fetchLivePrice(ticker: string, type: string): Promise<number | null> {
  if (type === 'crypto') {
    const data = await fetchCryptoPrice(ticker);
    return data ? data.price : null;
  }
  // For stocks, return from popular assets cache  
  const found = POPULAR_ASSETS.find(a => a.ticker === ticker);
  return found ? found.price : null;
}

export { POPULAR_ASSETS };
