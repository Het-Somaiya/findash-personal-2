import { OptionsSurface }      from "./OptionsSurface";
import { GreeksScatter3D }     from "./GreeksScatter3D";
import { LandingMarketGlobe }  from "./MarketGlobe";

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

interface HeroSectionProps {
  onExploreClick?: () => void;
}

export function HeroSection({ onExploreClick }: HeroSectionProps) {
  return (
    <section style={{
      position: "relative",
      height: "100vh",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>

      {/* Layer 0a: MarketGlobe — fills the hero background */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <LandingMarketGlobe />
      </div>

      {/* Layer 0b: Three.js surface — background, dim */}
      <OptionsSurface />

      {/* Layer 1: Greeks scatter — fills hero, glowing bokeh dots */}
      <GreeksScatter3D />

      {/* Layer 2: Radial gradient — light so both layers show */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 2,
        background: "radial-gradient(ellipse at center, rgba(3,13,26,0.10) 0%, rgba(3,13,26,0.55) 85%)",
        pointerEvents: "none",
      }} />

      {/* Layer 3: Bottom fade into content */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
        background: "linear-gradient(to top, #030d1a 0%, transparent 100%)",
        zIndex: 3, pointerEvents: "none",
      }} />

      {/* Surface label badge */}
      <div className="badge-glow" style={{
        position: "absolute", top: 108, right: 32, zIndex: 4,
        background: "rgba(8,20,36,0.55)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(0,180,255,0.14)",
        borderRadius: 16, padding: "8px 14px",
        display: "flex", alignItems: "center", gap: 9,
      }}>
        <div className="dot-pulse" style={{
          width: 7, height: 7, borderRadius: "50%",
          background: "#00d4ff", boxShadow: "0 0 8px #00d4ff",
        }} />
        <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(200,225,255,0.55)", letterSpacing: "0.09em" }}>
          SPY OPTIONS POSITIONING — LIVE
        </span>
        <span style={{ fontFamily: mono, fontSize: 10, color: "#00d282", fontWeight: 500 }}>+GEX</span>
      </div>

      {/* Axis labels */}
      <div style={{ position: "absolute", bottom: 210, left: 32, zIndex: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(0,180,255,0.35)", letterSpacing: "0.10em" }}>
          ← STRIKE PRICE →
        </span>
      </div>
      <div style={{ position: "absolute", bottom: 210, right: 32, zIndex: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(0,180,255,0.35)", letterSpacing: "0.10em" }}>
          ← EXPIRATION →
        </span>
      </div>

      {/* Hero glass panel */}
      <div className="anim-1" style={{
        position: "relative", zIndex: 5,
        textAlign: "center", maxWidth: 620,
        padding: "0 24px", width: "100%",
      }}>
        <div style={{
          background: "rgba(8,20,36,0.60)",
          backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
          border: "1px solid rgba(0,180,255,0.18)",
          borderRadius: 16, padding: "44px 54px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}>
          <div style={{
            fontFamily: mono, fontSize: 10,
            color: "#00d4ff", letterSpacing: "0.18em",
            marginBottom: 20, opacity: 0.75,
          }}>
            MARKET INTELLIGENCE PLATFORM
          </div>
          <h1 style={{
            fontFamily: serif, fontSize: 54, lineHeight: 1.06,
            color: "#e8f4ff", marginBottom: 18, letterSpacing: "-0.01em",
          }}>
            The market,<br />
            <em style={{ color: "#00d4ff", fontStyle: "italic" }}>visible.</em>
          </h1>
          <p className="anim-2" style={{
            fontFamily: sans, fontSize: 16,
            color: "rgba(180,210,255,0.65)",
            lineHeight: 1.7, fontWeight: 300,
            maxWidth: 420, margin: "0 auto 34px",
          }}>
            Institutional-grade options analytics, AI filing intelligence, and strategy
            simulation — from the first search to the last trade.
          </p>
          <div className="anim-3" style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={onExploreClick}
              style={{
                padding: "12px 28px", borderRadius: 10,
                background: "rgba(0,180,255,0.18)",
                border: "1px solid rgba(0,180,255,0.40)",
                color: "#00d4ff", fontFamily: sans, fontSize: 14, fontWeight: 500,
                cursor: "pointer", letterSpacing: "0.02em", transition: "background 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.30)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.18)")}
            >
              Explore free ↓
            </button>
            <button
              style={{
                padding: "12px 28px", borderRadius: 10,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(200,225,255,0.70)",
                fontFamily: sans, fontSize: 14,
                cursor: "pointer", transition: "background 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            >
              See what's unlocked
            </button>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div style={{
        position: "absolute", bottom: 34, left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5, display: "flex", flexDirection: "column",
        alignItems: "center", gap: 6, opacity: 0.35,
      }}>
        <div style={{ width: 1, height: 38, background: "linear-gradient(to bottom, transparent, rgba(0,180,255,0.9))" }} />
        <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(0,180,255,0.9)", letterSpacing: "0.15em" }}>SCROLL</span>
      </div>
    </section>
  );
}
