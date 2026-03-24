import { useState, useEffect, useRef } from "react";
import { searchTickers, type TickerSuggestion } from "../lib/api";

const SEARCH_SUGGESTIONS = [
  "NVDA",
  "SPY options flow",
  "AAPL 10-K risks",
  "S&P 500 positioning",
  "VIX term structure",
  "iron condor strategy",
];

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  stock:  { label: "STK", color: "rgba(0,180,255,0.65)"   },
  etf:    { label: "ETF", color: "rgba(0,210,130,0.75)"   },
  index:  { label: "IDX", color: "rgba(255,180,0,0.75)"   },
  crypto: { label: "CRY", color: "rgba(167,139,250,0.75)" },
};

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

export function Navbar() {
  const [query,    setQuery]    = useState("");
  const [suggIdx,  setSuggIdx]  = useState(0);
  const [focused,  setFocused]  = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [results,  setResults]  = useState<TickerSuggestion[]>([]);
  const blurTimer              = useRef<ReturnType<typeof setTimeout>>();

  // Cycle placeholder text
  useEffect(() => {
    const id = setInterval(() => setSuggIdx(i => (i + 1) % SEARCH_SUGGESTIONS.length), 2800);
    return () => clearInterval(id);
  }, []);

  // Scroll-triggered navbar style
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  // Live ticker search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let cancelled = false;
    searchTickers(query).then(r => { if (!cancelled) setResults(r); });
    return () => { cancelled = true; };
  }, [query]);

  const showDropdown = focused && (results.length > 0 || query === "");
  const dropdownItems: TickerSuggestion[] = results.length > 0 ? results : [
    { symbol: "NVDA", name: "NVIDIA Corporation",   type: "stock", exchange: "NASDAQ" },
    { symbol: "SPY",  name: "SPDR S&P 500 ETF",     type: "etf",   exchange: "NYSE"   },
    { symbol: "QQQ",  name: "Invesco QQQ Trust",     type: "etf",   exchange: "NASDAQ" },
    { symbol: "TSLA", name: "Tesla, Inc.",           type: "stock", exchange: "NASDAQ" },
    { symbol: "VIX",  name: "CBOE Volatility Index", type: "index", exchange: "CBOE"   },
  ];

  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 32px", height: 60,
        display: "flex", alignItems: "center", gap: 28,
        background: scrolled ? "rgba(3,13,26,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(0,180,255,0.10)" : "none",
        transition: "all 0.3s ease",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: "linear-gradient(135deg, #00d4ff, #0055ee)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 12px rgba(0,180,255,0.35)",
        }}>
          <span style={{ fontFamily: mono, fontSize: 14, color: "#fff", fontWeight: 500 }}>F</span>
        </div>
        <span style={{ fontFamily: serif, fontSize: 18, color: "#e0f0ff", letterSpacing: "0.01em" }}>
          FinDash
        </span>
      </div>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 460, margin: "0 auto", position: "relative" }}>
        <span style={{
          position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
          color: "rgba(0,180,255,0.45)", fontSize: 14, pointerEvents: "none",
        }}>⌕</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 160); }}
          placeholder={`Search — try "${SEARCH_SUGGESTIONS[suggIdx]}"`}
          style={{
            width: "100%", height: 37,
            paddingLeft: 36, paddingRight: 14,
            background: "rgba(255,255,255,0.05)",
            border: focused ? "1px solid rgba(0,180,255,0.50)" : "1px solid rgba(0,180,255,0.18)",
            boxShadow: focused ? "0 0 0 3px rgba(0,180,255,0.08)" : "none",
            borderRadius: 10, color: "#e0f0ff",
            fontSize: 13, fontFamily: sans,
            outline: "none", transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        />

        {/* Dropdown */}
        {showDropdown && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
            background: "rgba(4,14,30,0.97)",
            backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0,180,255,0.18)",
            borderRadius: 12, overflow: "hidden",
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            zIndex: 200,
            animation: "fadeDown 0.14s ease both",
          }}>
            <div style={{ padding: "8px 0" }}>
              <div style={{
                padding: "4px 14px 8px",
                fontFamily: mono, fontSize: 9,
                color: "rgba(0,180,255,0.4)", letterSpacing: "0.12em",
              }}>
                {query ? "RESULTS" : "POPULAR"}
              </div>
              {dropdownItems.map(item => {
                const badge = TYPE_BADGE[item.type] ?? TYPE_BADGE.stock;
                return (
                  <button
                    key={item.symbol}
                    onMouseDown={() => {
                      setQuery(item.symbol);
                      setFocused(false);
                      clearTimeout(blurTimer.current);
                    }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      gap: 10, padding: "9px 14px",
                      background: "transparent", border: "none", cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.07)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontFamily: mono, fontSize: 12, color: "#00d4ff", fontWeight: 500, minWidth: 46, textAlign: "left" }}>
                      {item.symbol}
                    </span>
                    <span style={{ fontFamily: sans, fontSize: 12, color: "rgba(180,210,255,0.45)", flex: 1, textAlign: "left" }}>
                      {item.name}
                    </span>
                    <span style={{
                      fontFamily: mono, fontSize: 9, letterSpacing: "0.06em",
                      color: badge.color, padding: "1px 5px",
                      border: `1px solid ${badge.color.replace(/[\d.]+\)$/, "0.25)")}`,
                      borderRadius: 3,
                    }}>
                      {badge.label}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(180,210,255,0.25)" }}>
                      {item.exchange}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right nav */}
      <div style={{ display: "flex", gap: 22, alignItems: "center", flexShrink: 0 }}>
        {["Markets", "Strategies"].map(l => (
          <span
            key={l}
            style={{
              color: "rgba(200,225,255,0.55)", fontFamily: sans,
              fontSize: 13, cursor: "pointer", letterSpacing: "0.02em",
              transition: "color 0.2s",
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLSpanElement).style.color = "rgba(200,225,255,0.9)")}
            onMouseLeave={e => ((e.currentTarget as HTMLSpanElement).style.color = "rgba(200,225,255,0.55)")}
          >
            {l}
          </span>
        ))}
        <span style={{
          color: "rgba(200,225,255,0.55)", fontFamily: sans,
          fontSize: 13, cursor: "pointer", transition: "color 0.2s",
        }}
          onMouseEnter={e => ((e.currentTarget as HTMLSpanElement).style.color = "rgba(200,225,255,0.9)")}
          onMouseLeave={e => ((e.currentTarget as HTMLSpanElement).style.color = "rgba(200,225,255,0.55)")}
        >
          Sign In
        </span>
        <button
          style={{
            padding: "7px 18px", borderRadius: 8,
            background: "rgba(0,180,255,0.14)",
            border: "1px solid rgba(0,180,255,0.35)",
            color: "#00d4ff", fontSize: 13, fontFamily: sans,
            fontWeight: 500, cursor: "pointer", transition: "background 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.28)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.14)")}
        >
          Register Free
        </button>
      </div>
    </nav>
  );
}
