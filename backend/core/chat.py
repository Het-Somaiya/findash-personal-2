"""
Chat endpoint powered by Azure OpenAI GPT-4.

Maintains per-request conversation history sent from the frontend
and returns the assistant's reply.
"""

import logging

from asgiref.sync import async_to_sync
from openai import AzureOpenAI
from django.conf import settings
from neo4j import AsyncGraphDatabase
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .graphrag.intent import IntentClassifier
from .graphrag.llm import AzureChatLLM
from .graphrag.resolver import EntityResolver
from .graphrag.retriever import SubgraphRetriever
from .graphrag.service import ChatService
from .graphrag.synthesizer import Synthesizer
from .graphrag.types import ChatResponse

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


def _answer_with_public_azure(user_message, history):
    # Build messages array for GPT
    messages = [{'role': 'system', 'content': SYSTEM_PROMPT}]

    # Add conversation history (only user/assistant roles)
    for msg in history[-20:]:  # limit to last 20 messages
        role = msg.get('role')
        content = msg.get('content', '')
        if role in ('user', 'assistant') and content:
            messages.append({'role': role, 'content': content})

    messages.append({'role': 'user', 'content': user_message})

    client = _get_client()
    response = client.chat.completions.create(
        model=settings.AZURE_OPENAI_DEPLOYMENT,
        messages=messages,
        temperature=0.7,
        max_tokens=512,
    )
    return response.choices[0].message.content.strip()


async def _answer_with_graphrag(user_message):
    llm = AzureChatLLM()
    driver = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
    )
    try:
        service = ChatService(
            classifier=IntentClassifier(llm),
            resolver=EntityResolver(driver),
            retriever=SubgraphRetriever(driver),
            synthesizer=Synthesizer(llm),
            base_llm=llm,
        )
        return await service.answer(user_message)
    finally:
        await driver.close()


def _serialize_graphrag_response(response: ChatResponse):
    return {
        'reply': response.answer,
        'usedGraph': response.used_graph,
        'fallbackReason': response.fallback_reason,
        'retrievalSummary': {
            'intent': response.retrieval_summary.intent.value,
            'resultsReturned': response.retrieval_summary.results_returned,
            'elapsedMs': response.retrieval_summary.elapsed_ms,
            'notes': response.retrieval_summary.notes,
        },
        'citations': [
            {
                'id': citation.id,
                'ticker': citation.ticker,
                'period': citation.period,
                'accession': citation.accession,
                'section': citation.section,
                'conceptId': citation.concept_id,
                'framing': citation.framing,
                'evidence': citation.evidence,
                'sourceUrl': citation.source_url,
            }
            for citation in response.citations
        ],
    }


@api_view(['POST'])
def chat(request):
    if not settings.AZURE_OPENAI_API_KEY or not settings.AZURE_OPENAI_ENDPOINT:
        return Response({'error': 'Azure OpenAI not configured'}, status=500)

    user_message = request.data.get('message', '').strip()
    history = request.data.get('history', [])

    if not user_message:
        return Response({'error': 'message is required'}, status=400)

    try:
        if (
            settings.FILING_GRAPH_ENABLED
            and request.user
            and request.user.is_authenticated
        ):
            graph_response = async_to_sync(_answer_with_graphrag)(user_message)
            return Response(_serialize_graphrag_response(graph_response))

        reply = _answer_with_public_azure(user_message, history)
        return Response({'reply': reply})

    except Exception as e:
        logger.exception('Chat completion failed: %s', e)
        return Response({'error': 'Failed to get response from AI'}, status=502)
