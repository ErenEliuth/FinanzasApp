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
  { ticker: 'ECOPETROL', name: 'Ecopetrol S.A.', price: 2435, change: -15, changePercent: -0.61, type: 'stock', exchange: 'BVC' },
  { ticker: 'BCOLOMBIA', name: 'Bancolombia S.A.', price: 34100, change: -1100, changePercent: -3.13, type: 'stock', exchange: 'BVC' },
  { ticker: 'PFBCOLOM', name: 'Bancolombia Pref.', price: 33800, change: -700, changePercent: -2.03, type: 'stock', exchange: 'BVC' },
  { ticker: 'GEB', name: 'Grupo Energía Bogotá', price: 2580, change: -40, changePercent: -1.53, type: 'stock', exchange: 'BVC' },
  { ticker: 'ISA', name: 'Interconexión Eléctrica', price: 18400, change: -700, changePercent: -3.66, type: 'stock', exchange: 'BVC' },
  { ticker: 'PFAVAL', name: 'Grupo Aval Pref.', price: 465, change: -15, changePercent: -3.12, type: 'stock', exchange: 'BVC' },
  { ticker: 'NUTRESA', name: 'Grupo Nutresa', price: 46500, change: -1500, changePercent: -3.12, type: 'stock', exchange: 'BVC' },
  { ticker: 'AAPL', name: 'Apple Inc.', price: 191.2, change: 2.7, changePercent: 1.43, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', price: 845, change: 25, changePercent: 3.05, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'TSLA', name: 'Tesla, Inc.', price: 172, change: -3, changePercent: -1.71, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', price: 421, change: -4, changePercent: -0.94, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', price: 158, change: 3, changePercent: 1.93, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', price: 182, change: -3, changePercent: -1.62, type: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { ticker: 'NU', name: 'Nu Holdings (NuBank)', price: 13.2, change: 0.7, changePercent: 5.6, type: 'stock', exchange: 'NYSE', currency: 'USD' },
  { ticker: 'TRIIRENTA', name: 'triirenta Accival Vista', price: 1, change: 0, changePercent: 8.52, type: 'fund', exchange: 'Trii' },
  { ticker: 'FICACC', name: 'FIC Acciones Colombia', price: 14200, change: -1200, changePercent: -7.79, type: 'fund', exchange: 'Trii' },
  { ticker: 'FICRENTA', name: 'FIC Renta Fija', price: 21800, change: 300, changePercent: 1.4, type: 'fund', exchange: 'Trii' },
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
  'ECOPETROL': 'ECOPETROL.CO',
  'BCOLOMBIA': 'BCOLOMBIA.CO',
  'PFBCOLOM': 'PFBCOLOM.CO',
  'GEB': 'GEB.CO',
  'ISA': 'ISA.CO',
  'PFAVAL': 'PFAVAL.CO',
  'NUTRESA': 'NUTRESA.CO',
  'GRUPOSURA': 'GRUPOSURA.CO',
  'PFGRUPSUR': 'PFGRUPSUR.CO',
  'CELSIA': 'CELSIA.CO',
  'CNEC': 'CNEC.CO',
  'BVC': 'BVC.CO',
};

/**
 * Fetch live stock price from TradingView Scanner (more real-time for BVC)
 */
export async function fetchTradingViewPrice(ticker: string): Promise<{ price: number; change: number; changePercent: number } | null> {
  try {
    const symbol = ticker.toUpperCase().includes(':') ? ticker.toUpperCase() : `BVC:${ticker.toUpperCase()}`;
    const url = 'https://scanner.tradingview.com/colombia/scan';
    const body = {
      symbols: { tickers: [symbol] },
      columns: ['close', 'change', 'change_abs']
    };

    let res;
    if (typeof window !== 'undefined' && window.location) {
       // On web use proxy for CORS
       res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
         method: 'POST',
         body: JSON.stringify(body)
       });
    } else {
       res = await fetch(url, {
         method: 'POST',
         body: JSON.stringify(body)
       });
    }
    
    const data = await res.json();
    const result = data.data?.[0]?.d;
    
    if (result && result.length >= 3) {
      return {
        price: result[0],
        changePercent: result[1],
        change: result[2]
      };
    }
    return null;
  } catch (error) {
    console.log("TV Error for", ticker, error);
    return null;
  }
}

