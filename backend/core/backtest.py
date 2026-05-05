"""Backtest engine: cached daily prices + simple leg simulators."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import requests
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.models import PriceCache

YF_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YF_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _to_date(v) -> date:
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    return date.fromisoformat(str(v)[:10])


def get_prices(symbol: str, start: date, end: date) -> list[tuple[date, float]]:
    """Return [(date, close)] for symbol in [start, end], cache-first.

    Refetches the whole window from yfinance when >5% of business days are missing.
    Bulk-inserts new rows into PriceCache when possible. Degrades gracefully
    to a Yahoo-only fetch when the DB is unreachable (e.g., Azure SQL firewall
    blocking the dev machine), so the backtest still works without a cache.
    """
    symbol = symbol.upper()

    cached: list[tuple[date, float]] = []
    db_ok = True
    try:
        cached = list(
            PriceCache.objects
            .filter(symbol=symbol, date__gte=start, date__lte=end)
            .order_by("date")
            .values_list("date", "close")
        )
    except Exception as e:  # noqa: BLE001
        db_ok = False
        print(f"[backtest] PriceCache read failed, falling back to direct Yahoo fetch: {e}")

    cached_dates = {d for d, _ in cached}

    expected_days = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5:
            expected_days += 1
        cur += timedelta(days=1)

    missing_ratio = 1.0 - (len(cached_dates) / expected_days) if expected_days else 0
    if missing_ratio > 0.05:
        fetched = _fetch_yahoo_daily(symbol, start, end)
        if not db_ok:
            # No DB available — return what Yahoo gave us.
            return [(d, float(c)) for d, c in fetched]
        new_rows = [
            PriceCache(symbol=symbol, date=d, close=c)
            for d, c in fetched if d not in cached_dates
        ]
        if new_rows:
            try:
                PriceCache.objects.bulk_create(new_rows)
            except Exception:
                try:
                    for r in new_rows:
                        PriceCache.objects.update_or_create(
                            symbol=r.symbol, date=r.date,
                            defaults={"close": r.close},
                        )
                except Exception as e:  # noqa: BLE001
                    print(f"[backtest] PriceCache write failed (continuing without cache): {e}")
            try:
                cached = list(
                    PriceCache.objects
                    .filter(symbol=symbol, date__gte=start, date__lte=end)
                    .order_by("date")
                    .values_list("date", "close")
                )
            except Exception:
                # Re-query failed too — return the freshly-fetched data
                return [(d, float(c)) for d, c in fetched]

    return [(d, float(c)) for d, c in cached]


def _fetch_yahoo_daily(symbol: str, start: date, end: date) -> list[tuple[date, float]]:
    """Fetch daily closes from Yahoo's v8/chart endpoint. No auth/cookies needed."""
    period1 = int(datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc).timestamp())
    period2 = int(datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).timestamp())
    try:
        resp = requests.get(
            YF_CHART_URL.format(symbol=symbol),
            params={"period1": period1, "period2": period2, "interval": "1d"},
            headers=YF_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError):
        return []

    try:
        result = data["chart"]["result"][0]
        timestamps = result["timestamp"]
        closes = result["indicators"]["quote"][0]["close"]
    except (KeyError, IndexError, TypeError):
        return []

    out = []
    for ts, c in zip(timestamps, closes):
        if c is None:
            continue
        d = datetime.fromtimestamp(ts, tz=timezone.utc).date()
        out.append((d, float(c)))
    # Yahoo can return duplicate timestamps for the same day; dedupe (keep last)
    seen = {}
    for d, c in out:
        seen[d] = c
    return sorted(seen.items())


def _simulate(prices, deposits: dict[date, float]):
    """Simulate a leg given dollar deposits-and-immediately-invest on each date.

    Returns curve [{date, value, deployed, pnl, roi}] where:
      value    = current portfolio value (shares × close)
      deployed = total dollars invested up to this date
      pnl      = value − deployed
      roi      = pnl / deployed (0 before any deployment)
    """
    curve = []
    shares = 0.0
    deployed = 0.0
    for d, close in prices:
        deposit = deposits.get(d, 0.0)
        if deposit:
            shares += deposit / close
            deployed += deposit
        value = shares * close
        pnl = value - deployed
        roi = pnl / deployed if deployed else 0.0
        curve.append({
            "date": d.isoformat(),
            "value": round(value, 2),
            "deployed": round(deployed, 2),
            "pnl": round(pnl, 2),
            "roi": round(roi, 6),
        })
    return curve


def run_buy_and_hold(prices, capital: float):
    """All-in on day 1, hold to end."""
    if not prices:
        return []
    d0, _ = prices[0]
    return _simulate(prices, {d0: capital})


