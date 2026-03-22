import { useState } from "react";


const SIGNAL_COLORS = {
  BULLISH: "#00d282",
  BEARISH: "#ff5064",
};

const glass = {
  background: "rgba(8, 20, 36, 0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(0, 180, 255, 0.14)",
  borderRadius: 16,
};

export default function Sidebar({ activeTickers = null, quotes = {}, topStocks = [], topSignals = [] }) {
  const [chatHint, setChatHint] = useState(true);

  const isHovering = activeTickers !== null;
  const displayTickers = isHovering ? activeTickers : topStocks;
  const sectionTitle = isHovering ? "IMPACTED STOCKS" : "TOP MOVERS";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Impacted stocks or top movers */}
      <div style={{ ...glass, padding: 20 }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "rgba(0,180,255,0.45)",
            letterSpacing: "0.1em",
            marginBottom: 14,
          }}
        >
          {sectionTitle}
        </div>
        {displayTickers.length > 0 ? (
          displayTickers.map((ticker, i) => {
            const q = quotes[ticker];
            const price = q?.price || 0;
            const changePct = q?.changePercent || 0;
            const up = changePct >= 0;
            return (
              <div
                key={ticker}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 0",
                  borderBottom:
                    i < displayTickers.length - 1
                      ? "1px solid rgba(0,180,255,0.07)"
                      : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    color: "rgba(180,210,255,0.45)",
                  }}
                >
                  {ticker}
                </span>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13,
                      color: "rgba(220,240,255,0.85)",
                    }}
                  >
                    {price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      color: up ? "#00d282" : "#ff5064",
                    }}
                  >
                    {price ? `${up ? "+" : ""}${changePct.toFixed(2)}%` : ""}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: "rgba(180,210,255,0.35)",
            }}
          >
            Hover over a headline to see impacted stocks
          </span>
        )}
      </div>

      {/* Top signals */}
      <div style={{ ...glass, padding: 20 }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "rgba(0,180,255,0.45)",
            letterSpacing: "0.1em",
            marginBottom: 14,
          }}
        >
          TOP SIGNALS TODAY
        </div>
        {topSignals.map((s, i) => (
          <div
            key={i}
            className="signal-card"
            style={{
              padding: "10px 12px",
              marginBottom: 6,
              background: s.type === "BULLISH" ? "rgba(0,210,130,0.05)" : "rgba(255,80,100,0.05)",
              borderRadius: 8,
              border: `1px solid ${s.type === "BULLISH" ? "rgba(0,210,130,0.15)" : "rgba(255,80,100,0.15)"}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: SIGNAL_COLORS[s.type] || "#00d4ff",
                  fontWeight: 500,
                }}
              >
                {s.ticker}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: SIGNAL_COLORS[s.type] || "rgba(0,180,255,0.38)",
                  letterSpacing: "0.08em",
                  opacity: 0.6,
                }}
              >
                {s.type} {s.sentiment > 0 ? `+${s.sentiment}` : s.sentiment}
              </span>
            </div>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: "rgba(180,210,255,0.55)",
                lineHeight: 1.4,
              }}
            >
              {s.headline}
            </span>
          </div>
        ))}
      </div>

      {/* AI chatbot hint */}
      {chatHint && (
        <div style={{ ...glass, padding: 18, position: "relative" }}>
          <button
            onClick={() => setChatHint(false)}
            style={{
              position: "absolute",
              top: 10,
              right: 14,
              background: "none",
              border: "none",
              color: "rgba(180,210,255,0.28)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#00d4ff",
                boxShadow: "0 0 6px #00d4ff",
                animation: "pulse 2s infinite",
              }}
            />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: "#00d4ff",
                letterSpacing: "0.08em",
              }}
            >
              AI ASSISTANT ACTIVE
            </span>
          </div>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12.5,
              color: "rgba(180,210,255,0.55)",
              lineHeight: 1.55,
              marginBottom: 12,
            }}
          >
            Ask about any market, ticker, or concept. No login required on
            the free tier.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {["What is IV percentile?", "Explain GEX", "Why is VIX falling?"].map(
              (q) => (
                <span
                  key={q}
                  className="tag-pill"
                  style={{
                    background: "rgba(0,180,255,0.07)",
                    border: "1px solid rgba(0,180,255,0.14)",
                    borderRadius: 5,
                    padding: "3px 9px",
                    fontSize: 11,
                    fontFamily: "'DM Sans', sans-serif",
                    color: "rgba(0,180,255,0.65)",
                    cursor: "pointer",
                  }}
                >
                  {q}
                </span>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
