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


@api_view(['GET'])
def market_news(request):
    api_key = settings.FINNHUB_API_KEY
    if not api_key:
        return Response({'error': 'FINNHUB_API_KEY not configured'}, status=500)

    # Return cached response if fresh
    with _cache_lock:
        if _cache['data'] and (time.time() - _cache['fetched_at']) < CACHE_TTL:
            return Response(_cache['data'])

    # Fetch news categories in parallel
    with ThreadPoolExecutor(max_workers=len(CATEGORIES)) as pool:
        futures = [pool.submit(_fetch_category, api_key, cat) for cat in CATEGORIES]
        all_items = []
        for f in futures:
            all_items.extend(f.result())

    # Filter quality
    all_items = [item for item in all_items if _is_quality_article(item)]

    # Deduplicate by headline
    seen = set()
    unique = []
    for item in all_items:
        key = item.get('headline', '').lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(item)

    # Sort by most recent first
    unique.sort(key=lambda x: x.get('datetime', 0), reverse=True)

    # Diversify: limit per source
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

    # Extract tickers in batch (fetches full articles in parallel)
    ticker_lists = extract_tickers_batch(diversified, api_key)

    # Format response
    articles = []
    for item, tickers in zip(diversified, ticker_lists):
        articles.append({
            'id': item.get('id'),
            'headline': _clean_headline(item.get('headline', '')),
            'source': item.get('source', ''),
            'time': _relative_time(item.get('datetime', 0)),
            'tickers': tickers,
            'url': item.get('url', ''),
            'image': item.get('image', ''),
            'summary': item.get('summary', ''),
        })

    # Cache the response
    with _cache_lock:
        _cache['data'] = articles
        _cache['fetched_at'] = time.time()

    return Response(articles)
