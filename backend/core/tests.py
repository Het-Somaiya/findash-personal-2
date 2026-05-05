from datetime import date, datetime, timedelta
from unittest.mock import patch

from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .auth_backend import EmailBackend
from .backtest import (
    _dca_dates,
    _simulate,
    _to_date,
    run_buy_and_hold,
    run_dca,
    run_position,
)
from .models import ActiveSession, User, Watchlist, WatchlistItem
from .serializers import LoginSerializer, RegisterSerializer
from .views import _is_quality_article


# ───────────────────────────── helpers ─────────────────────────────

def _make_user(email="alice@example.com", password="StrongPass!23", name="Alice"):
    return User.objects.create_user(email=email, password=password, name=name)


def _auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


# ───────────────────────────── Auth ─────────────────────────────

class RegisterTests(TestCase):
    def test_register_creates_user_and_returns_access_token(self):
        client = APIClient()
        response = client.post(
            reverse("auth-register"),
            {"email": "new@example.com", "name": "New", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["email"], "new@example.com")
        self.assertTrue(User.objects.filter(email="new@example.com").exists())
        self.assertIn(settings.AUTH_COOKIE_NAME, response.cookies)

    def test_register_rejects_duplicate_email_case_insensitive(self):
        _make_user(email="dup@example.com")
        response = APIClient().post(
            reverse("auth-register"),
            {"email": "DUP@example.com", "name": "Dup", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_register_rejects_short_password(self):
        response = APIClient().post(
            reverse("auth-register"),
            {"email": "short@example.com", "name": "Short", "password": "abc"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="short@example.com").exists())

    def test_register_rejects_invalid_email(self):
        response = APIClient().post(
            reverse("auth-register"),
            {"email": "not-an-email", "name": "x", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class LoginTests(TestCase):
    def setUp(self):
        self.user = _make_user(email="bob@example.com", password="StrongPass!23")

    def test_login_success_sets_refresh_cookie(self):
        response = APIClient().post(
            reverse("auth-login"),
            {"email": "bob@example.com", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["id"], self.user.id)
        self.assertIn(settings.AUTH_COOKIE_NAME, response.cookies)
        self.assertTrue(ActiveSession.objects.filter(user=self.user).exists())

    def test_login_with_wrong_password_returns_401(self):
        response = APIClient().post(
            reverse("auth-login"),
            {"email": "bob@example.com", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertFalse(ActiveSession.objects.filter(user=self.user).exists())

    def test_login_with_unknown_email_returns_401(self):
        response = APIClient().post(
            reverse("auth-login"),
            {"email": "ghost@example.com", "password": "StrongPass!23"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)


class AuthCookieTests(TestCase):
    def test_logout_clears_refresh_cookie_without_access_token(self):
        self.client.cookies[settings.AUTH_COOKIE_NAME] = "stale-refresh-token"

        response = self.client.post(reverse("auth-logout"))

        self.assertEqual(response.status_code, 204)
        cookie = response.cookies[settings.AUTH_COOKIE_NAME]
        self.assertEqual(cookie.value, "")
        self.assertEqual(cookie["path"], settings.AUTH_COOKIE_PATH)
        self.assertEqual(cookie["max-age"], 0)


class RefreshTests(TestCase):
    def setUp(self):
        self.user = _make_user(email="carol@example.com")

    def test_refresh_without_cookie_returns_401(self):
        response = APIClient().post(reverse("auth-refresh"))
        self.assertEqual(response.status_code, 401)

    def test_refresh_with_invalid_token_returns_401_and_clears_cookie(self):
        client = APIClient()
        client.cookies[settings.AUTH_COOKIE_NAME] = "garbage"
        response = client.post(reverse("auth-refresh"))
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.cookies[settings.AUTH_COOKIE_NAME].value, "")

    def test_refresh_rotates_token_and_updates_session(self):
        refresh = RefreshToken.for_user(self.user)
        ActiveSession.objects.create(user=self.user, refresh_jti=str(refresh["jti"]))

        client = APIClient()
        client.cookies[settings.AUTH_COOKIE_NAME] = str(refresh)
        response = client.post(reverse("auth-refresh"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        new_cookie = response.cookies[settings.AUTH_COOKIE_NAME].value
        self.assertNotEqual(new_cookie, str(refresh))
        # Session row's jti should have been rotated.
        session = ActiveSession.objects.get(user=self.user)
        self.assertNotEqual(session.refresh_jti, str(refresh["jti"]))

    def test_refresh_with_revoked_session_returns_401(self):
        refresh = RefreshToken.for_user(self.user)
        # No ActiveSession row → session is "revoked"
        client = APIClient()
        client.cookies[settings.AUTH_COOKIE_NAME] = str(refresh)
        response = client.post(reverse("auth-refresh"))
        self.assertEqual(response.status_code, 401)


class LogoutAllTests(TestCase):
    def test_logout_all_blacklists_and_deletes_user_sessions(self):
        user = _make_user(email="dora@example.com")
        for _ in range(3):
            r = RefreshToken.for_user(user)
            ActiveSession.objects.create(user=user, refresh_jti=str(r["jti"]))
        # Other user's session should not be touched.
        other = _make_user(email="other@example.com")
        ActiveSession.objects.create(user=other, refresh_jti="other-jti")

        client = _auth_client(user)
        response = client.post(reverse("auth-logout-all"))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(ActiveSession.objects.filter(user=user).count(), 0)
        self.assertEqual(ActiveSession.objects.filter(user=other).count(), 1)

    def test_logout_all_requires_auth(self):
        response = APIClient().post(reverse("auth-logout-all"))
        self.assertEqual(response.status_code, 401)


class MeAndSessionsTests(TestCase):
    def test_me_returns_current_user(self):
        user = _make_user(email="eve@example.com", name="Eve")
        client = _auth_client(user)
        response = client.get(reverse("auth-me"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "eve@example.com")
        self.assertEqual(response.data["name"], "Eve")

    def test_me_requires_auth(self):
        self.assertEqual(APIClient().get(reverse("auth-me")).status_code, 401)

    def test_sessions_lists_only_current_user_sessions(self):
        user = _make_user(email="frank@example.com")
        ActiveSession.objects.create(user=user, refresh_jti="a", device_info="dev-a")
        ActiveSession.objects.create(user=user, refresh_jti="b", device_info="dev-b")
        other = _make_user(email="other2@example.com")
        ActiveSession.objects.create(user=other, refresh_jti="c", device_info="dev-c")

        response = _auth_client(user).get(reverse("auth-sessions"))
        self.assertEqual(response.status_code, 200)
        devices = {row["device_info"] for row in response.data}
        self.assertEqual(devices, {"dev-a", "dev-b"})


class EmailBackendTests(TestCase):
    def setUp(self):
        self.user = _make_user(email="gina@example.com", password="StrongPass!23")
        self.backend = EmailBackend()

    def test_authenticate_success(self):
        result = self.backend.authenticate(None, email="gina@example.com", password="StrongPass!23")
        self.assertEqual(result, self.user)

    def test_authenticate_wrong_password_returns_none(self):
        self.assertIsNone(self.backend.authenticate(None, email="gina@example.com", password="nope"))

    def test_authenticate_unknown_email_returns_none(self):
        self.assertIsNone(self.backend.authenticate(None, email="nobody@example.com", password="x"))

    def test_authenticate_inactive_user_returns_none(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertIsNone(
            self.backend.authenticate(None, email="gina@example.com", password="StrongPass!23")
        )

    def test_get_user_returns_user_or_none(self):
        self.assertEqual(self.backend.get_user(self.user.id), self.user)
        self.assertIsNone(self.backend.get_user(999_999))


class SerializerTests(TestCase):
    def test_register_serializer_lowercases_email(self):
        s = RegisterSerializer(data={"email": "MIXED@Example.COM", "name": "M", "password": "StrongPass!23"})
        s.is_valid(raise_exception=True)
        self.assertEqual(s.validated_data["email"], "mixed@example.com")

    def test_register_serializer_rejects_missing_fields(self):
        s = RegisterSerializer(data={"email": "x@y.com"})
        self.assertFalse(s.is_valid())
        self.assertIn("password", s.errors)

    def test_login_serializer_validates_email_format(self):
        self.assertFalse(LoginSerializer(data={"email": "nope", "password": "x"}).is_valid())
        self.assertTrue(LoginSerializer(data={"email": "ok@x.com", "password": "x"}).is_valid())


# ───────────────────────────── Watchlist ─────────────────────────────

class WatchlistTests(TestCase):
    def setUp(self):
        self.user = _make_user(email="watcher@example.com")
        self.client = _auth_client(self.user)

    def test_list_requires_auth(self):
        self.assertEqual(APIClient().get(reverse("watchlist-list")).status_code, 401)

    def test_list_returns_empty_for_new_user_and_creates_default(self):
        response = self.client.get(reverse("watchlist-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"symbols": []})
        self.assertTrue(Watchlist.objects.filter(user=self.user, name="default").exists())

    def test_add_item_uppercases_symbol_and_returns_position(self):
        response = self.client.post(reverse("watchlist-add"), {"symbol": "aapl"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["symbol"], "AAPL")
        self.assertEqual(response.data["position"], 1)

    def test_add_item_rejects_blank_symbol(self):
        for bad in [{"symbol": ""}, {"symbol": "   "}, {}]:
            response = self.client.post(reverse("watchlist-add"), bad, format="json")
            self.assertEqual(response.status_code, 400, msg=bad)

    def test_add_item_is_idempotent_on_duplicate(self):
        self.client.post(reverse("watchlist-add"), {"symbol": "AAPL"}, format="json")
        response = self.client.post(reverse("watchlist-add"), {"symbol": "aapl"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(WatchlistItem.objects.filter(symbol="AAPL").count(), 1)

    def test_add_item_increments_position(self):
        self.client.post(reverse("watchlist-add"), {"symbol": "AAPL"}, format="json")
        self.client.post(reverse("watchlist-add"), {"symbol": "MSFT"}, format="json")
        response = self.client.post(reverse("watchlist-add"), {"symbol": "GOOG"}, format="json")
        self.assertEqual(response.data["position"], 3)

    def test_remove_item_returns_204_and_drops_row(self):
        self.client.post(reverse("watchlist-add"), {"symbol": "AAPL"}, format="json")
        response = self.client.delete(reverse("watchlist-remove", args=["aapl"]))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(WatchlistItem.objects.filter(symbol="AAPL").exists())

    def test_remove_item_unknown_returns_404(self):
        response = self.client.delete(reverse("watchlist-remove", args=["XYZ"]))
        self.assertEqual(response.status_code, 404)

    def test_reorder_validates_payload_type(self):
        response = self.client.patch(reverse("watchlist-reorder"), {"symbols": "AAPL"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_reorder_updates_positions_for_known_symbols(self):
        for sym in ["AAPL", "MSFT", "GOOG"]:
            self.client.post(reverse("watchlist-add"), {"symbol": sym}, format="json")
        response = self.client.patch(
            reverse("watchlist-reorder"),
            {"symbols": ["GOOG", "AAPL", "MSFT", "UNKNOWN"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        wl = Watchlist.objects.get(user=self.user, name="default")
        positions = {it.symbol: it.position for it in wl.items.all()}
        self.assertEqual(positions["GOOG"], 1)
        self.assertEqual(positions["AAPL"], 2)
        self.assertEqual(positions["MSFT"], 3)

    def test_users_only_see_their_own_watchlist(self):
        self.client.post(reverse("watchlist-add"), {"symbol": "AAPL"}, format="json")
        other = _auth_client(_make_user(email="other-watcher@example.com"))
        response = other.get(reverse("watchlist-list"))
        self.assertEqual(response.data, {"symbols": []})


# ───────────────────────────── Backtest ─────────────────────────────

class ToDateTests(TestCase):
    def test_accepts_date(self):
        d = date(2024, 5, 1)
        self.assertEqual(_to_date(d), d)

    def test_extracts_date_from_datetime(self):
        self.assertEqual(_to_date(datetime(2024, 5, 1, 12, 30)), date(2024, 5, 1))

    def test_parses_iso_string(self):
        self.assertEqual(_to_date("2024-05-01"), date(2024, 5, 1))

    def test_truncates_long_iso_string(self):
        self.assertEqual(_to_date("2024-05-01T12:00:00Z"), date(2024, 5, 1))


class SimulateTests(TestCase):
    def test_buy_and_hold_doubles_when_price_doubles(self):
        prices = [(date(2024, 1, 1), 100.0), (date(2024, 1, 2), 200.0)]
        curve = run_buy_and_hold(prices, capital=1000.0)
        self.assertEqual(len(curve), 2)
        self.assertEqual(curve[0]["deployed"], 1000.0)
        self.assertEqual(curve[0]["value"], 1000.0)
        self.assertEqual(curve[0]["pnl"], 0.0)
        self.assertEqual(curve[1]["value"], 2000.0)
        self.assertEqual(curve[1]["pnl"], 1000.0)
        self.assertEqual(curve[1]["roi"], 1.0)

    def test_buy_and_hold_empty_prices_returns_empty(self):
        self.assertEqual(run_buy_and_hold([], 1000.0), [])

    def test_simulate_no_deposit_keeps_zero_values(self):
        prices = [(date(2024, 1, 1), 100.0), (date(2024, 1, 2), 110.0)]
        curve = _simulate(prices, deposits={})
        self.assertEqual([c["value"] for c in curve], [0.0, 0.0])
        self.assertEqual([c["roi"] for c in curve], [0.0, 0.0])


class DcaDatesTests(TestCase):
    def test_weekly_picks_one_date_per_iso_week(self):
        prices = [
            (date(2024, 1, 1), 1.0),  # Mon week 1
            (date(2024, 1, 2), 1.0),  # Tue week 1
            (date(2024, 1, 8), 1.0),  # Mon week 2
            (date(2024, 1, 15), 1.0),  # Mon week 3
        ]
        result = _dca_dates(prices, "weekly")
        self.assertEqual(result, [date(2024, 1, 1), date(2024, 1, 8), date(2024, 1, 15)])

    def test_monthly_picks_first_date_in_each_month(self):
        prices = [
            (date(2024, 1, 5), 1.0),
            (date(2024, 1, 20), 1.0),
            (date(2024, 2, 3), 1.0),
            (date(2024, 3, 1), 1.0),
        ]
        result = _dca_dates(prices, "monthly")
        self.assertEqual(result, [date(2024, 1, 5), date(2024, 2, 3), date(2024, 3, 1)])

    def test_unknown_period_raises(self):
        with self.assertRaises(ValueError):
            _dca_dates([(date(2024, 1, 1), 1.0)], "yearly")


class RunDcaTests(TestCase):
    def test_dca_distributes_capital_evenly(self):
        prices = [
            (date(2024, 1, 1), 100.0),
            (date(2024, 2, 1), 100.0),
            (date(2024, 3, 1), 100.0),
        ]
        curve = run_dca(prices, capital=300.0, period="monthly")
        self.assertEqual(curve[-1]["deployed"], 300.0)

    def test_dca_empty_prices(self):
        self.assertEqual(run_dca([], 1000.0, "weekly"), [])


class RunPositionTests(TestCase):
    def test_normalizes_weights_and_sums_legs(self):
        prices = [(date(2024, 1, 1), 100.0), (date(2024, 1, 2), 200.0)]
        with patch("core.backtest.get_prices", return_value=prices):
            result = run_position(
                "AAPL",
                legs=[
                    {"name": "A", "type": "buy_and_hold", "weight": 1},
                    {"name": "B", "type": "buy_and_hold", "weight": 1},
                ],
                start=date(2024, 1, 1),
                end=date(2024, 1, 2),
                capital=1000.0,
            )
        self.assertEqual(result["asset"], "AAPL")
        self.assertEqual(len(result["legs"]), 2)
        # Each leg got 50% of capital → 500 each → totals match a single 1000 buy-and-hold.
        self.assertEqual(result["position"]["curve"][0]["deployed"], 1000.0)
        self.assertEqual(result["position"]["curve"][1]["value"], 2000.0)

    def test_unknown_leg_type_is_skipped(self):
        prices = [(date(2024, 1, 1), 100.0), (date(2024, 1, 2), 110.0)]
        with patch("core.backtest.get_prices", return_value=prices):
            result = run_position(
                "AAPL",
                legs=[{"type": "nonsense", "weight": 1}],
                start=date(2024, 1, 1),
                end=date(2024, 1, 2),
                capital=1000.0,
            )
        self.assertEqual(result["legs"], [])

    def test_no_price_data_returns_error(self):
        with patch("core.backtest.get_prices", return_value=[]):
            result = run_position("AAPL", legs=[], start=date(2024, 1, 1), end=date(2024, 1, 2), capital=1000.0)
        self.assertIn("error", result)


class BacktestViewTests(TestCase):
    def test_missing_asset_returns_400(self):
        response = APIClient().post(reverse("backtest-position"), {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_invalid_date_returns_400(self):
        response = APIClient().post(
            reverse("backtest-position"),
            {"asset": "AAPL", "start": "not-a-date", "end": "2024-01-02"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_start_must_be_before_end(self):
        response = APIClient().post(
            reverse("backtest-position"),
            {"asset": "AAPL", "start": "2024-02-01", "end": "2024-01-01"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_default_dates_span_one_year(self):
        prices = [(date.today() - timedelta(days=365), 100.0), (date.today(), 110.0)]
        with patch("core.backtest.get_prices", return_value=prices):
            response = APIClient().post(
                reverse("backtest-position"), {"asset": "AAPL"}, format="json"
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["asset"], "AAPL")


# ───────────────────────────── News quality filter ─────────────────────────────

class IsQualityArticleTests(TestCase):
    def test_short_headline_is_rejected(self):
        self.assertFalse(_is_quality_article({"headline": "Short"}))

    def test_blocked_filing_terms_are_rejected(self):
        for term in ["Form 8 filed today by ABC", "Schedule 13G amendment by Foo", "10-Q earnings filing released"]:
            self.assertFalse(_is_quality_article({"headline": term}), msg=term)

    def test_normal_long_headline_is_accepted(self):
        self.assertTrue(_is_quality_article({"headline": "Apple unveils new chip with major performance gains"}))


# ───────────────────────────── Models ─────────────────────────────

class ModelStringTests(TestCase):
    def test_user_str_returns_email(self):
        u = _make_user(email="strtest@example.com")
        self.assertEqual(str(u), "strtest@example.com")

    def test_watchlist_item_unique_per_watchlist(self):
        user = _make_user(email="uq@example.com")
        wl = Watchlist.objects.create(user=user, name="default")
        WatchlistItem.objects.create(watchlist=wl, symbol="AAPL", position=1)
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            WatchlistItem.objects.create(watchlist=wl, symbol="AAPL", position=2)
