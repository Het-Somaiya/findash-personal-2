import { useState, useEffect, useRef } from "react";
import { LineChart, Line, YAxis } from "recharts";
import { getNews, getMarketSnapshot, getTicker24hBars, type NewsArticle, type MarketSnapshot, type BackendQuote, type TopSignal, type BarPoint } from "../lib/api";

const FALLBACK_SIGNALS = [
  { ticker: "NVDA", signal: "Options volume Z-score: 3.1 — unusually elevated call buying", type: "FLOW"  },
  { ticker: "SPY",  signal: "IV inversion detected at 7-day expiry vs. 30-day baseline",    type: "IV"    },
  { ticker: "AAPL", signal: "Analyst revision direction diverges from recent price action",  type: "DRIFT" },
];

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  FLOW: "#00d4ff",
  IV: "#ffb800",
  DRIFT: "#c084fc",
  SENTIMENT: "#c084fc",
  BULLISH: "#00d282",
  BEARISH: "#ff5064",
};

const SNAPSHOT_SYMBOLS = ["SPX", "NDX", "SPY", "VIX", "DXY", "BTC"];

/**
 * Rank-normalized sentiment gradient.
 * Instead of mapping raw scores to colors (which clusters when scores are similar),
 * we map the article's RANK within the feed to the color scale.
 * → Most bearish article always = deepest red
 * → Most bullish article always = deepest green
 * → Neutral/middle = dark glass
 * This guarantees visible contrast regardless of score clustering.
 */
function buildSentimentStyles(articles: { sentimentScore: number | null }[]): (string | undefined)[] {
  const scores = articles.map(a => a.sentimentScore ?? 0);
  const positives = scores.filter(s => s > 0);
  const negatives = scores.filter(s => s < 0);
  const maxPos = positives.length > 0 ? Math.max(...positives) : 1;
  const minNeg = negatives.length > 0 ? Math.min(...negatives) : -1;

  return scores.map(score => {
    if (!score || score === 0) return undefined;
    if (score > 0) {
      // rank within positives: 0.25 (weakest positive) → 0.60 (strongest positive)
      const t = score / maxPos;
      const peak = 0.25 + t * 0.35;
      return `linear-gradient(135deg, rgba(0,210,100,${peak.toFixed(2)}) 0%, rgba(0,210,100,0.04) 55%, rgba(6,16,30,0.75) 100%)`;
    } else {
      // rank within negatives: 0.25 (weakest negative) → 0.60 (strongest negative)
      const t = score / minNeg;
      const peak = 0.25 + t * 0.35;
      return `linear-gradient(135deg, rgba(255,55,55,${peak.toFixed(2)}) 0%, rgba(255,55,55,0.04) 55%, rgba(6,16,30,0.75) 100%)`;
    }
  });
}

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

