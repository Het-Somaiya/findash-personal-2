"""
GPT-based ticker extraction for news headlines.

Sends all headlines to GPT in a single batch call, asking it to identify
the top 4 impacted stock tickers per headline with impact scores.
"""

import json
import logging

from openai import AzureOpenAI
from django.conf import settings

logger = logging.getLogger(__name__)


def extract_tickers_batch(articles, _api_key=None):
    """
    Send all article headlines to GPT and get back tickers + impact scores
    for each headline.

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

    # Build numbered headline list for the prompt
    headline_list = '\n'.join(
        f'{i + 1}. {h}' for i, h in enumerate(headlines)
    )

    prompt = (
        'You are a financial analyst. Please evaluate all the headlines below '
        'and give me an impact score on 4 stocks that are impacted by each '
        'headline. List the stock tickers and then put the associated impact '
        'score (a score from negative 10 to positive 10, 10 being the most '
        'impacted) next to each ticker.\n\n'
        'Structure this in a JSON format. I just want the stock tickers and '
        'the impact scores for each headline.\n\n'
        f'Headlines:\n{headline_list}\n\n'
        'Return ONLY valid JSON in this exact format, no other text:\n'
        '[\n'
        '  {\n'
        '    "headline_index": 1,\n'
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

        # Build a map from headline index to ticker data
        ticker_map = {}
        for entry in data:
            idx = entry.get('headline_index', 0) - 1  # convert to 0-based
            tickers_data = entry.get('tickers', [])
            ticker_map[idx] = [t.get('ticker', '') for t in tickers_data if t.get('ticker')]

        # Return ticker lists in article order
        results = []
        for i in range(len(articles)):
            results.append(ticker_map.get(i, []))
        return results

    except json.JSONDecodeError as e:
        logger.error('Failed to parse GPT response as JSON: %s', e)
        return [[] for _ in articles]
    except Exception as e:
        logger.error('GPT ticker extraction failed: %s', e)
        return [[] for _ in articles]
