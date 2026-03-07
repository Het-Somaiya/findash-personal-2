const NEWS = [
  {
    id: 1,
    headline: "Fed signals patience on rate cuts as inflation data remains sticky",
    source: "Reuters",
    time: "14m ago",
    sentiment: "negative",
    tickers: ["SPY", "TLT"],
  },
  {
    id: 2,
    headline: "NVIDIA surpasses $3T market cap on sustained data center demand",
    source: "Bloomberg",
    time: "31m ago",
    sentiment: "positive",
    tickers: ["NVDA"],
  },
  {
    id: 3,
    headline: "Apple explores AI partnerships to accelerate on-device model capabilities",
    source: "WSJ",
    time: "52m ago",
    sentiment: "positive",
    tickers: ["AAPL"],
  },
  {
    id: 4,
    headline: "Oil futures slide as OPEC+ production agreement faces internal dissent",
    source: "FT",
    time: "1h ago",
    sentiment: "negative",
    tickers: ["USO", "XOM"],
  },
  {
    id: 5,
    headline: "Treasury yield curve steepens ahead of next week's auction schedule",
    source: "Reuters",
    time: "1h ago",
    sentiment: "mixed",
    tickers: ["TLT", "IEF"],
  },
  {
    id: 6,
    headline: "Microsoft Azure revenue growth re-accelerates, beating analyst estimates",
    source: "Bloomberg",
    time: "2h ago",
    sentiment: "positive",
    tickers: ["MSFT"],
  },
  {
    id: 7,
    headline: "Regional bank index diverges from broader financials on deposit flow data",
    source: "FT",
    time: "2h ago",
    sentiment: "mixed",
    tickers: ["KRE", "XLF"],
  },
];

const SENTIMENT_MAP = {
  positive: { bg: "rgba(0,210,130,0.15)", color: "#00d282" },
  negative: { bg: "rgba(255,80,100,0.15)", color: "#ff5064" },
  mixed: { bg: "rgba(255,180,0,0.12)", color: "#ffb800" },
};

function SentimentBadge({ s }) {
  const { bg, color } = SENTIMENT_MAP[s];
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        padding: "2px 7px",
        borderRadius: 3,
        letterSpacing: "0.05em",
        border: `1px solid ${color}30`,
        flexShrink: 0,
      }}
    >
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

const glass = {
  background: "rgba(8, 20, 36, 0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(0, 180, 255, 0.14)",
};

export default function NewsFeed() {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          marginBottom: 22,
        }}
      >
        <h2
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 24,
            color: "#e0f0ff",
          }}
        >
          Market Intelligence
        </h2>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "rgba(0,180,255,0.45)",
            letterSpacing: "0.08em",
          }}
        >
          REFRESHED 4M AGO
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NEWS.map((n, i) => (
          <div
            key={n.id}
            className="news-item"
            style={{
              ...glass,
              borderRadius:
                i === 0
                  ? "16px 16px 8px 8px"
                  : i === NEWS.length - 1
                  ? "8px 8px 16px 16px"
                  : 8,
              padding: i === 0 ? "20px 22px" : "15px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderColor:
                i === 0
                  ? "rgba(0,180,255,0.24)"
                  : "rgba(0,180,255,0.1)",
              background:
                i === 0
                  ? "rgba(0,28,58,0.65)"
                  : "rgba(8,20,36,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <SentimentBadge s={n.sentiment} />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(180,210,255,0.32)",
                  letterSpacing: "0.05em",
                }}
              >
                {n.source}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(180,210,255,0.22)",
                }}
              >
                ·
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(180,210,255,0.32)",
                }}
              >
                {n.time}
              </span>
              <div
                style={{ marginLeft: "auto", display: "flex", gap: 5 }}
              >
                {n.tickers.map((t) => (
                  <span
                    key={t}
                    className="tag-pill"
                    style={{
                      background: "rgba(0,180,255,0.09)",
                      border: "1px solid rgba(0,180,255,0.18)",
                      borderRadius: 4,
                      padding: "1px 7px",
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "rgba(0,180,255,0.75)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <p
              style={{
                fontFamily:
                  i === 0
                    ? "'DM Serif Display', serif"
                    : "'DM Sans', sans-serif",
                fontSize: i === 0 ? 19 : 14,
                color:
                  i === 0 ? "#eaf4ff" : "rgba(180,210,255,0.75)",
                lineHeight: 1.45,
              }}
            >
              {n.headline}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
