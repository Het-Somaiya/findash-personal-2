"""
Chat endpoint powered by Azure OpenAI GPT-4.

Maintains per-request conversation history sent from the frontend
and returns the assistant's reply.
"""

import logging

from openai import AzureOpenAI
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are FinDash AI, a knowledgeable financial markets assistant embedded in "
    "the FinDash platform. You help users understand options, market structure, "
    "tickers, and platform features.\n\n"
    "Guidelines:\n"
    "- Be concise and informative.\n"
    "- When discussing specific securities, always end with: "
    "'This is not financial advice.'\n"
    "- You can explain concepts like GEX, IV percentile, VIX, options strategies, "
    "SEC filings, and the FinDash 3D options surface.\n"
    "- If asked about something outside finance or the platform, politely redirect.\n"
)


def _get_client():
    return AzureOpenAI(
        api_key=settings.AZURE_OPENAI_API_KEY,
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        api_version=settings.AZURE_OPENAI_API_VERSION,
    )


@api_view(['POST'])
def chat(request):
    if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
        return Response({'error': 'Azure OpenAI not configured'}, status=500)

    user_message = request.data.get('message', '').strip()
    history = request.data.get('history', [])

    if not user_message:
        return Response({'error': 'message is required'}, status=400)

    # Build messages array for GPT
    messages = [{'role': 'system', 'content': SYSTEM_PROMPT}]

    # Add conversation history (only user/assistant roles)
    for msg in history[-20:]:  # limit to last 20 messages
        role = msg.get('role')
        content = msg.get('content', '')
        if role in ('user', 'assistant') and content:
            messages.append({'role': role, 'content': content})

    messages.append({'role': 'user', 'content': user_message})

    try:
        client = _get_client()
        response = client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=messages,
            temperature=0.7,
            max_tokens=512,
        )
        reply = response.choices[0].message.content.strip()
        return Response({'reply': reply})

    except Exception as e:
        logger.error('Chat completion failed: %s', e)
        return Response({'error': 'Failed to get response from AI'}, status=502)
