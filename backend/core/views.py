import html
import time
import threading
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.ticker_resolver import extract_tickers_batch

CATEGORIES = ['general', 'forex', 'merger']
MAX_PER_SOURCE = 3
TOTAL_ARTICLES = 10
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
    """Fetch news from Finnhub, extract tickers via Azure OpenAI, fetch quotes, and cache."""
    api_key = settings.FINNHUB_API_KEY
    if not api_key:
        return

    with ThreadPoolExecutor(max_workers=len(CATEGORIES)) as pool:
        futures = [pool.submit(_fetch_category, api_key, cat) for cat in CATEGORIES]
        all_items = []
        for f in futures:
            all_items.extend(f.result())

    all_items = [item for item in all_items if _is_quality_article(item)]

    seen = set()
    unique = []
    for item in all_items:
        key = item.get('headline', '').lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(item)

    unique.sort(key=lambda x: x.get('datetime', 0), reverse=True)

    source_count = {}
    diversified = []
    for item in unique:
        source = item.get('source', 'Unknown')
        count = source_count.get(source, 0)
        if count < MAX_PER_SOURCE:
            diversified.append(item)
            source_count[source] = count + 1
        if len(diversified) >= TOTAL_ARTICLES:
            break

    gpt_results = extract_tickers_batch(diversified, api_key)

    # Aggregate absolute impact scores across all headlines for top stocks
    from collections import defaultdict
    impact_totals = defaultdict(float)
    for result in gpt_results:
        for ticker, score in result['ticker_impacts'].items():
            impact_totals[ticker] += abs(score)
    top_stocks = sorted(impact_totals, key=lambda t: impact_totals[t], reverse=True)[:4]

    # Collect all unique tickers and fetch quotes in parallel
    all_tickers = set()
    for result in gpt_results:
        all_tickers.update(result['tickers'])

    quotes = {}
    if all_tickers:
        with ThreadPoolExecutor(max_workers=10) as pool:
            quote_futures = {
                sym: pool.submit(_fetch_quote, api_key, sym)
                for sym in all_tickers
            }
            for sym, fut in quote_futures.items():
                quotes[sym] = fut.result()

    articles = []
    for item, result in zip(diversified, gpt_results):
        articles.append({
            'id': item.get('id'),
            'headline': _clean_headline(item.get('headline', '')),
            'source': item.get('source', ''),
            'time': _relative_time(item.get('datetime', 0)),
            'tickers': result['tickers'],
            'sentiment': result['sentiment'],
            'url': item.get('url', ''),
            'image': item.get('image', ''),
            'summary': item.get('summary', ''),
        })

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
