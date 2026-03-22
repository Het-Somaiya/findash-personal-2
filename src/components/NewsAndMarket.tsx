import { useState, useEffect } from "react";
import { getNews, getMarketSnapshot, type NewsArticle, type MarketSnapshot } from "../lib/api";

const SIGNALS = [
  { ticker: "NVDA", signal: "Options volume Z-score: 3.1 — unusually elevated call buying", type: "FLOW"  },
  { ticker: "SPY",  signal: "IV inversion detected at 7-day expiry vs. 30-day baseline",    type: "IV"    },
  { ticker: "AAPL", signal: "Analyst revision direction diverges from recent price action",  type: "DRIFT" },
];

const SNAPSHOT_SYMBOLS = ["SPX", "NDX", "SPY", "VIX", "DXY", "BTC"];

const SENTIMENT_MAP = {
  positive: { tint: "rgba(0,210,130,0.08)",  hoverTint: "rgba(0,210,130,0.13)" },
  negative: { tint: "rgba(255,80,100,0.08)", hoverTint: "rgba(255,80,100,0.13)" },
  mixed:    { tint: "rgba(255,180,0,0.06)",  hoverTint: "rgba(255,180,0,0.10)"  },
};

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

const glass = {
  background: "rgba(8,20,36,0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(0,180,255,0.14)",
  borderRadius: 16,
};

function TagPill({ ticker }: { ticker: string }) {
  return (
    <span
      style={{
        background: "rgba(0,180,255,0.09)",
        border: "1px solid rgba(0,180,255,0.18)",
        borderRadius: 4, padding: "1px 7px",
        fontSize: 10, fontFamily: mono,
        color: "rgba(0,180,255,0.75)",
        cursor: "pointer", transition: "all 0.15s",
        display: "inline-block",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLSpanElement).style.background = "rgba(0,180,255,0.20)";
        (e.currentTarget as HTMLSpanElement).style.color = "#00d4ff";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLSpanElement).style.background = "rgba(0,180,255,0.09)";
        (e.currentTarget as HTMLSpanElement).style.color = "rgba(0,180,255,0.75)";
      }}
    >
      {ticker}
    </span>
  );
}

function timeAgoLabel(refreshedAt: number | null) {
  if (!refreshedAt) return "";
  const diff = Math.floor((Date.now() - refreshedAt) / 1000);
  if (diff < 60)   return "JUST NOW";
  if (diff < 3600) return `REFRESHED ${Math.floor(diff / 60)}M AGO`;
  return `REFRESHED ${Math.floor(diff / 3600)}H AGO`;
}