def _dca_dates(prices, period: str) -> list[date]:
    seen = set()
    out = []
    for d, _ in prices:
        if period == "weekly":
            key = (d.isocalendar().year, d.isocalendar().week)
        elif period == "monthly":
            key = (d.year, d.month)
        else:
            raise ValueError(f"unknown DCA period: {period}")
        if key not in seen:
            seen.add(key)
            out.append(d)
    return out


def run_dca(prices, capital: float, period: str):
    """Equal capital split across each period; buy on first trading day of each."""
    if not prices:
        return []
    buy_dates = _dca_dates(prices, period)
    if not buy_dates:
        return []
    chunk = capital / len(buy_dates)
    deposits = {bd: chunk for bd in buy_dates}
    return _simulate(prices, deposits)


LEG_RUNNERS = {
    "buy_and_hold": lambda prices, capital, params: run_buy_and_hold(prices, capital),
    "dca_weekly":   lambda prices, capital, params: run_dca(prices, capital, "weekly"),
    "dca_monthly":  lambda prices, capital, params: run_dca(prices, capital, "monthly"),
}


def run_position(asset: str, legs: list[dict], start: date, end: date, capital: float):
    """Run a Position = list of legs on one asset.

    legs: [{type, weight, name?, params?}] — weights are normalized (treated as ratios).
    Returns:
      {asset, start, end, capital,
       position: {curve: [{date, value, deployed, pnl, roi}]},
       legs:     [{name, type, weight, capital, curve: [...]}]}
    """
    prices = get_prices(asset, start, end)
    if not prices:
        return {"position": {"curve": []}, "legs": [], "error": "no price data"}

    weight_sum = sum(leg.get("weight", 0) for leg in legs) or 1.0
    leg_results = []
    date_axis = [d.isoformat() for d, _ in prices]
    sum_value    = [0.0] * len(date_axis)
    sum_deployed = [0.0] * len(date_axis)

    for leg in legs:
        leg_type = leg["type"]
        runner = LEG_RUNNERS.get(leg_type)
        if not runner:
            continue
        weight = leg.get("weight", 0) / weight_sum
        leg_capital = capital * weight
        curve = runner(prices, leg_capital, leg.get("params") or {})
        by_date = {pt["date"]: pt for pt in curve}
        for i, d in enumerate(date_axis):
            pt = by_date.get(d)
            if pt:
                sum_value[i]    += pt["value"]
                sum_deployed[i] += pt["deployed"]
        leg_results.append({
            "name": leg.get("name") or leg_type,
            "type": leg_type,
            "weight": weight,
            "capital": round(leg_capital, 2),
            "curve": curve,
        })

    position_curve = []
    for d, v, dep in zip(date_axis, sum_value, sum_deployed):
        pnl = v - dep
        roi = pnl / dep if dep else 0.0
        position_curve.append({
            "date": d,
            "value": round(v, 2),
            "deployed": round(dep, 2),
            "pnl": round(pnl, 2),
            "roi": round(roi, 6),
        })

    return {
        "asset": asset.upper(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "capital": capital,
        "position": {"curve": position_curve},
        "legs": leg_results,
    }


# ─── Views ───────────────────────────────────────────────────────────────────

DEFAULT_LEGS = [
    {"name": "Buy & Hold",   "type": "buy_and_hold", "weight": 0.50},
    {"name": "Weekly DCA",   "type": "dca_weekly",   "weight": 0.30},
    {"name": "Monthly DCA",  "type": "dca_monthly",  "weight": 0.20},
]


@api_view(["POST"])
def backtest_position(request):
    """Run a position backtest: one asset × N legs over a date range.

    Body: {
      asset: "AAPL",
      legs:  [{type, weight, name?}],   // omit → DEFAULT_LEGS
      start: "YYYY-MM-DD",              // omit → end - 1y
      end:   "YYYY-MM-DD",              // omit → today
      capital: 10000                    // omit → 10000
    }
    """
    body = request.data or {}
    asset = (body.get("asset") or "").strip().upper()
    if not asset:
        return Response({"error": "asset is required"}, status=400)

    today = date.today()
    try:
        end = _to_date(body["end"]) if body.get("end") else today
        start = _to_date(body["start"]) if body.get("start") else end - timedelta(days=365)
    except (ValueError, TypeError):
        return Response({"error": "invalid start or end date"}, status=400)
    if start >= end:
        return Response({"error": "start must be before end"}, status=400)

    legs = body.get("legs") or DEFAULT_LEGS
    capital = float(body.get("capital") or 10000)

    try:
        result = run_position(asset, legs, start, end, capital)
    except Exception as e:  # noqa: BLE001
        return Response({"error": str(e)}, status=500)

    return Response(result)
