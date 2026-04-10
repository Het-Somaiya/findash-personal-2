from django.urls import path
from . import views, auth_views
from .chat import chat

urlpatterns = [
    # Public data endpoints
    path('news/', views.market_news, name='market-news'),
    path('quotes/', views.stock_quotes, name='stock-quotes'),
    path('asset/', views.stock_asset, name='stock-asset'),
    path('market-overview/', views.market_overview, name='market-overview'),
    path('bars/', views.stock_bars, name='stock-bars'),
    path('search/', views.ticker_search, name='ticker-search'),
    path('chat/', chat, name='chat'),

    # Auth
    path('auth/register/', auth_views.register, name='auth-register'),
    path('auth/login/', auth_views.login, name='auth-login'),
    path('auth/logout/', auth_views.logout, name='auth-logout'),
    path('auth/logout-all/', auth_views.logout_all, name='auth-logout-all'),
    path('auth/refresh/', auth_views.refresh, name='auth-refresh'),
    path('auth/me/', auth_views.me, name='auth-me'),
    path('auth/sessions/', auth_views.sessions, name='auth-sessions'),
]