export function NewsAndMarket() {
  const [articles,     setArticles]     = useState<NewsArticle[]>([]);
  const [snapshot,     setSnapshot]     = useState<MarketSnapshot[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fromBackend,  setFromBackend]  = useState(false);
  const [refreshedAt,  setRefreshedAt]  = useState<number | null>(null);
  const [chatHint,     setChatHint]     = useState(true);

  useEffect(() => {
    getNews().then(({ articles: a, fromBackend: live }) => {
      setArticles(a);
      setFromBackend(live);
      setRefreshedAt(Date.now());
      setLoading(false);
    });
    getMarketSnapshot(SNAPSHOT_SYMBOLS).then(data => {
      if (data.length) setSnapshot(data);
    });
  }, []);

  const displaySnapshot: MarketSnapshot[] = snapshot.length > 0 ? snapshot : [
    { label: "SPX", value: "5,842.31",  change: "+0.41%", up: true  },
    { label: "NDX", value: "20,614.87", change: "+0.78%", up: true  },
    { label: "SPY", value: "584.11",    change: "+0.42%", up: true  },
    { label: "VIX", value: "14.23",     change: "-3.12%", up: false },
    { label: "DXY", value: "103.84",    change: "-0.19%", up: false },
    { label: "BTC", value: "87,240",    change: "+1.24%", up: true  },
  ];

  return (
    <section id="content" style={{
      padding: "72px 32px 80px",
      maxWidth: 1280, margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) 340px",
      gap: 28,
    }}>

      {/* ── News feed ── */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 22 }}>
          <h2 style={{ fontFamily: serif, fontSize: 24, color: "#e0f0ff" }}>
            Market Intelligence
          </h2>
          <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(0,180,255,0.45)", letterSpacing: "0.08em" }}>
            {loading
              ? "LOADING..."
              : fromBackend
                ? timeAgoLabel(refreshedAt)
                : "DEMO DATA"}
          </span>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                ...glass,
                height: i === 0 ? 88 : 62,
                borderRadius: i === 0 ? "16px 16px 8px 8px" : 8,
                background: "rgba(8,20,36,0.35)",
                animation: "shimmer 1.5s infinite",
              }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {articles.map((n, i) => {
              const isTop = i === 0;
              const isBot = i === articles.length - 1;
              const { tint, hoverTint } = SENTIMENT_MAP[n.sentiment];
              const baseBg      = isTop ? "rgba(0,28,58,0.65)" : "rgba(8,20,36,0.45)";
              const baseHoverBg = isTop ? "rgba(0,40,80,0.72)" : "rgba(0,180,255,0.06)";
              const composedBg      = `linear-gradient(${tint},${tint}),${baseBg}`;
              const composedHoverBg = `linear-gradient(${hoverTint},${hoverTint}),${baseHoverBg}`;

              const itemStyle = {
                ...glass,
                borderRadius: isTop ? "16px 16px 8px 8px" : isBot ? "8px 8px 16px 16px" : 8,
                padding: isTop ? "22px 24px" : "16px 22px",
                background: composedBg,
                borderColor: isTop ? "rgba(0,180,255,0.24)" : "rgba(0,180,255,0.10)",
                display: "flex" as const, flexDirection: "column" as const, gap: 9,
                cursor: "pointer" as const, transition: "all 0.2s",
                textDecoration: "none",
              };

              const content = (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                    <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(180,210,255,0.32)", letterSpacing: "0.05em" }}>
                      {n.source}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(180,210,255,0.22)" }}>·</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(180,210,255,0.32)" }}>{n.time}</span>
                    {n.tickers.length > 0 && (
                      <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                        {n.tickers.slice(0, 4).map(t => <TagPill key={t} ticker={t} />)}
                      </div>
                    )}
                  </div>
                  <p style={{
                    fontFamily: isTop ? serif : sans,
                    fontSize: isTop ? 19 : 14,
                    color: isTop ? "#eaf4ff" : "rgba(180,210,255,0.75)",
                    lineHeight: 1.45, margin: 0,
                  }}>
                    {n.headline}
                  </p>
                </>
              );

              return n.url && n.url !== "#" ? (
                <a
                  key={n.id}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={itemStyle}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = composedHoverBg;
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(0,180,255,0.25)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.background = composedBg;
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = isTop
                      ? "rgba(0,180,255,0.24)" : "rgba(0,180,255,0.10)";
                  }}
                >
                  {content}
                </a>
              ) : (
                <div
                  key={n.id}
                  style={itemStyle}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.background = composedHoverBg;
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,180,255,0.25)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background = composedBg;
                    (e.currentTarget as HTMLDivElement).style.borderColor = isTop
                      ? "rgba(0,180,255,0.24)" : "rgba(0,180,255,0.10)";
                  }}
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Market Snapshot */}
        <div style={{ ...glass, padding: 22 }}>
          <div style={{
            fontFamily: mono, fontSize: 10,
            color: "rgba(0,180,255,0.45)", letterSpacing: "0.10em",
            marginBottom: 16,
          }}>
            MARKET SNAPSHOT
          </div>
          {displaySnapshot.map((m, i) => (
            <div
              key={m.label}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0",
                borderBottom: i < displaySnapshot.length - 1
                  ? "1px solid rgba(0,180,255,0.07)" : "none",
              }}
            >
              <span style={{ fontFamily: mono, fontSize: 12, color: "rgba(180,210,255,0.45)" }}>
                {m.label}
              </span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: mono, fontSize: 13, color: "rgba(220,240,255,0.85)" }}>
                  {m.value}
                </div>
                <div style={{ fontFamily: mono, fontSize: 10, color: m.up ? "#00d282" : "#ff5064" }}>
                  {m.change}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Top Signals */}
        <div style={{ ...glass, padding: 22 }}>
          <div style={{
            fontFamily: mono, fontSize: 10,
            color: "rgba(0,180,255,0.45)", letterSpacing: "0.10em",
            marginBottom: 16,
          }}>
            TOP SIGNALS TODAY
          </div>
          {SIGNALS.map((s, i) => (
            <div
              key={i}
              style={{
                padding: "11px 13px", marginBottom: 7,
                background: "rgba(0,180,255,0.05)",
                borderRadius: 8, border: "1px solid rgba(0,180,255,0.10)",
                cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.10)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.05)")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: "#00d4ff", fontWeight: 500 }}>
                  {s.ticker}
                </span>
                <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(0,180,255,0.38)", letterSpacing: "0.08em" }}>
                  {s.type}
                </span>
              </div>
              <span style={{ fontFamily: sans, fontSize: 12, color: "rgba(180,210,255,0.55)", lineHeight: 1.5 }}>
                {s.signal}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <span
              style={{ fontFamily: sans, fontSize: 11, color: "rgba(0,180,255,0.38)", cursor: "pointer", transition: "color 0.15s" }}
              onMouseEnter={e => ((e.currentTarget as HTMLSpanElement).style.color = "#00d4ff")}
              onMouseLeave={e => ((e.currentTarget as HTMLSpanElement).style.color = "rgba(0,180,255,0.38)")}
            >
              Register to set custom signal alerts →
            </span>
          </div>
        </div>

        {/* AI chatbot hint — dismissable */}
        {chatHint && (
          <div style={{ ...glass, padding: 20, position: "relative" }}>
            <button
              onClick={() => setChatHint(false)}
              style={{
                position: "absolute", top: 10, right: 14,
                background: "none", border: "none",
                color: "rgba(180,210,255,0.28)",
                cursor: "pointer", fontSize: 18, lineHeight: 1,
              }}
            >
              ×
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <div
                className="dot-pulse"
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#00d4ff", boxShadow: "0 0 6px #00d4ff",
                }}
              />
              <span style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.08em" }}>
                AI ASSISTANT ACTIVE
              </span>
            </div>
            <p style={{
              fontFamily: sans, fontSize: 12.5,
              color: "rgba(180,210,255,0.55)", lineHeight: 1.55, marginBottom: 13,
            }}>
              Ask about any market, ticker, or concept. No login required on the free tier.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["What is IV percentile?", "Explain GEX", "Why is VIX falling?"].map(q => (
                <span
                  key={q}
                  style={{
                    background: "rgba(0,180,255,0.07)",
                    border: "1px solid rgba(0,180,255,0.14)",
                    borderRadius: 5, padding: "3px 10px",
                    fontSize: 11, fontFamily: sans,
                    color: "rgba(0,180,255,0.65)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLSpanElement).style.background = "rgba(0,180,255,0.15)";
                    (e.currentTarget as HTMLSpanElement).style.color = "#00d4ff";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLSpanElement).style.background = "rgba(0,180,255,0.07)";
                    (e.currentTarget as HTMLSpanElement).style.color = "rgba(0,180,255,0.65)";
                  }}
                >
                  {q}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
