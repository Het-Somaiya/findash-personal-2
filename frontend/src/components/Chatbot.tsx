import { useState, useRef, useEffect } from "react";

interface Message {
  role: "bot" | "user";
  text: string;
}

const INITIAL: Message[] = [
  {
    role: "bot",
    text: "Ask me anything about markets, options, or a specific ticker. I can explain concepts, interpret what you see on the surface, or walk you through platform features. This is not financial advice.",
  },
];

const QUICK = ["What is this surface?", "Explain GEX", "What's IV percentile?", "Why is VIX falling?"];

function getReply(q: string): string {
  const t = q.toLowerCase();
  if (t.includes("surface") || t.includes("3d") || t.includes("what is this"))
    return "The 3D surface is a live SPY/SPX options positioning map. The X-axis is strike price, the Z-axis is expiration (DTE), and the height represents dealer gamma exposure (GEX). Peaks show positive gamma zones where market makers hedge by buying rallies and selling dips — suppressing volatility. This is not financial advice.";
  if (t.includes("gex") || t.includes("gamma"))
    return "Gamma Exposure (GEX) is the aggregate delta-hedging pressure from market makers' options books. Positive GEX zones act as price gravity — the market tends to gravitate toward them. Negative GEX zones can amplify moves as dealers hedge in the same direction as price. This is not financial advice.";
  if (t.includes("iv percentile") || t.includes("implied vol"))
    return "IV Percentile tells you where current implied volatility sits relative to the past 52 weeks. An IV Percentile of 80 means IV is higher than 80% of all readings over the past year — options are expensive relative to recent history. Options sellers typically prefer high IV percentile setups. This is not financial advice.";
  if (t.includes("vix") || t.includes("fear"))
    return "VIX (CBOE Volatility Index) measures 30-day implied volatility of S&P 500 options. When VIX falls, options traders are paying less for protection — often reflecting reduced near-term uncertainty. At 14.23 it's below the historical median (~17), suggesting a relatively calm environment. This is not financial advice.";
  if (t.includes("free") || t.includes("cost") || t.includes("what do i get"))
    return "The free tier gives you: the live 3D options surface, real-time quotes, the news intelligence feed, and this AI assistant. Authenticated features (free to register) unlock historical simulation, GraphRAG filing analysis, strategy backtesting, and custom signal alerts.";
  if (t.includes("filing") || t.includes("10-k") || t.includes("sec") || t.includes("edgar"))
    return "FinDash's authenticated AI reads 10-K and 10-Q filings from EDGAR using a GraphRAG knowledge graph. You can ask plain-language questions — 'What are NVDA's stated supply chain risks?' — and get answers cited to the exact filing section. This is not financial advice.";
  if (t.includes("simulation") || t.includes("history") || t.includes("backtest"))
    return "Historical simulation lets you pick any past date and operate as if it were today — with only the data that existed then. Once you've made your decisions, you reveal what actually happened and get a debrief on signals you missed. It's the closest thing to a flight simulator for financial decision-making.";
  if (t.includes("strategy") || t.includes("condor") || t.includes("straddle") || t.includes("spread"))
    return "The authenticated strategy builder lets you model multi-leg options structures — straddles, iron condors, butterflies, calendar spreads — with full P&L diagrams and Greeks. Define strategies using relative parameters (delta, IV percentile thresholds) so the same logic applies across any underlying. This is not financial advice.";
  return "Great question. FinDash surfaces market structure in a way most platforms don't — from the 3D options positioning surface to filing intelligence grounded in EDGAR documents. Is there a specific feature, concept, or market question I can help with? This is not financial advice.";
}

const sans = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

