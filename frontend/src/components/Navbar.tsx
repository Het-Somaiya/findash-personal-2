import { useState, useEffect, useRef } from "react";
import { searchTickers, type TickerSuggestion } from "../lib/api";
import { SearchPanel, ASSET_DB, type AssetData } from "./SearchPanel";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

async function fetchAsset(symbol: string): Promise<AssetData | null> {
  try {
    const res = await fetch(`${BACKEND_BASE}/api/asset/?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return ASSET_DB[symbol.toUpperCase()] ?? null;
  }
}

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
  const navbarRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  const [query,         setQuery]         = useState("");
  const [suggIdx,       setSuggIdx]       = useState(0);
  const [focused,       setFocused]       = useState(false);
  const [scrolled,      setScrolled]      = useState(false);
  const [results,       setResults]       = useState<TickerSuggestion[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetData | null>(null);

  // Cycle placeholder text
  useEffect(() => {
    const id = setInterval(() => setSuggIdx(i => (i + 1) % SEARCH_SUGGESTIONS.length), 2800);
    return () => clearInterval(id);
  }, []);

  // Scroll-triggered navbar + vignette
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > window.innerHeight * 0.85);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  // Live ticker search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let cancelled = false;
    searchTickers(query).then(r => { if (!cancelled) setResults(r); });
    return () => { cancelled = true; };
  }, [query]);

  // When a ticker is selected from the dropdown, load the asset card
  const handleSelect = (symbol: string) => {
    const key = symbol.toUpperCase();
    // Show mock immediately if available so the panel opens instantly
    setSelectedAsset(ASSET_DB[key] ?? ({ ticker: key, name: key, type: "STOCK", sector: "—",
      price: 0, change: 0, changePct: 0, up: true, volume: "—", avgVolume: "—", volRatio: 1,
      marketCap: "—", pe: null, forwardPe: null, peg: null, eps: null, revenueGrowth: null,
      revenueGrowthQoQ: null, week52High: 0, week52Low: 0, week52Pos: 50, nextEarnings: null,
      rsi: 50, beta: 1, shortFloatPct: null, daysToCover: null, institutionalOwnership: 0,
      insiderActivity: "neutral", insiderNet: 0, dividendYield: null, freeCashFlow: null,
      description: "", chartSeed: 0, chartTrend: 0,
    } as AssetData));
    setQuery(symbol);
    setFocused(false);
    clearTimeout(blurTimer.current);
    // Fetch real data and replace
    fetchAsset(key).then(data => { if (data) setSelectedAsset(data); });
  };

  const showDropdown = focused && !selectedAsset && (results.length > 0 || query === "");

  const dropdownItems: TickerSuggestion[] = results.length > 0 ? results : [
    { symbol: "NVDA", name: "NVIDIA Corporation",   type: "stock", exchange: "NASDAQ" },
    { symbol: "SPY",  name: "SPDR S&P 500 ETF",     type: "etf",   exchange: "NYSE"   },
    { symbol: "QQQ",  name: "Invesco QQQ Trust",     type: "etf",   exchange: "NASDAQ" },
    { symbol: "TSLA", name: "Tesla, Inc.",           type: "stock", exchange: "NASDAQ" },
    { symbol: "VIX",  name: "CBOE Volatility Index", type: "index", exchange: "CBOE"   },
  ];

  return (
    <>
      {/* Vignette overlay — top corners darken when scrolled past the globe */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 320,
        zIndex: 99, pointerEvents: "none",
        opacity: scrolled ? 1 : 0,
        transition: "opacity 0.5s ease",
        background: [
          "radial-gradient(ellipse 52vw 320px at 0% 0%, rgba(4,6,12,0.82) 0%, transparent 65%)",
          "radial-gradient(ellipse 52vw 320px at 100% 0%, rgba(4,6,12,0.82) 0%, transparent 65%)",
          "linear-gradient(to bottom, rgba(4,6,12,0.30) 0%, transparent 38%)",
        ].join(", "),
      }} />

    <nav
      ref={navbarRef}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 40px", height: 72,
        display: "flex", alignItems: "center", gap: 28,
        background: scrolled ? "rgba(6,8,14,0.88)" : "transparent",
        backdropFilter: scrolled ? "blur(3px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(3px)" : "none",
        transition: "background 0.5s ease, backdrop-filter 0.5s ease",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
        {/* Logo icon hidden */}
        <span style={{ fontFamily: serif, fontSize: 18, color: "#e0f0ff", letterSpacing: "0.01em" }}>
          FinDash
        </span>
      </div>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 460, margin: "0 auto", position: "relative" }}>
        <span style={{
          position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)",
          color: "rgba(0,180,255,0.45)", fontSize: 14, pointerEvents: "none",
          zIndex: 1,
        }}>⌕</span>

        <input
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setSelectedAsset(null); // clear card when user starts typing again
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 160); }}
          placeholder={`Search — try "${SEARCH_SUGGESTIONS[suggIdx]}"`}
          style={{
            width: "100%", height: 37,
            paddingLeft: 36, paddingRight: 14,
            background: "rgba(255,255,255,0.05)",
            border: focused || selectedAsset
              ? "1px solid rgba(0,180,255,0.50)"
              : "1px solid rgba(0,180,255,0.18)",
            boxShadow: focused || selectedAsset
              ? "0 0 0 3px rgba(0,180,255,0.08)"
              : "none",
            borderRadius: 10, color: "#e0f0ff",
            fontSize: 13, fontFamily: sans,
            outline: "none", transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        />

        {/* Autocomplete dropdown — shown while typing, before asset is selected */}
        {showDropdown && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
            background: "rgba(8,10,18,0.97)",
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
                    onMouseDown={() => handleSelect(item.symbol)}
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

        {/* Asset card panel — shown after a ticker is selected */}
        {selectedAsset && (
          <SearchPanel
            asset={selectedAsset}
            onClose={() => { setSelectedAsset(null); setQuery(""); }}
            navbarRef={navbarRef}
          />
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
        <span
          style={{
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
    </>
  );
}
