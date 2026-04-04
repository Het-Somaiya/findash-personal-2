"""
GPT-based ticker extraction for news headlines.

Sends all headlines to GPT in a single batch call, asking it to identify
the top 4 impacted stock tickers per headline with impact scores.
Validates returned tickers against Finnhub to filter out hallucinated symbols.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor

import requests
from openai import AzureOpenAI
from django.conf import settings

logger = logging.getLogger(__name__)

# Cache of verified real tickers to avoid repeated Finnhub lookups
_verified_tickers: dict[str, bool] = {}


def _is_real_ticker(symbol: str, api_key: str) -> bool:
    """Check if a ticker symbol exists on Finnhub."""
    if symbol in _verified_tickers:
        return _verified_tickers[symbol]
    try:
        resp = requests.get(
            'https://finnhub.io/api/v1/stock/profile2',
            params={'symbol': symbol, 'token': api_key},
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        exists = bool(data.get('name'))
        _verified_tickers[symbol] = exists
        return exists
    except Exception:
        # If lookup fails, give benefit of the doubt
        return True


def extract_tickers_batch(articles, api_key=None):
    """
    Send all article headlines to GPT and get back tickers + impact scores
    for each headline. Validates tickers against Finnhub.

    Returns a list of ticker lists (one per article) and stores impact scores
    for future use.
    """
    headlines = [a.get('headline', '') for a in articles]

    if not headlines:
        return []

    azure_key = settings.AZURE_OPENAI_API_KEY
    azure_endpoint = settings.AZURE_OPENAI_ENDPOINT
    azure_deployment = settings.AZURE_OPENAI_DEPLOYMENT
    if not azure_key or not azure_endpoint:
        logger.error('Azure OpenAI not configured')
        return [[] for _ in articles]

    finnhub_key = api_key or settings.FINNHUB_API_KEY

    # Build numbered headline list for the prompt
    headline_list = '\n'.join(
        f'{i + 1}. {h}' for i, h in enumerate(headlines)
    )

    prompt = (
        'You are a financial analyst. For each headline below, identify '
        'real US-listed stocks (NYSE, NASDAQ, AMEX) that would be impacted.\n\n'
        'RULES:\n'
        '- Return ONLY real US stock ticker symbols. Every ticker you return '
        'must be a genuine publicly traded company.\n'
        '- Think broadly: include companies directly mentioned AND companies '
        'whose business would be significantly affected (e.g. a headline about '
        '"oil prices rising" should include XOM, CVX, etc.).\n'
        '- Do NOT hallucinate tickers. Do NOT use country names, people\'s names, '
        'state abbreviations, or made-up symbols as tickers.\n'
        '- Return up to 4 tickers per headline. If no real stock is impacted, '
        'return an empty tickers array.\n'
        '- Provide a sentiment score from -10 to +10 for each headline.\n'
        '- Provide an impact score from -10 to +10 for each ticker.\n\n'
        f'Headlines:\n{headline_list}\n\n'
        'Return ONLY valid JSON in this exact format, no other text:\n'
        '[\n'
        '  {\n'
        '    "headline_index": 1,\n'
        '    "sentiment": 5,\n'
        '    "tickers": [\n'
        '      {"ticker": "AAPL", "impact_score": 7},\n'
        '      {"ticker": "MSFT", "impact_score": -3}\n'
        '    ]\n'
        '  }\n'
        ']\n'
    )

    try:
        client = AzureOpenAI(
            api_key=azure_key,
            azure_endpoint=azure_endpoint,
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )
        response = client.chat.completions.create(
            model=azure_deployment,
            messages=[
                {'role': 'system', 'content': 'You are a financial analyst. Respond only with valid JSON.'},
                {'role': 'user', 'content': prompt},
            ],
            temperature=0.2,
        )

        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
            if raw.endswith('```'):
                raw = raw[:-3]
            raw = raw.strip()

        data = json.loads(raw)

        # Collect all unique tickers from GPT response
        all_tickers = set()
        for entry in data:
            for t in entry.get('tickers', []):
                sym = t.get('ticker', '').upper()
                if sym:
                    all_tickers.add(sym)

        # Validate tickers against Finnhub in parallel
        valid_tickers = set()
        if all_tickers and finnhub_key:
            with ThreadPoolExecutor(max_workers=10) as pool:
                futures = {sym: pool.submit(_is_real_ticker, sym, finnhub_key) for sym in all_tickers}
                for sym, fut in futures.items():
                    if fut.result():
                        valid_tickers.add(sym)
        else:
            valid_tickers = all_tickers

        # Build a map from headline index to ticker + sentiment data (only valid tickers)
        result_map = {}
        for entry in data:
            idx = entry.get('headline_index', 0) - 1  # convert to 0-based
            tickers_data = [
                t for t in entry.get('tickers', [])
                if t.get('ticker', '').upper() in valid_tickers
            ]
            result_map[idx] = {
                'tickers': [t['ticker'].upper() for t in tickers_data][:4],
                'ticker_impacts': {t['ticker'].upper(): t.get('impact_score', 0) for t in tickers_data},
                'sentiment': entry.get('sentiment', 0),
            }

        results = []
        for i in range(len(articles)):
            results.append(result_map.get(i, {'tickers': [], 'ticker_impacts': {}, 'sentiment': 0}))
        return results

    except json.JSONDecodeError as e:
        logger.error('Failed to parse GPT response as JSON: %s', e)
        return [{'tickers': [], 'ticker_impacts': {}, 'sentiment': 0} for _ in articles]
    except Exception as e:
        logger.error('GPT ticker extraction failed: %s', e)
        return [{'tickers': [], 'ticker_impacts': {}, 'sentiment': 0} for _ in articles]