export function Chatbot() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pulse,    setPulse]    = useState(true);
  const bottomRef              = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 10000);
    return () => clearTimeout(t);
  }, []);

  const send = (q?: string) => {
    const text = (q ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setLoading(true);
    setTimeout(() => {
      setMessages(m => [...m, { role: "bot", text: getReply(text) }]);
      setLoading(false);
    }, 700 + Math.random() * 500);
  };

  const glass = {
    background: "rgba(8,18,32,0.97)",
    border: "1px solid rgba(0,180,255,0.20)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };

  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 1000 }}>

      {/* Chat window */}
      {open && (
        <div style={{
          position: "absolute", bottom: 68, right: 0, width: 344,
          ...glass, borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          animation: "fadeUp 0.22s ease both",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px",
            borderBottom: "1px solid rgba(0,180,255,0.10)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div
              className="dot-pulse"
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#00d4ff", boxShadow: "0 0 6px #00d4ff",
              }}
            />
            <span style={{ fontFamily: sans, fontSize: 13, color: "#e0f0ff", fontWeight: 500 }}>
              FinDash AI
            </span>
            <span style={{
              marginLeft: "auto", fontFamily: mono, fontSize: 10,
              color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em",
            }}>
              FREE TIER
            </span>
          </div>

          {/* Messages */}
          <div style={{
            height: 270, overflowY: "auto",
            padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 10,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(0,180,255,0.2) transparent",
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "82%", padding: "9px 13px",
                  borderRadius: m.role === "user"
                    ? "12px 12px 3px 12px"
                    : "12px 12px 12px 3px",
                  background: m.role === "user"
                    ? "rgba(0,180,255,0.20)"
                    : "rgba(255,255,255,0.05)",
                  border: `1px solid ${m.role === "user" ? "rgba(0,180,255,0.30)" : "rgba(255,255,255,0.08)"}`,
                  fontSize: 12.5, color: "#cce4ff",
                  fontFamily: sans, lineHeight: 1.55,
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: "flex", gap: 5, padding: "6px 2px", alignItems: "center" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "#00d4ff",
                    animation: `typing-bounce 1.2s ${i * 0.18}s infinite`,
                  }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts — show on first view */}
          {messages.length <= 2 && !loading && (
            <div style={{ padding: "4px 14px 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{
                    background: "rgba(0,180,255,0.07)",
                    border: "1px solid rgba(0,180,255,0.15)",
                    borderRadius: 5, padding: "3px 9px",
                    fontSize: 11, fontFamily: sans,
                    color: "rgba(0,180,255,0.65)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(0,180,255,0.16)";
                    e.currentTarget.style.color = "#00d4ff";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "rgba(0,180,255,0.07)";
                    e.currentTarget.style.color = "rgba(0,180,255,0.65)";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: "10px 14px",
            borderTop: "1px solid rgba(0,180,255,0.10)",
            display: "flex", gap: 8,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask about any ticker or concept..."
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(0,180,255,0.15)",
                borderRadius: 8, padding: "8px 12px",
                color: "#e0f0ff", fontSize: 12.5,
                fontFamily: sans, outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(0,180,255,0.45)")}
              onBlur={e  => (e.target.style.borderColor = "rgba(0,180,255,0.15)")}
            />
            <button
              onClick={() => send()}
              style={{
                background: "rgba(0,180,255,0.20)",
                border: "1px solid rgba(0,180,255,0.30)",
                borderRadius: 8, padding: "8px 13px",
                color: "#00d4ff", cursor: "pointer", fontSize: 15,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.32)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.20)")}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <div style={{ position: "relative" }}>
        {/* Pulse ring */}
        {pulse && !open && (
          <div style={{
            position: "absolute", inset: -4, borderRadius: "50%",
            border: "1px solid rgba(0,212,255,0.45)",
            animation: "badge-glow 2s infinite",
            pointerEvents: "none",
          }} />
        )}
        {/* Notification badge */}
        {!open && (
          <div style={{
            position: "absolute", top: -4, right: -4,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ff5064", border: "2px solid #030d1a",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: sans, fontSize: 9, color: "#fff", fontWeight: 700,
            zIndex: 1,
          }}>1</div>
        )}
        <button
          onClick={() => { setOpen(o => !o); setPulse(false); }}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            background: open ? "rgba(0,180,255,0.30)" : "rgba(0,180,255,0.15)",
            border: "1px solid rgba(0,180,255,0.40)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(0,180,255,0.25)",
            backdropFilter: "blur(10px)",
            fontSize: 20, color: "#00d4ff",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 30px rgba(0,180,255,0.45)")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 0 20px rgba(0,180,255,0.25)")}
        >
          {open ? "×" : "✦"}
        </button>
      </div>
    </div>
  );
}
