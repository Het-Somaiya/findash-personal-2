/**
 * FinDash — Unified API layer
 *
 * Market data: Massive.com Stock API (mock mode by default)
 *   → Set MOCK = false and provide MASSIVE_API_KEY to go live
 *
 * News + tickers: Django backend at localhost:8000/api/news/
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const MASSIVE_API_KEY = import.meta.env.VITE_MASSIVE_API_KEY ?? "";
const MASSIVE_BASE    = "https://api.massive.com";
// Automatically uses live data when a real key is provided
const MOCK = !MASSIVE_API_KEY || MASSIVE_API_KEY === "your-massive-api-key-here";

const BACKEND_BASE    = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Quote {
  symbol:      string;
  name:        string;
  price:       number;
  change:      number;
  changePct:   number;
  volume:      number;
  marketCap?:  number;
  lastUpdated: string;
}

export interface TickerSuggestion {
  symbol:   string;
  name:     string;
  type:     "stock" | "etf" | "index" | "crypto";
  exchange: string;
}

export interface MarketSnapshot {
  label:  string;
  value:  string;
  change: string;
  up:     boolean;
}

export interface NewsArticle {
  id:       number | string;
  headline: string;
  source:   string;
  time:     string;
  tickers:  string[];
  url:      string;
  image?:   string;
  summary?: string;
  sentiment: "positive" | "negative" | "mixed";
  /** Numeric sentiment score from backend (-10 to +10). Null when using fallback data. */
  sentimentScore: number | null;
}

export interface BackendQuote {
  symbol:        string;
  price:         number;
  change:        number;
  changePercent: number;
}

export interface TopSignal {
  ticker:    string;
  type:      "BULLISH" | "BEARISH";
  sentiment: number;
  headline:  string;
}

