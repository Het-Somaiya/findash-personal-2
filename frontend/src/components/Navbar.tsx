import { useState, useEffect, useRef } from "react";
import { searchTickers } from "../lib/api";
import { SearchPanel, ASSET_DB } from "./SearchPanel";
import { useAuth } from "../context/AuthContext";

const SEARCH_SUGGESTIONS = ["NVDA", "SPY options flow", "AAPL 10-K risks", "S&P 500 positioning", "VIX term structure", "iron condor strategy"];
const TYPE_BADGE = {
  stock:  { label: "STK", color: "rgba(0,180,255,0.65)"   },
  etf:    { label: "ETF", color: "rgba(0,210,130,0.75)"   },
  index:  { label: "IDX", color: "rgba(255,180,0,0.75)"   },
  crypto: { label: "CRY", color: "rgba(167,139,250,0.75)" },
};

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

export function Navbar({ onLoginClick, onRegisterClick }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navbarRef = useRef(null);
  const blurTimer = useRef();

  const [query, setQuery] = useState("");
  const [suggIdx, setSuggIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setSuggIdx(i => (i + 1) % SEARCH_SUGGESTIONS.length), 2800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let cancelled = false;
    searchTickers(query).then(r => { if (!cancelled) setResults(r); });
    return () => { cancelled = true; };
  }, [query]);

  const handleSelect = (symbol) => {
    const key = symbol.toUpperCase();
    const asset = ASSET_DB[key] ?? null;
    setSelectedAsset(asset);
    setQuery(symbol);
    setFocused(false);
  };

  return (
    <nav ref={navbarRef} style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 32px", height: 60, display: "flex", alignItems: "center", gap: 28,
        background: scrolled ? "rgba(3,13,26,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(0,180,255,0.10)" : "none",
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #00d4ff, #0055ee)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: mono, fontSize: 14, color: "#fff", fontWeight: 500 }}>F</span>
        </div>
        <span style={{ fontFamily: serif, fontSize: 18, color: "#e0f0ff" }}>FinDash</span>
      </div>

      <div style={{ flex: 1, maxWidth: 460, margin: "0 auto", position: "relative" }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedAsset(null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 160); }}
          placeholder={`Search — try "${SEARCH_SUGGESTIONS[suggIdx]}"`}
          style={{
            width: "100%", height: 37, paddingLeft: 36, background: "rgba(255,255,255,0.05)",
            border: focused ? "1px solid rgba(0,180,255,0.50)" : "1px solid rgba(0,180,255,0.18)",
            borderRadius: 10, color: "#e0f0ff", fontSize: 13, outline: "none",
          }}
        />
        {selectedAsset && <SearchPanel asset={selectedAsset} onClose={() => { setSelectedAsset(null); setQuery(""); }} navbarRef={navbarRef} />}
      </div>

      <div style={{ display: "flex", gap: 22, alignItems: "center", flexShrink: 0 }}>
        {["Markets", "Strategies"].map(l => (
          <span key={l} style={{ color: "rgba(200,225,255,0.55)", fontFamily: sans, fontSize: 13, cursor: "pointer" }}>{l}</span>
        ))}

        {isAuthenticated ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ 
              display: "flex", flexDirection: "column", alignItems: "flex-end", 
              borderRight: "1px solid rgba(0,180,255,0.2)", paddingRight: 16 
            }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.1em" }}>TERMINAL_ID</span>
              <span style={{ fontFamily: sans, fontSize: 13, color: "#fff", fontWeight: 500 }}>{user?.username}</span>
            </div>
            <span
              onClick={logout}
              style={{ color: "rgba(255,77,77,0.7)", fontFamily: sans, fontSize: 13, cursor: "pointer" }}
            >
              Logout
            </span>
          </div>
        ) : (
          <>
            <span onClick={onLoginClick} style={{ color: "rgba(200,225,255,0.55)", fontFamily: sans, fontSize: 13, cursor: "pointer" }}>
              Sign In
            </span>
            <button 
              onClick={onRegisterClick}
              style={{ padding: "7px 18px", borderRadius: 8, background: "rgba(0,180,255,0.14)", border: "1px solid rgba(0,180,255,0.35)", color: "#00d4ff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
            >
              Register Free
            </button>
          </>
        )}
      </div>
    </nav>
  );
}