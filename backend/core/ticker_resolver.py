"""
Full-article NER pipeline for tagging news with relevant stock tickers.

Pipeline:
  1. Fetch full article text from URL (newspaper3k)
  2. Run spaCy NER to detect ORG/PRODUCT entities
  3. Resolve entity names to ticker symbols (Finnhub /search)
  4. Score relevance (mention frequency + headline bonus)
  5. Return top tickers sorted by relevance
"""

import re
import logging
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import requests
import spacy
from newspaper import Article

logger = logging.getLogger(__name__)

# spaCy model — medium for better NER accuracy
try:
    nlp = spacy.load('en_core_web_md', disable=['parser', 'lemmatizer', 'textcat'])
except OSError:
    try:
        nlp = spacy.load('en_core_web_sm', disable=['parser', 'lemmatizer', 'textcat'])
    except OSError:
        logger.warning('No spaCy model found. Run: python -m spacy download en_core_web_md')
        nlp = None

# ── Caches ──────────────────────────────────────────────────────────────
_ticker_cache = {}      # entity name (lower) -> ticker symbol or None
_article_cache = {}     # url -> extracted article text

# ── Commodity / macro keywords (NER won't tag these as ORG) ─────────────
COMMODITY_MAP = {
    'oil': 'CL=F', 'crude oil': 'CL=F', 'crude': 'CL=F',
    'brent': 'CL=F', 'opec': 'CL=F', 'petroleum': 'CL=F',
    'gold': 'GC=F', 'bullion': 'GC=F',
    'silver': 'SI=F', 'natural gas': 'NG=F', 'copper': 'HG=F',
    'bitcoin': 'BTC-USD', 'ethereum': 'ETH-USD',
    'treasury': 'TLT', 'treasuries': 'TLT',
    'yield curve': 'TLT', 'bond yield': 'TLT',
    'nasdaq': 'QQQ', 's&p 500': 'SPY', 's&p500': 'SPY', 'dow jones': 'DIA',
}

# Entities to ignore (geopolitical, government, generic)
SKIP_ENTITIES = {
    'us', 'u.s.', 'u.s', 'united states', 'america', 'eu', 'uk',
    'china', 'iran', 'russia', 'ukraine', 'india', 'japan', 'germany',
    'france', 'israel', 'saudi arabia', 'canada', 'australia', 'brazil',
    'senate', 'congress', 'pentagon', 'white house', 'supreme court',
    'fed', 'federal reserve', 'ecb', 'imf', 'world bank',
    'sec', 'fbi', 'cia', 'nato', 'un', 'united nations',
    'republicans', 'democrats', 'trump', 'biden',
    'asia', 'europe', 'middle east', 'wall street',
    'reuters', 'bloomberg', 'associated press', 'ap', 'afp',
}

HEADLINE_WEIGHT = 3   # headline mentions count 3x
MAX_TICKERS = 4       # max tickers per article


# ── Step 1: Fetch full article text ─────────────────────────────────────

def _fetch_article_text(url):
    """Download and parse full article text from a URL using newspaper3k."""
    if url in _article_cache:
        return _article_cache[url]

    try:
        article = Article(url)
        article.download()
        article.parse()
        text = article.text or ''
        _article_cache[url] = text
        return text
    except Exception:
        _article_cache[url] = ''
        return ''


# ── Step 2: NER — detect company entities ───────────────────────────────

def _extract_entities(text):
    """Run spaCy NER and return a list of (entity_name, label) tuples."""
    if nlp is None or not text:
        return []

    doc = nlp(text)
    entities = []
    for ent in doc.ents:
        if ent.label_ in ('ORG', 'PRODUCT'):
            name = ent.text.strip()
            if len(name) > 1 and name.lower() not in SKIP_ENTITIES:
                entities.append(name)
    return entities


# ── Step 3: Company → ticker lookup ─────────────────────────────────────

def _search_finnhub(entity_name, api_key):
    """Resolve a company name to a ticker via Finnhub symbol search.
    Only returns a match if the entity name appears in the result description.
    """
    try:
        resp = requests.get(
            'https://finnhub.io/api/v1/search',
            params={'q': entity_name, 'token': api_key},
            timeout=5,
        )
        resp.raise_for_status()
        results = resp.json().get('result', [])
        if not results:
            return None

        entity_lower = entity_name.lower()
        for r in results:
            symbol = r.get('symbol', '')
            desc = r.get('description', '').lower()

            # Skip foreign listings (e.g. 000869.SZ)
            if '.' in symbol and '=' not in symbol and '-' not in symbol:
                continue

            # Require entity name appears in the stock description
            if entity_lower in desc:
                return symbol

        return None
    except requests.RequestException:
        return None


def _resolve_ticker(entity_name, api_key):
    """Resolve entity to ticker with caching."""
    key = entity_name.lower()
    if key in _ticker_cache:
        return _ticker_cache[key]
    ticker = _search_finnhub(entity_name, api_key)
    _ticker_cache[key] = ticker
    return ticker


# ── Step 4 & 5: Relevance scoring + attach tickers ─────────────────────

def extract_tickers(headline, summary, url, api_key):
    """
    Full pipeline: fetch article → NER → ticker lookup → relevance score → top tickers.

    Returns list of ticker strings, e.g. ['NFLX', 'CL=F']
    """
    tickers = []
    seen = set()

    # ── Commodity keywords (checked against all available text) ──
    full_text = _fetch_article_text(url) if url else ''
    all_text = f'{headline}. {summary}. {full_text}'
    all_text_lower = all_text.lower()

    for keyword, ticker in COMMODITY_MAP.items():
        if keyword in all_text_lower and ticker not in seen:
            tickers.append(ticker)
            seen.add(ticker)

    # ── Explicit ticker mentions (e.g. "$AAPL", "(NVDA)") ──
    explicit = re.findall(r'[\$\(]([A-Z]{1,5})[\)\s,]', all_text)
    for sym in explicit:
        if sym not in seen:
            tickers.append(sym)
            seen.add(sym)

    # ── NER on headline, summary, and full article ──
    headline_entities = _extract_entities(headline)
    body_entities = _extract_entities(f'{summary}. {full_text}')

    # ── Relevance scoring: count mentions, weight headline higher ──
    entity_scores = Counter()
    for name in headline_entities:
        entity_scores[name] += HEADLINE_WEIGHT
    for name in body_entities:
        entity_scores[name] += 1

    # ── Resolve top entities to tickers, sorted by score ──
    ranked = entity_scores.most_common()
    for entity_name, _score in ranked:
        ticker = _resolve_ticker(entity_name, api_key)
        if ticker and ticker not in seen:
            tickers.append(ticker)
            seen.add(ticker)
        if len(tickers) >= MAX_TICKERS:
            break

    return tickers


# ── Batch processing (for parallel article fetching) ────────────────────

def extract_tickers_batch(articles, api_key):
    """
    Process a list of articles in parallel.
    Each article dict must have: headline, summary, url.
    Returns a list of ticker lists, one per article.
    """
    # Pre-fetch all articles in parallel
    urls = [a.get('url', '') for a in articles]
    with ThreadPoolExecutor(max_workers=10) as pool:
        pool.map(_fetch_article_text, urls)

    # Now extract tickers (article text is cached)
    results = []
    for a in articles:
        t = extract_tickers(
            a.get('headline', ''),
            a.get('summary', ''),
            a.get('url', ''),
            api_key,
        )
        results.append(t)
    return results
