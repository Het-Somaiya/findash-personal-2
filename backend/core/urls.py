from django.urls import path
from . import views
from .chat import chat

urlpatterns = [
    path('news/', views.market_news, name='market-news'),
    path('chat/', chat, name='chat'),
]