export interface NewsResponse {
  articles:    NewsArticle[];
  fromBackend: boolean;
  quotes:      Record<string, BackendQuote>;
  topStocks:   string[];
  topSignals:  TopSignal[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_QUOTES: Record<string, Quote> = {
  SPX:  { symbol: "SPX",  name: "S&P 500 Index",        price: 5842.31,  change: 23.80,  changePct: 0.41,  volume: 0,           lastUpdated: "" },
  NDX:  { symbol: "NDX",  name: "Nasdaq 100 Index",      price: 20614.87, change: 159.80, changePct: 0.78,  volume: 0,           lastUpdated: "" },
  SPY:  { symbol: "SPY",  name: "SPDR S&P 500 ETF",      price: 584.11,   change: 2.44,   changePct: 0.42,  volume: 68_420_000,  lastUpdated: "" },
  VIX:  { symbol: "VIX",  name: "CBOE Volatility Index", price: 14.23,    change: -0.46,  changePct: -3.12, volume: 0,           lastUpdated: "" },
  DXY:  { symbol: "DXY",  name: "US Dollar Index",        price: 103.84,   change: -0.20,  changePct: -0.19, volume: 0,           lastUpdated: "" },
  "10Y":{ symbol: "10Y",  name: "10-Yr Treasury Yield",   price: 4.31,     change: 0.04,   changePct: 0.94,  volume: 0,           lastUpdated: "" },
  BTC:  { symbol: "BTC",  name: "Bitcoin USD",            price: 87240,    change: 1066,   changePct: 1.24,  volume: 0,           lastUpdated: "" },
  QQQ:  { symbol: "QQQ",  name: "Invesco QQQ Trust",      price: 448.87,   change: 3.52,   changePct: 0.79,  volume: 41_100_000,  lastUpdated: "" },
  GLD:  { symbol: "GLD",  name: "SPDR Gold Shares",       price: 232.11,   change: 1.27,   changePct: 0.55,  volume: 8_200_000,   lastUpdated: "" },
  IWM:  { symbol: "IWM",  name: "iShares Russell 2000",   price: 208.54,   change: -0.65,  changePct: -0.31, volume: 28_500_000,  lastUpdated: "" },
  NVDA: { symbol: "NVDA", name: "NVIDIA Corporation",     price: 874.15,   change: 26.70,  changePct: 3.15,  volume: 142_000_000, lastUpdated: "" },
  TSLA: { symbol: "TSLA", name: "Tesla, Inc.",            price: 248.30,   change: 5.98,   changePct: 2.47,  volume: 98_000_000,  lastUpdated: "" },
  AAPL: { symbol: "AAPL", name: "Apple Inc.",             price: 182.68,   change: -0.42,  changePct: -0.23, volume: 67_000_000,  lastUpdated: "" },
  META: { symbol: "META", name: "Meta Platforms, Inc.",   price: 501.42,   change: 9.27,   changePct: 1.88,  volume: 52_000_000,  lastUpdated: "" },
  MSFT: { symbol: "MSFT", name: "Microsoft Corporation",  price: 378.85,   change: 5.32,   changePct: 1.42,  volume: 38_000_000,  lastUpdated: "" },
};

const MOCK_SUGGESTIONS: TickerSuggestion[] = [
  { symbol: "NVDA", name: "NVIDIA Corporation",    type: "stock", exchange: "NASDAQ" },
  { symbol: "SPY",  name: "SPDR S&P 500 ETF",      type: "etf",   exchange: "NYSE"   },
  { symbol: "AAPL", name: "Apple Inc.",             type: "stock", exchange: "NASDAQ" },
  { symbol: "QQQ",  name: "Invesco QQQ Trust",      type: "etf",   exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla, Inc.",            type: "stock", exchange: "NASDAQ" },
  { symbol: "META", name: "Meta Platforms, Inc.",   type: "stock", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corporation",  type: "stock", exchange: "NASDAQ" },
  { symbol: "SPX",  name: "S&P 500 Index",          type: "index", exchange: "CBOE"   },
  { symbol: "VIX",  name: "CBOE Volatility Index",  type: "index", exchange: "CBOE"   },
  { symbol: "BTC",  name: "Bitcoin USD",            type: "crypto",exchange: "CRYPTO" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function quoteToSnapshot(q: Quote): MarketSnapshot {
  const up   = q.changePct >= 0;
  const sign = up ? "+" : "";
  let value: string;
  if (q.symbol === "BTC")  value = q.price.toLocaleString("en-US");
  else if (q.symbol === "10Y") value = `${q.price.toFixed(2)}%`;
  else value = q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { label: q.symbol, value, change: `${sign}${q.changePct.toFixed(2)}%`, up };
}

async function massiveFetch<T>(path: string): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${MASSIVE_BASE}${path}${separator}apiKey=${MASSIVE_API_KEY}`);
  if (!res.ok) throw new Error(`Massive API error: ${res.status}`);
  return res.json();
}

/** Derive sentiment from headline keywords — avoids a dedicated sentiment endpoint */
function deriveSentiment(headline: string): "positive" | "negative" | "mixed" {
  const h = headline.toLowerCase();
  const neg = ["fall", "slide", "drop", "decline", "loss", "risk", "warn", "concern",
               "cut", "miss", "weak", "pressur", "downturn", "dissent", "sticky"];
  const pos = ["surge", "rally", "rise", "beat", "jump", "soar", "gain", "outperform",
               "surpass", "accelerat", "record", "strong", "unlock"];
  const nScore = neg.filter(w => h.includes(w)).length;
  const pScore = pos.filter(w => h.includes(w)).length;
  if (pScore > nScore) return "positive";
  if (nScore > pScore) return "negative";
  return "mixed";
}

// ─── Market data API ──────────────────────────────────────────────────────────

// Response shapes from Massive.com REST API
interface MassiveSnapshotTicker {
  ticker:           string;
  todaysChange:     number;
  todaysChangePerc: number;
  updated:          number;
  day?:  { o: number; h: number; l: number; c: number; v: number; vw: number };
  prevDay?: { c: number };
}
interface MassiveSnapshotResponse {
  status:  string;
  tickers: MassiveSnapshotTicker[];
}
interface MassiveTickerResult {
  ticker:           string;
  name:             string;
  type:             string;
  primary_exchange: string;
}
interface MassiveSearchResponse {
  status:  string;
  results: MassiveTickerResult[];
}

function massiveTypeToLocal(t: string): TickerSuggestion["type"] {
  const upper = t.toUpperCase();
  if (upper === "ETF")   return "etf";
  if (upper === "INDEX") return "index";
  if (upper === "CRYPTO" || upper === "X") return "crypto";
  return "stock"; // CS, ADRC, etc.
}

export async function getMarketSnapshot(symbols: string[]): Promise<MarketSnapshot[]> {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/quotes/?symbols=${symbols.join(",")}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { quotes: Record<string, { price: number; changePct: number; change: number }> } = await res.json();

    return symbols.map(sym => {
      const q = data.quotes[sym];
      if (!q || !q.price) {
        const mock = MOCK_QUOTES[sym];
        return mock ? quoteToSnapshot(mock) : { label: sym, value: "—", change: "—", up: true };
      }
      return quoteToSnapshot({
        symbol: sym, name: MOCK_QUOTES[sym]?.name ?? sym,
        price: q.price, change: q.change, changePct: q.changePct,
        volume: 0, lastUpdated: "",
      });
    });
  } catch {
    return symbols.map(sym => {
      const q = MOCK_QUOTES[sym];
      return q ? quoteToSnapshot(q) : { label: sym, value: "—", change: "—", up: true };
    });
  }
}

export async function searchTickers(query: string): Promise<TickerSuggestion[]> {
  try {
    const res = await fetch(
      `${BACKEND_BASE}/api/search/?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { results: TickerSuggestion[] } = await res.json();
    return data.results ?? [];
  } catch {
    // Fallback to local filter if backend is down
    const q = query.toLowerCase();
    return MOCK_SUGGESTIONS
      .filter(s => s.symbol.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }
}

// ─── News API (Django backend) ─────────────────────────────────────────────────

const FALLBACK_NEWS: NewsArticle[] = [
  { id: 1, headline: "Fed signals patience on rate cuts as inflation data remains sticky",
    source: "Reuters",  time: "14m ago", sentiment: "negative", sentimentScore: null, tickers: ["SPY","TLT"], url: "#" },
  { id: 2, headline: "NVIDIA surpasses $3T market cap on sustained data center demand",
    source: "Bloomberg",time: "31m ago", sentiment: "positive", sentimentScore: null, tickers: ["NVDA"],       url: "#" },
  { id: 3, headline: "Apple explores AI partnerships to accelerate on-device model capabilities",
    source: "WSJ",      time: "52m ago", sentiment: "positive", sentimentScore: null, tickers: ["AAPL"],       url: "#" },
  { id: 4, headline: "Oil futures slide as OPEC+ production agreement faces internal dissent",
    source: "FT",       time: "1h ago",  sentiment: "negative", sentimentScore: null, tickers: ["USO","XOM"],  url: "#" },
  { id: 5, headline: "Treasury yield curve steepens ahead of next week's auction schedule",
    source: "Reuters",  time: "1h ago",  sentiment: "mixed",    sentimentScore: null, tickers: ["TLT","IEF"],  url: "#" },
  { id: 6, headline: "Microsoft Azure revenue growth re-accelerates, beating analyst estimates",
    source: "Bloomberg",time: "2h ago",  sentiment: "positive", sentimentScore: null, tickers: ["MSFT"],       url: "#" },
  { id: 7, headline: "Regional bank index diverges from broader financials on deposit flow data",
    source: "FT",       time: "2h ago",  sentiment: "mixed",    sentimentScore: null, tickers: ["KRE","XLF"],  url: "#" },
];

export async function getNews(): Promise<NewsResponse> {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/news/`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Natasha's backend returns { articles, quotes, topStocks, topSignals }
    const rawArticles: Array<{
      id: number | string; headline: string; source: string;
      time: string; tickers: string[]; url: string; image?: string; summary?: string;
      sentiment?: number;
    }> = data.articles || data;

    const articles: NewsArticle[] = rawArticles.map(a => ({
      ...a,
      sentimentScore: typeof a.sentiment === "number" ? a.sentiment : null,
      sentiment: typeof a.sentiment === "number"
        ? (a.sentiment > 0 ? "positive" : a.sentiment < 0 ? "negative" : "mixed")
        : deriveSentiment(a.headline),
    }));

    return {
      articles,
      fromBackend: true,
      quotes: data.quotes || {},
      topStocks: data.topStocks || [],
      topSignals: data.topSignals || [],
    };
  } catch {
    return { articles: FALLBACK_NEWS, fromBackend: false, quotes: {}, topStocks: [], topSignals: [] };
  }
}

// ─── 24-hour bar data (for sparklines) ───────────────────────────────────────

export interface BarPoint { t: number; c: number; }

const FLAT_LINE: BarPoint[] = Array.from({ length: 16 }, (_, i) => ({ t: i, c: 0 }));

export async function getTicker24hBars(symbol: string): Promise<BarPoint[]> {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/bars/?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { bars: BarPoint[] } = await res.json();
    return data.bars.length > 0 ? data.bars : FLAT_LINE;
  } catch {
    return FLAT_LINE;
  }
}

export { MOCK_QUOTES, MOCK_SUGGESTIONS };
