from django.urls import path
from . import views, auth_views, watchlist_views
from .backtest import backtest_position
from .chat import chat

urlpatterns = [
    # Public data endpoints
    path('news/', views.market_news, name='market-news'),
    path('quotes/', views.stock_quotes, name='stock-quotes'),
    path('asset/', views.stock_asset, name='stock-asset'),
    path('market-overview/', views.market_overview, name='market-overview'),
    path('bars/', views.stock_bars, name='stock-bars'),
    path('asset/history/', views.asset_history, name='asset-history'),
    path('search/', views.ticker_search, name='ticker-search'),
    path('chat/', chat, name='chat'),
    path('backtest/position/', backtest_position, name='backtest-position'),

    # Auth
    path('auth/register/', auth_views.register, name='auth-register'),
    path('auth/login/', auth_views.login, name='auth-login'),
    path('auth/logout/', auth_views.logout, name='auth-logout'),
    path('auth/logout-all/', auth_views.logout_all, name='auth-logout-all'),
    path('auth/refresh/', auth_views.refresh, name='auth-refresh'),
    path('auth/me/', auth_views.me, name='auth-me'),
    path('auth/sessions/', auth_views.sessions, name='auth-sessions'),

    # Watchlist (per-user dashboard)
    path('watchlist/', watchlist_views.list_watchlist, name='watchlist-list'),
    path('watchlist/items/', watchlist_views.add_item, name='watchlist-add'),
    path('watchlist/items/<str:symbol>/', watchlist_views.remove_item, name='watchlist-remove'),
    path('watchlist/reorder/', watchlist_views.reorder, name='watchlist-reorder'),
]
