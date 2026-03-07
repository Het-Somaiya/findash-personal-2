import { useState, useEffect } from "react";

const SUGGESTIONS = [
  "NVDA",
  "SPY options flow",
  "AAPL 10-K risks",
  "S&P 500 positioning",
  "VIX term structure",
];

export default function Navbar() {
  const [query, setQuery] = useState("");
  const [suggIdx, setSuggIdx] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const id = setInterval(
      () => setSuggIdx((i) => (i + 1) % SUGGESTIONS.length),
      2800
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "0 32px",
        height: 60,
        display: "flex",
        alignItems: "center",
        gap: 28,
        background: scrolled ? "rgba(3,13,26,0.94)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled
          ? "1px solid rgba(0,180,255,0.1)"
          : "none",
        transition: "all 0.3s ease",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            background: "linear-gradient(135deg, #00d4ff, #0055ee)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 12px rgba(0,180,255,0.35)",
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: "#fff",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
            }}
          >
            F
          </span>
        </div>
        <span
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 18,
            color: "#e0f0ff",
            letterSpacing: "0.01em",
          }}
        >
          FinDash
        </span>
      </div>

      {/* Search */}
      <div
        style={{
          flex: 1,
          maxWidth: 460,
          margin: "0 auto",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 13,
            top: "50%",
            transform: "translateY(-50%)",
            color: "rgba(0,180,255,0.45)",
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          ⌕
        </span>
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search — try "${SUGGESTIONS[suggIdx]}"`}
          style={{
            width: "100%",
            height: 37,
            paddingLeft: 36,
            paddingRight: 14,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(0,180,255,0.18)",
            borderRadius: 10,
            color: "#e0f0ff",
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            outline: "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        />
      </div>

      {/* Nav links */}
      <div
        style={{
          display: "flex",
          gap: 22,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {["Markets", "Strategies"].map((l) => (
          <span
            key={l}
            className="nav-link"
            style={{
              color: "rgba(200,225,255,0.55)",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >
            {l}
          </span>
        ))}
        <span
          className="nav-link"
          style={{
            color: "rgba(200,225,255,0.55)",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Sign In
        </span>
        <button
          className="register-btn-primary"
          style={{
            padding: "7px 18px",
            borderRadius: 8,
            background: "rgba(0,180,255,0.14)",
            border: "1px solid rgba(0,180,255,0.35)",
            color: "#00d4ff",
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          Register Free
        </button>
      </div>
    </nav>
  );
}
