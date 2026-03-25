from django.db import models


class User(models.Model):
    email = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    password_hash = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.email


class Watchlist(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "watchlists"

    def __str__(self):
        return f"{self.user_id} — {self.name}"


class WatchlistItem(models.Model):
    watchlist = models.ForeignKey(Watchlist, on_delete=models.CASCADE)
    symbol = models.CharField(max_length=20)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "watchlist_items"
        unique_together = [("watchlist", "symbol")]

    def __str__(self):
        return self.symbol


class NewsArticle(models.Model):
    external_id = models.CharField(max_length=255, unique=True, blank=True, null=True)
    headline = models.TextField()
    source = models.CharField(max_length=255, blank=True, null=True)
    url = models.TextField(blank=True, null=True)
    image_url = models.TextField(blank=True, null=True)
    summary = models.TextField(blank=True, null=True)
    sentiment = models.CharField(max_length=20, blank=True, null=True)
    sentiment_score = models.FloatField(blank=True, null=True)
    tickers = models.JSONField(default=list)
    published_at = models.DateTimeField(blank=True, null=True)
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "news_articles"

    def __str__(self):
        return self.headline[:80]


class Quote(models.Model):
    symbol = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    price = models.FloatField()
    change = models.FloatField()
    change_pct = models.FloatField()
    volume = models.IntegerField(blank=True, null=True)
    market_cap = models.FloatField(blank=True, null=True)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "quotes"

    def __str__(self):
        return f"{self.symbol} @ {self.price}"


class ChatSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_sessions"

    def __str__(self):
        return self.title or f"Session {self.pk}"


class ChatMessage(models.Model):
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE)
    role = models.CharField(max_length=20)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "chat_messages"

    def __str__(self):
        return f"[{self.role}] {self.content[:60]}"


class TopSignal(models.Model):
    ticker = models.CharField(max_length=20)
    signal_type = models.CharField(max_length=20)
    sentiment = models.FloatField()
    headline = models.TextField()
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "top_signals"

    def __str__(self):
        return f"{self.ticker} {self.signal_type}"