const glass = {
  background: "rgba(10,12,20,0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  borderRadius: 16,
  boxShadow: "0 0 5px rgba(0,180,255,0.05)",
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

function Sparkline({ data, up }: { data: BarPoint[]; up: boolean }) {
  return (
    <LineChart width={80} height={32} data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
      <YAxis domain={['dataMin', 'dataMax']} hide />
      <Line
        type="monotone"
        dataKey="c"
        stroke={up ? "#00d282" : "#ff5064"}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export function NewsAndMarket() {
  const [articles,     setArticles]     = useState<NewsArticle[]>([]);
  const [snapshot,     setSnapshot]     = useState<MarketSnapshot[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fromBackend,  setFromBackend]  = useState(false);
  const [refreshedAt,  setRefreshedAt]  = useState<number | null>(null);
  const [chatHint,     setChatHint]     = useState(true);
  const [backendQuotes, setBackendQuotes] = useState<Record<string, BackendQuote>>({});
  const [topStocks,    setTopStocks]    = useState<string[]>([]);
  const [topSignals,   setTopSignals]   = useState<TopSignal[]>([]);
  const [hoveredTickers, setHoveredTickers] = useState<string[] | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [sparklines, setSparklines] = useState<Record<string, BarPoint[]>>({});
  const sparklineCache = useRef<Record<string, BarPoint[]>>({});

  const fetchSparklines = async (tickers: string[]) => {
    const missing = tickers.filter(t => !sparklineCache.current[t]);
    await Promise.all(missing.map(async t => {
      sparklineCache.current[t] = await getTicker24hBars(t);
    }));
    setSparklines({ ...sparklineCache.current });
  };

  useEffect(() => {
    getNews().then(({ articles: a, fromBackend: live, quotes, topStocks: ts, topSignals: sig }) => {
      setArticles(a);
      setFromBackend(live);
      setBackendQuotes(quotes);
      setTopStocks(ts);
      setTopSignals(sig);
      setRefreshedAt(Date.now());
      setLoading(false);
    });
    getMarketSnapshot(SNAPSHOT_SYMBOLS).then(data => {
      if (data.length) setSnapshot(data);
    });
  }, []);

  useEffect(() => {
    if (topStocks.length > 0) fetchSparklines(topStocks);
  }, [topStocks]);

  useEffect(() => {
    if (hoveredTickers && hoveredTickers.length > 0) fetchSparklines(hoveredTickers);
  }, [hoveredTickers]);

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
                background: "rgba(10,12,20,0.35)",
                animation: "shimmer 1.5s infinite",
              }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {buildSentimentStyles(articles).map((sentBg, i) => { const n = articles[i];
              const isHovered = n.id === hoveredId;
              const isBot = i === articles.length - 1;
              const baseBg   = sentBg || "rgba(8,20,36,0.55)";
              const itemStyle = {
                ...glass,
                borderRadius: isBot ? "8px 8px 16px 16px" : 8,
                padding: "16px 22px",
                background: baseBg,
                boxShadow: isHovered ? "0 0 20px rgba(0,180,255,0.12)" : "none",
                border: "none",
                transform: isHovered ? "scale(1.012)" : "scale(1)",
                transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.2s ease",
                display: "flex" as const, flexDirection: "column" as const, gap: 9,
                cursor: "pointer" as const,
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
                    fontFamily: sans,
                    fontSize: 14,
                    color: isHovered ? "#eaf4ff" : "rgba(180,210,255,0.72)",
                    lineHeight: 1.45, margin: 0,
                    fontWeight: isHovered ? 500 : 400,
                    transition: "color 0.2s, font-weight 0.2s",
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
                  onMouseEnter={() => {

                    if (n.tickers.length > 0) setHoveredTickers(n.tickers);
                    setHoveredId(n.id);
                  }}
                  onMouseLeave={() => {

                    setHoveredTickers(null);
                    setHoveredId(null);
                  }}
                >
                  {content}
                </a>
              ) : (
                <div
                  key={n.id}
                  style={itemStyle}
                  onMouseEnter={() => {

                    if (n.tickers.length > 0) setHoveredTickers(n.tickers);
                    setHoveredId(n.id);
                  }}
                  onMouseLeave={() => {

                    setHoveredTickers(null);
                    setHoveredId(null);
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

        {/* Market Snapshot — switches to Impacted Stocks on hover */}
        {hoveredTickers && Object.keys(backendQuotes).length > 0 ? (
          <div style={{ ...glass, padding: 22 }}>
            <div style={{
              fontFamily: mono, fontSize: 10,
              color: "rgba(0,180,255,0.45)", letterSpacing: "0.10em",
              marginBottom: 16,
            }}>
              IMPACTED STOCKS
            </div>
            {hoveredTickers.map((ticker, i) => {
              const q = backendQuotes[ticker];
              const price = q?.price || 0;
              const changePct = q?.changePercent || 0;
              const up = changePct >= 0;
              return (
                <div
                  key={ticker}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0",
                    borderBottom: i < hoveredTickers.length - 1
                      ? "1px solid rgba(0,180,255,0.07)" : "none",
                  }}
                >
                  <span style={{ fontFamily: mono, fontSize: 12, color: "rgba(180,210,255,0.45)", width: 40, flexShrink: 0 }}>
                    {ticker}
                  </span>
                  <Sparkline data={sparklines[ticker] ?? [{ t: 0, c: 0 }]} up={up} />
                  <div style={{ textAlign: "right", width: 64, flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 13, color: "rgba(220,240,255,0.85)" }}>
                      {price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: up ? "#00d282" : "#ff5064" }}>
                      {price ? `${up ? "+" : ""}${changePct.toFixed(2)}%` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : topStocks.length > 0 && Object.keys(backendQuotes).length > 0 ? (
          <div style={{ ...glass, padding: 22 }}>
            <div style={{
              fontFamily: mono, fontSize: 10,
              color: "rgba(0,180,255,0.45)", letterSpacing: "0.10em",
              marginBottom: 16,
            }}>
              TOP MOVERS
            </div>
            {topStocks.map((ticker, i) => {
              const q = backendQuotes[ticker];
              const price = q?.price || 0;
              const changePct = q?.changePercent || 0;
              const up = changePct >= 0;
              return (
                <div
                  key={ticker}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0",
                    borderBottom: i < topStocks.length - 1
                      ? "1px solid rgba(0,180,255,0.07)" : "none",
                  }}
                >
                  <span style={{ fontFamily: mono, fontSize: 12, color: "rgba(180,210,255,0.45)", width: 40, flexShrink: 0 }}>
                    {ticker}
                  </span>
                  <Sparkline data={sparklines[ticker] ?? [{ t: 0, c: 0 }]} up={up} />
                  <div style={{ textAlign: "right", width: 64, flexShrink: 0 }}>
                    <div style={{ fontFamily: mono, fontSize: 13, color: "rgba(220,240,255,0.85)" }}>
                      {price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: up ? "#00d282" : "#ff5064" }}>
                      {price ? `${up ? "+" : ""}${changePct.toFixed(2)}%` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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
        )}

        {/* Top Signals — dynamic from backend, fallback to static */}
        <div style={{ ...glass, padding: 22 }}>
          <div style={{
            fontFamily: mono, fontSize: 10,
            color: "rgba(0,180,255,0.45)", letterSpacing: "0.10em",
            marginBottom: 16,
          }}>
            TOP SIGNALS TODAY
          </div>
          {topSignals.length > 0 ? topSignals.map((s, i) => {
            const color = SIGNAL_TYPE_COLORS[s.type] || "#00d4ff";
            const bgTint = s.type === "BULLISH" ? "rgba(0,210,130,0.05)" : "rgba(255,80,100,0.05)";
            const bgHover = s.type === "BULLISH" ? "rgba(0,210,130,0.10)" : "rgba(255,80,100,0.10)";
            const borderTint = s.type === "BULLISH" ? "rgba(0,210,130,0.15)" : "rgba(255,80,100,0.15)";
            return (
              <div
                key={i}
                style={{
                  padding: "11px 13px", marginBottom: 7,
                  background: bgTint,
                  borderRadius: 8, border: `1px solid ${borderTint}`,
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = bgHover)}
                onMouseLeave={e => (e.currentTarget.style.background = bgTint)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color, fontWeight: 500 }}>
                    {s.ticker}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 9, color, letterSpacing: "0.08em", opacity: 0.6 }}>
                    {s.type} {s.sentiment > 0 ? `+${s.sentiment}` : s.sentiment}
                  </span>
                </div>
                <span style={{ fontFamily: sans, fontSize: 12, color: "rgba(180,210,255,0.55)", lineHeight: 1.5 }}>
                  {s.headline}
                </span>
              </div>
            );
          }) : FALLBACK_SIGNALS.map((s, i) => (
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