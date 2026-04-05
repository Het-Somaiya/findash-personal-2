import html
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import requests
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.ticker_resolver import extract_tickers_batch

CATEGORIES = ['general', 'forex', 'merger']
MAX_PER_SOURCE = 3
TOTAL_ARTICLES = 10

# Major tickers to fetch company-specific news for
COMPANY_NEWS_TICKERS = [
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA',
    'JPM', 'GS', 'BAC', 'XOM', 'CVX', 'JNJ', 'UNH', 'LLY',
    'BA', 'CAT', 'RTX', 'DIS', 'NFLX', 'AMD', 'AVGO', 'CRM',
]
CACHE_TTL = 300  # 5 minutes

_cache_lock = threading.Lock()
_cache = {
    'data': None,
    'fetched_at': 0,
}

HEADLINE_BLOCKLIST = [
    'form 8', 'form 4', 'form 3', 'subscription update', 'filing',
    'schedule 13', '8-k', '10-q', '10-k',
]


def _is_quality_article(item):
    headline = item.get('headline', '').lower()
    if len(headline) < 20:
        return False
    return not any(term in headline for term in HEADLINE_BLOCKLIST)


def _fetch_category(api_key, category):
    try:
        resp = requests.get(
            'https://finnhub.io/api/v1/news',
            params={'category': category, 'token': api_key},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException:
        return []


def _fetch_company_news(api_key, symbol):
    """Fetch recent news for a specific company from Finnhub."""
    try:
        today = date.today()
        from_date = (today - timedelta(days=2)).isoformat()
        resp = requests.get(
            'https://finnhub.io/api/v1/company-news',
            params={
                'symbol': symbol,
                'from': from_date,
                'to': today.isoformat(),
                'token': api_key,
            },
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json()
        # Tag each item with the ticker it came from
        for item in items:
            if '_tickers' not in item:
                item['_tickers'] = []
            item['_tickers'].append(symbol)
        return items
    except requests.RequestException:
        return []


def _relative_time(timestamp):
    diff = time.time() - timestamp
    if diff < 60:
        return 'just now'
    if diff < 3600:
        return f'{int(diff // 60)}m ago'
    if diff < 86400:
        hours = diff / 3600
        if hours < 6:
            minutes = int(diff % 3600 // 60)
            if minutes >= 30:
                return f'{int(hours)}h {minutes}m ago'
            return f'{int(hours)}h ago'
        return f'{int(hours)}h ago'
    return f'{int(diff // 86400)}d ago'


def _clean_headline(headline):
    headline = html.unescape(headline)
    for sep in [' – ', ' - ']:
        if sep in headline:
            parts = headline.rsplit(sep, 1)
            suffix = parts[-1].strip()
            if len(suffix) < 30 and len(suffix.split()) <= 3:
                headline = parts[0].strip()
    return headline


def _fetch_quote(api_key, symbol):
    """Fetch a single stock quote from Finnhub."""
    try:
        resp = requests.get(
            'https://finnhub.io/api/v1/quote',
            params={'symbol': symbol, 'token': api_key},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            'symbol': symbol,
            'price': data.get('c', 0),
            'change': data.get('d', 0),
            'changePercent': data.get('dp', 0),
        }
    except requests.RequestException:
        return {'symbol': symbol, 'price': 0, 'change': 0, 'changePercent': 0}


def _fetch_news():
    """Fetch company-specific news from Finnhub, score sentiment via Azure OpenAI, and cache."""
    api_key = settings.FINNHUB_API_KEY
    if not api_key:
        return

    # Fetch company news for major tickers in parallel
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            sym: pool.submit(_fetch_company_news, api_key, sym)
            for sym in COMPANY_NEWS_TICKERS
        }
        # Merge results, grouping tickers by headline
        headline_map = {}  # headline_key -> item (with _tickers merged)
        for sym, fut in futures.items():
            for item in fut.result():
                key = item.get('headline', '').lower().strip()
                if not key or not _is_quality_article(item):
                    continue
                if key in headline_map:
                    # Merge ticker into existing item
                    existing = headline_map[key]
                    if sym not in existing.get('_tickers', []):
                        existing['_tickers'].append(sym)
                else:
                    item['_tickers'] = [sym]
                    headline_map[key] = item

    all_items = list(headline_map.values())
    all_items.sort(key=lambda x: x.get('datetime', 0), reverse=True)

    # Diversify by source
    source_count = {}
    diversified = []
    for item in all_items:
        source = item.get('source', 'Unknown')
        count = source_count.get(source, 0)
        if count < MAX_PER_SOURCE:
            diversified.append(item)
            source_count[source] = count + 1
        if len(diversified) >= TOTAL_ARTICLES:
            break

    # Use GPT for sentiment scoring AND additional ticker extraction
    gpt_results = extract_tickers_batch(diversified, api_key)

    # Build articles: merge company news tickers with GPT-extracted tickers
    from collections import defaultdict
    impact_totals = defaultdict(float)

    articles = []
    all_tickers = set()
    for item, result in zip(diversified, gpt_results):
        # Start with known tickers from company news source
        known_tickers = item.get('_tickers', [])
        # Add GPT-extracted tickers (already validated against Finnhub)
        gpt_tickers = result.get('tickers', [])
        # Merge: known first, then GPT extras (deduplicated), cap at 4
        merged = list(dict.fromkeys(known_tickers + gpt_tickers))[:4]
        if not merged:
            continue
        all_tickers.update(merged)
        for t in merged:
            impact_totals[t] += abs(result.get('sentiment', 0))
        articles.append({
            'id': item.get('id'),
            'headline': _clean_headline(item.get('headline', '')),
            'source': item.get('source', ''),
            'time': _relative_time(item.get('datetime', 0)),
            'tickers': merged,
            'sentiment': result.get('sentiment', 0),
            'url': item.get('url', ''),
            'image': item.get('image', ''),
            'summary': item.get('summary', ''),
        })

    top_stocks = sorted(impact_totals, key=lambda t: impact_totals[t], reverse=True)[:4]

    # Fetch quotes for all tickers
    quotes = {}
    if all_tickers:
        with ThreadPoolExecutor(max_workers=10) as pool:
            quote_futures = {
                sym: pool.submit(_fetch_quote, api_key, sym)
                for sym in all_tickers
            }
            for sym, fut in quote_futures.items():
                quotes[sym] = fut.result()

    # Build top 3 sentiment signals — most extreme headlines
    signals = []
    for i, (item, result) in enumerate(zip(diversified, gpt_results)):
        top_ticker = result['tickers'][0] if result['tickers'] else None
        max_ticker_impact = max(
            (abs(s) for s in result['ticker_impacts'].values()), default=0
        )
        if top_ticker:
            signals.append({
                'ticker': top_ticker,
                'sentiment': result['sentiment'],
                'type': 'BULLISH' if result['sentiment'] > 0 else 'BEARISH',
                'headline': _clean_headline(item.get('headline', '')),
                'abs_sentiment': abs(result['sentiment']),
                'max_impact': max_ticker_impact,
                'datetime': item.get('datetime', 0),
            })

    signals.sort(key=lambda s: (s['abs_sentiment'], s['max_impact'], s['datetime']), reverse=True)
    top_signals = [
        {
            'ticker': s['ticker'],
            'type': s['type'],
            'sentiment': s['sentiment'],
            'headline': s['headline'],
        }
        for s in signals[:3]
    ]

    with _cache_lock:
        _cache['data'] = {
            'articles': articles,
            'quotes': quotes,
            'topStocks': top_stocks,
            'topSignals': top_signals,
        }
        _cache['fetched_at'] = time.time()


def _background_refresh():
    """Periodically refresh the cache in the background."""
    while True:
        try:
            _fetch_news()
        except Exception:
            pass
        time.sleep(CACHE_TTL)


# Start background refresh thread on module load
_refresh_thread = threading.Thread(target=_background_refresh, daemon=True)
_refresh_thread.start()


# Display symbol → Finnhub symbol for indices/crypto that differ
_SYMBOL_MAP = {
    'SPX':  '^GSPC',
    'NDX':  '^NDX',
    'VIX':  '^VIX',
    'DXY':  'DX-Y.NYB',
    'BTC':  'BINANCE:BTCUSDT',
    '10Y':  '^TNX',
}


@api_view(['GET'])
def stock_quotes(request):
    """Return current quotes for a comma-separated list of display symbols via Finnhub."""
    raw = request.query_params.get('symbols', '')
    symbols = [s.strip().upper() for s in raw.split(',') if s.strip()]
    if not symbols:
        return Response({'error': 'symbols parameter required'}, status=400)

    api_key = settings.FINNHUB_API_KEY
    if not api_key:
        return Response({'error': 'FINNHUB_API_KEY not configured'}, status=500)

    def fetch_one(display_sym):
        finnhub_sym = _SYMBOL_MAP.get(display_sym, display_sym)
        try:
            resp = requests.get(
                'https://finnhub.io/api/v1/quote',
                params={'symbol': finnhub_sym, 'token': api_key},
                timeout=5,
            )
            resp.raise_for_status()
            d = resp.json()
            return display_sym, {'price': d.get('c', 0), 'changePct': d.get('dp', 0), 'change': d.get('d', 0)}
        except requests.RequestException:
            return display_sym, None

    quotes = {}
    with ThreadPoolExecutor(max_workers=len(symbols)) as pool:
        for sym, data in pool.map(fetch_one, symbols):
            if data:
                quotes[sym] = data

    return Response({'quotes': quotes})


def _fmt_volume(v):
    if not v:
        return "—"
    if v >= 1_000_000_000:
        return f"{v / 1_000_000_000:.1f}B"
    if v >= 1_000_000:
        return f"{v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{v / 1_000:.1f}K"
    return str(int(v))


def _fmt_market_cap(mc_millions):
    if not mc_millions:
        return "—"
    if mc_millions >= 1_000_000:
        return f"${mc_millions / 1_000_000:.2f}T"
    if mc_millions >= 1_000:
        return f"${mc_millions / 1_000:.1f}B"
    return f"${mc_millions:.0f}M"


@api_view(['GET'])
def stock_asset(request):
    """Return a full AssetData payload for a symbol using Finnhub quote + profile + metrics."""
    symbol = request.query_params.get('symbol', '').upper()
    if not symbol:
        return Response({'error': 'symbol parameter required'}, status=400)

    api_key = settings.FINNHUB_API_KEY
    if not api_key:
        return Response({'error': 'FINNHUB_API_KEY not configured'}, status=500)

    def fetch_quote():
        return requests.get('https://finnhub.io/api/v1/quote',
                            params={'symbol': symbol, 'token': api_key}, timeout=5).json()

    def fetch_profile():
        return requests.get('https://finnhub.io/api/v1/stock/profile2',
                            params={'symbol': symbol, 'token': api_key}, timeout=5).json()

    def fetch_metrics():
        return requests.get('https://finnhub.io/api/v1/stock/metric',
                            params={'symbol': symbol, 'metric': 'all', 'token': api_key}, timeout=5).json()

    try:
        with ThreadPoolExecutor(max_workers=3) as pool:
            qf = pool.submit(fetch_quote)
            pf = pool.submit(fetch_profile)
            mf = pool.submit(fetch_metrics)
            quote   = qf.result()
            profile = pf.result()
            metrics = mf.result().get('metric', {})
    except requests.RequestException as e:
        return Response({'error': str(e)}, status=502)

    price      = quote.get('c') or 0
    change     = quote.get('d') or 0
    change_pct = quote.get('dp') or 0
    volume     = quote.get('v') or 0

    w52_high = metrics.get('52WeekHigh') or price
    w52_low  = metrics.get('52WeekLow')  or price
    w52_pos  = int((price - w52_low) / (w52_high - w52_low) * 100) if w52_high > w52_low else 50

    pe      = metrics.get('peAnnual')
    fwd_pe  = metrics.get('peFwd')
    beta    = metrics.get('beta') or 1.0
    eps     = metrics.get('epsAnnualTTM') or metrics.get('epsBasicExclExtraAnnual')
    div_yld = metrics.get('dividendYieldIndicatedAnnual')
    rev_grow = metrics.get('revenueGrowthTTMYoy')
    if rev_grow is not None:
        rev_grow = round(rev_grow, 1)

    return Response({
        'ticker':               symbol,
        'name':                 profile.get('name') or symbol,
        'type':                 'CRYPTO' if profile.get('finnhubIndustry') == 'Digital Assets'
                                else 'ETF' if 'ETF' in (profile.get('name') or '') else 'STOCK',
        'sector':               profile.get('finnhubIndustry') or '—',
        'price':                price,
        'change':               change,
        'changePct':            change_pct,
        'up':                   change_pct >= 0,
        'volume':               _fmt_volume(volume),
        'avgVolume':            '—',
        'volRatio':             1.0,
        'marketCap':            _fmt_market_cap(profile.get('marketCapitalization')),
        'pe':                   round(pe, 1) if pe else None,
        'forwardPe':            round(fwd_pe, 1) if fwd_pe else None,
        'peg':                  None,
        'eps':                  round(eps, 2) if eps else None,
        'revenueGrowth':        rev_grow,
        'revenueGrowthQoQ':     None,
        'week52High':           w52_high,
        'week52Low':            w52_low,
        'week52Pos':            w52_pos,
        'nextEarnings':         None,
        'rsi':                  50,
        'beta':                 round(beta, 2),
        'shortFloatPct':        None,
        'daysToCover':          None,
        'institutionalOwnership': 0,
        'insiderActivity':      'neutral',
        'insiderNet':           0,
        'dividendYield':        round(div_yld, 2) if div_yld else None,
        'freeCashFlow':         None,
        'description':          profile.get('description') or '',
        'chartSeed':            abs(hash(symbol)) % 1000,
        'chartTrend':           1 if change_pct >= 0 else -1,
    })


# Yahoo Finance symbol overrides for indices/crypto
_YF_SYMBOL_MAP = {
    'SPX': '^GSPC', 'NDX': '^NDX', 'VIX': '^VIX',
    'DXY': 'DX-Y.NYB', 'BTC': 'BTC-USD', '10Y': '^TNX',
}

@api_view(['GET'])
def stock_bars(request):
    """Return 30-min bars for the last 24 h for a given symbol via Yahoo Finance."""
    symbol = request.query_params.get('symbol', '').upper()
    if not symbol:
        return Response({'error': 'symbol parameter required'}, status=400)

    yf_symbol = _YF_SYMBOL_MAP.get(symbol, symbol)

    try:
        resp = requests.get(
            f'https://query1.finance.yahoo.com/v8/finance/chart/{yf_symbol}',
            params={'interval': '30m', 'range': '1d'},
            headers={'User-Agent': 'Mozilla/5.0'},
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return Response({'bars': []})

    try:
        result     = data['chart']['result'][0]
        timestamps = result['timestamp']
        closes     = result['indicators']['quote'][0]['close']
        bars = [
            {'t': t * 1000, 'c': round(c, 4)}
            for t, c in zip(timestamps, closes)
            if c is not None
        ]
    except (KeyError, IndexError, TypeError):
        return Response({'bars': []})

    return Response({'bars': bars})


# ─── Market Overview (bubble graph) ──────────────────────────────────────────

MARKET_OVERVIEW_TICKERS = [
    # Mag 7
    "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA",
    # Technology
    "AVGO", "ORCL", "AMD", "INTC", "QCOM", "TXN", "AMAT", "MU", "ADBE", "CRM", "NOW",
    # Consumer Discretionary
    "BRK-B", "HD", "SBUX", "NKE", "MCD", "BKNG",
    # Healthcare
    "JNJ", "UNH", "LLY", "ABBV", "PFE", "MRK", "TMO",
    # Financials
    "JPM", "GS", "V", "MA", "BAC", "WFC", "MS",
    # Communication
    "NFLX", "DIS", "T", "VZ",
    # Energy
    "XOM", "CVX", "COP", "SLB",
    # Industrials
    "CAT", "RTX", "BA", "GE", "HON",
    # Consumer Staples
    "WMT", "KO", "PG", "COST", "PM",
    # Utilities
    "NEE", "DUK",
    # Real Estate
    "AMT", "PLD",
    # ETFs / indices / crypto from ticker tape
    "SPY", "QQQ", "GLD", "IWM",
    "SPX", "NDX", "VIX", "DXY", "10Y",
    "BTC", "ETH",
]

# Map display tickers to Finnhub query symbols where they differ
FINNHUB_SYMBOL_MAP = {
    "BTC": "BINANCE:BTCUSDT",
    "ETH": "BINANCE:ETHUSDT",
    "SPX": "^GSPC",
    "NDX": "^NDX",
    "VIX": "^VIX",
    "DXY": "DX-Y.NYB",
    "10Y": "^TNX",
}

LANDING_SECTORS = {
    "AAPL": "Technology",    "MSFT": "Technology",    "NVDA": "Technology",
    "GOOGL": "Technology",   "META": "Technology",     "AMD": "Technology",
    "AVGO": "Technology",    "ORCL": "Technology",
    "INTC": "Technology",    "QCOM": "Technology",     "TXN": "Technology",
    "AMAT": "Technology",    "MU": "Technology",       "ADBE": "Technology",
    "CRM": "Technology",     "NOW": "Technology",
    "TSLA": "Consumer Disc.", "AMZN": "Consumer Disc.", "HD": "Consumer Disc.",
    "SBUX": "Consumer Disc.", "NKE": "Consumer Disc.",  "MCD": "Consumer Disc.",
    "BKNG": "Consumer Disc.",
    "JNJ": "Healthcare",     "UNH": "Healthcare",      "LLY": "Healthcare",
    "ABBV": "Healthcare",    "PFE": "Healthcare",      "MRK": "Healthcare",
    "TMO": "Healthcare",
    "JPM": "Financials",     "GS": "Financials",       "BRK-B": "Financials",
    "V": "Financials",       "MA": "Financials",       "BAC": "Financials",
    "WFC": "Financials",     "MS": "Financials",
    "NFLX": "Communication", "DIS": "Communication",   "T": "Communication",
    "VZ": "Communication",
    "XOM": "Energy",         "CVX": "Energy",          "COP": "Energy",
    "SLB": "Energy",
    "CAT": "Industrials",    "RTX": "Industrials",     "BA": "Industrials",
    "GE": "Industrials",     "HON": "Industrials",
    "WMT": "Consumer Staples", "KO": "Consumer Staples", "PG": "Consumer Staples",
    "COST": "Consumer Staples", "PM": "Consumer Staples",
    "NEE": "Utilities",      "DUK": "Utilities",
    "AMT": "Real Estate",    "PLD": "Real Estate",
    "SPY": "ETF",            "QQQ": "ETF",             "GLD": "ETF",
    "IWM": "ETF",
    "SPX": "Index",          "NDX": "Index",           "VIX": "Index",
    "DXY": "Index",          "10Y": "Index",
    "BTC": "Crypto",         "ETH": "Crypto",
}

# Tickers that don't have earnings or stock metrics (indices, ETFs, crypto)
NON_STOCK_TICKERS = {"SPX", "NDX", "VIX", "DXY", "10Y", "BTC", "ETH", "SPY", "QQQ", "GLD", "IWM"}

_overview_lock    = threading.Lock()
_overview_cache   = {"data": None, "fetched_at": 0}
_overview_refresh = False   # True while a background refresh is running
OVERVIEW_TTL      = 900     # 15 min

# Limit concurrent Finnhub connections (not per-minute — just concurrency)
_finnhub_sem = threading.Semaphore(8)

def _finnhub_get(url, params, timeout=6):
    with _finnhub_sem:
        return requests.get(url, params=params, timeout=timeout)


def _do_overview_fetch():
    """Fetch all ticker data and populate the cache. Runs in a background thread."""
    global _overview_refresh
    api_key = settings.FINNHUB_API_KEY
    if not api_key:
        return
    today = date.today()

    def fetch_ticker(sym):
        try:
            api_sym = FINNHUB_SYMBOL_MAP.get(sym, sym)
            q = _finnhub_get("https://finnhub.io/api/v1/quote",
                             {"symbol": api_sym, "token": api_key}).json()
            is_non_stock = sym in NON_STOCK_TICKERS
            m = {} if is_non_stock else _finnhub_get(
                "https://finnhub.io/api/v1/stock/metric",
                {"symbol": sym, "metric": "all", "token": api_key},
            ).json().get("metric", {})
            days_to_earnings = None
            if not is_non_stock:
                ec = _finnhub_get("https://finnhub.io/api/v1/calendar/earnings",
                                  {"symbol": sym, "token": api_key,
                                   "from": (today - timedelta(days=180)).isoformat(),
                                   "to":   (today + timedelta(days=180)).isoformat()})
                if ec.ok:
                    best = None
                    for entry in ec.json().get("earningsCalendar", []):
                        try:
                            d = (date.fromisoformat(entry["date"]) - today).days
                            if best is None or abs(d) < abs(best):
                                best = d
                        except (KeyError, ValueError):
                            pass
                    days_to_earnings = best
            return sym, q, m, days_to_earnings
        except Exception:
            return sym, {}, {}, None

    with ThreadPoolExecutor(max_workers=20) as pool:
        ticker_results = list(pool.map(fetch_ticker, MARKET_OVERVIEW_TICKERS))

    sentiment_map: dict = {}
    with _cache_lock:
        if _cache["data"]:
            for sig in _cache["data"].get("topSignals", []):
                sentiment_map[sig["ticker"]] = sig["sentiment"]
            for article in _cache["data"].get("articles", []):
                for ticker in article.get("tickers", []):
                    if ticker not in sentiment_map and isinstance(article.get("sentiment"), (int, float)):
                        sentiment_map[ticker] = article["sentiment"]

    assets = []
    for sym, q, m, days_to_earnings in ticker_results:
        assets.append({
            "ticker":         sym,
            "name":           sym,
            "sector":         LANDING_SECTORS.get(sym, "Other"),
            "price":          q.get("c") or 0,
            "changePct":      round(q.get("dp") or 0, 2),
            "marketCap":      float(m.get("marketCapitalization") or 0),
            "beta":           round(float(m.get("beta") or 1.0), 2),
            "sentimentScore": float(sentiment_map.get(sym, 0)),
            "daysToEarnings": days_to_earnings,
        })

    with _overview_lock:
        _overview_cache["data"] = {"assets": assets}
        _overview_cache["fetched_at"] = time.time()
    _overview_refresh = False


@api_view(['GET'])
def market_overview(request):
    """Return per-asset data for the landing page bubble graph."""
    global _overview_refresh
    if not settings.FINNHUB_API_KEY:
        return Response({"error": "FINNHUB_API_KEY not configured"}, status=500)

    with _overview_lock:
        fresh = _overview_cache["data"] and time.time() - _overview_cache["fetched_at"] < OVERVIEW_TTL

    if not fresh and not _overview_refresh:
        _overview_refresh = True
        threading.Thread(target=_do_overview_fetch, daemon=True).start()

    with _overview_lock:
        cached = _overview_cache["data"]

    return Response(cached if cached else {"assets": [], "loading": True})


@api_view(['GET'])
def market_news(request):
    if not settings.FINNHUB_API_KEY:
        return Response({'error': 'FINNHUB_API_KEY not configured'}, status=500)

    with _cache_lock:
        if _cache['data']:
            return Response(_cache['data'])

    # Cache not ready yet (server just started), fetch now
    _fetch_news()
    return Response(_cache['data'] or {'articles': [], 'quotes': {}})
