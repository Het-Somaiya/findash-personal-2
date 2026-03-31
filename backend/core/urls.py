from django.urls import path
from . import views
from .chat import chat

urlpatterns = [
    path('news/', views.market_news, name='market-news'),
    path('quotes/', views.stock_quotes, name='stock-quotes'),
    path('asset/', views.stock_asset, name='stock-asset'),
    path('market-overview/', views.market_overview, name='market-overview'),
    path('bars/', views.stock_bars, name='stock-bars'),
    path('chat/', chat, name='chat'),
]
