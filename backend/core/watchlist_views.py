from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Watchlist, WatchlistItem


def _get_or_create_default(user):
    watchlist, _ = Watchlist.objects.get_or_create(user=user, name="default")
    return watchlist


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_watchlist(request):
    watchlist = _get_or_create_default(request.user)
    symbols = list(watchlist.items.order_by("position", "added_at").values_list("symbol", flat=True))
    return Response({"symbols": symbols})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_item(request):
    symbol = (request.data.get("symbol") or "").strip().upper()
    if not symbol:
        return Response({"error": "symbol required"}, status=status.HTTP_400_BAD_REQUEST)

    watchlist = _get_or_create_default(request.user)
    with transaction.atomic():
        existing = watchlist.items.filter(symbol=symbol).first()
        if existing:
            return Response({"symbol": symbol, "position": existing.position}, status=status.HTTP_200_OK)
        next_pos = (watchlist.items.order_by("-position").values_list("position", flat=True).first() or 0) + 1
        WatchlistItem.objects.create(watchlist=watchlist, symbol=symbol, position=next_pos)
    return Response({"symbol": symbol, "position": next_pos}, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def remove_item(request, symbol):
    watchlist = _get_or_create_default(request.user)
    deleted, _ = watchlist.items.filter(symbol=symbol.upper()).delete()
    if not deleted:
        return Response({"error": "not in watchlist"}, status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def reorder(request):
    symbols = request.data.get("symbols")
    if not isinstance(symbols, list):
        return Response({"error": "symbols must be a list"}, status=status.HTTP_400_BAD_REQUEST)

    watchlist = _get_or_create_default(request.user)
    normalized = [s.strip().upper() for s in symbols if isinstance(s, str) and s.strip()]
    items_by_symbol = {item.symbol: item for item in watchlist.items.all()}

    with transaction.atomic():
        for idx, sym in enumerate(normalized, start=1):
            item = items_by_symbol.get(sym)
            if item and item.position != idx:
                item.position = idx
                item.save(update_fields=["position"])
    return Response({"symbols": normalized})