/**
 * Fetch live stock/etf price from Yahoo Finance via public raw proxy
 */
export async function fetchStockPrice(ticker: string): Promise<{ price: number; change: number; changePercent: number } | null> {
  // Prioritize TradingView for BVC stocks
  const isBvc = YAHOO_MAPPING[ticker.toUpperCase()] || ticker.toUpperCase() === 'ECOPETROL' || ticker.toUpperCase() === 'BCOLOMBIA';
  if (isBvc) {
    const tv = await fetchTradingViewPrice(ticker);
    if (tv) return tv;
  }

  try {
    const yTicker = YAHOO_MAPPING[ticker.toUpperCase()] || ticker.toUpperCase();
    // Use query2 for better reliability and skip proxy on native if possible
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yTicker}?interval=1d&range=2d`;
    
    let res;
    if (typeof window !== 'undefined' && window.location) {
       // On web we likely need a proxy due to CORS
       res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    } else {
       // On native we can fetch directly
       res = await fetch(url);
    }
    
    const data = await res.json();
    const result = data.chart?.result?.[0];
    
    if (result && result.meta?.regularMarketPrice) {
      const price = result.meta.regularMarketPrice;
      const prevClose = result.meta.chartPreviousClose || result.meta.previousClose;
      return {
        price,
        change: price - prevClose,
        changePercent: ((price - prevClose) / prevClose) * 100
      };
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

  // Try to fetch live crypto prices, stock prices and simulate fund growth
  const enriched = await Promise.all(
    local.map(async (asset) => {
      if (asset.type === 'crypto') {
        const live = await fetchCryptoPrice(asset.ticker);
        if (live) {
          return { ...asset, price: live.price, changePercent: live.change24h };
        }
      } else if (asset.type === 'stock' || asset.type === 'etf') {
        const live = await fetchStockPrice(asset.ticker);
        if (live) {
          return { ...asset, price: live.price, changePercent: live.changePercent, change: live.change };
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
    if (liveStock) return liveStock.price;
  }

  // Fallback for missing references
  const found = POPULAR_ASSETS.find(a => a.ticker === ticker);
  return found ? found.price : null;
}

/**
 * Fetch a summary of the Colombian market (BVC)
 */
export async function fetchBvcMarketOverview(): Promise<SearchResult[]> {
  const bvcTickers = ['ECOPETROL', 'BCOLOMBIA', 'PFBCOLOM', 'GEB', 'ISA', 'PFAVAL', 'NUTRESA', 'GRUPOSURA'];
  
  // Intento masivo con TradingView
  try {
    const url = 'https://scanner.tradingview.com/colombia/scan';
    const body = {
      symbols: { tickers: bvcTickers.map(t => `BVC:${t}`) },
      columns: ['close', 'change', 'change_abs', 'description']
    };
    
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();
    
    if (data.data && data.data.length > 0) {
      return data.data.map((item: any, i: number) => ({
        ticker: bvcTickers[i],
        name: item.d[3] || bvcTickers[i],
        price: item.d[0],
        change: item.d[2],
        changePercent: item.d[1],
        type: 'stock' as const,
        exchange: 'BVC'
      }));
    }
  } catch (e) {
    console.log("Error in BVC TradingView fetch, falling back to individual");
  }

  const data = await Promise.all(bvcTickers.map(async (ticker) => {
    const live = await fetchStockPrice(ticker);
    const popular = POPULAR_ASSETS.find(p => p.ticker === ticker);
    if (live) {
      return {
        ticker,
        name: popular?.name || ticker,
        price: live.price,
        change: live.change,
        changePercent: live.changePercent,
        type: 'stock' as const,
        exchange: 'BVC'
      };
    }
    return popular || null;
  }));
  return data.filter((x): x is SearchResult => x !== null);
}

/**
 * Add a tiny bit of random noise to a price to make it feel "live" in a demo/dashboard
 */
export function simulateLiveVolatility(price: number): number {
  const isMarketOpen = () => {
    const now = new Date();
    const h = now.getHours();
    const d = now.getDay();
    return d !== 0 && d !== 6 && h >= 9 && h < 16;
  };
  
  if (!isMarketOpen()) return price;
  
  // Random fluctuation between -0.05% and +0.05%
  const factor = 1 + (Math.random() * 0.001 - 0.0005);
  return price * factor;
}

export { POPULAR_ASSETS };
