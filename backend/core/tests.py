from django.conf import settings
from django.test import TestCase
from django.urls import reverse


class AuthCookieTests(TestCase):
    def test_logout_clears_refresh_cookie_without_access_token(self):
        self.client.cookies[settings.AUTH_COOKIE_NAME] = "stale-refresh-token"

        response = self.client.post(reverse("auth-logout"))

        self.assertEqual(response.status_code, 204)
        cookie = response.cookies[settings.AUTH_COOKIE_NAME]
        self.assertEqual(cookie.value, "")
        self.assertEqual(cookie["path"], settings.AUTH_COOKIE_PATH)
        self.assertEqual(cookie["max-age"], 0)
