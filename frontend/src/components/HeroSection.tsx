import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LandingMarketGlobe } from "./MarketGlobe";
import { SearchPanel, type AssetData } from "./SearchPanel";
import { useAuth } from "../lib/AuthContext";

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

const GLOBE_BG = "#04080f";

interface HeroSectionProps {
  onExploreClick?: () => void;
  selectedAsset: AssetData | null;
  onAssetSelect: (asset: AssetData | null) => void;
}

function LoggedInHero({ selectedAsset, onAssetSelect }: {
  selectedAsset: AssetData | null;
  onAssetSelect: (asset: AssetData | null) => void;
}) {
  const navbarRef = useRef<HTMLDivElement>(null);
  const hasSelection = selectedAsset !== null;

  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 580);
    return () => clearTimeout(timer);
  }, [hasSelection]);

  return (
    <section style={{
      position: "relative",
      height: "100vh",
      overflow: "hidden",
      background: GLOBE_BG,
    }}>
      <style>{`
        @keyframes panelSlideIn {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .hero-panel-scroll::-webkit-scrollbar { width: 3px; }
        .hero-panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .hero-panel-scroll::-webkit-scrollbar-thumb { background: rgba(0,180,255,0.18); border-radius: 2px; }
      `}</style>

      {/* Globe */}
      <div style={{
        position: "absolute",
        top: 0, left: 0,
        width: hasSelection ? "65%" : "100%",
        height: "100%",
        transition: "width 0.55s cubic-bezier(0.16,1,0.3,1)",
        zIndex: 1,
      }}>
        <LandingMarketGlobe onTickerClick={onAssetSelect} />
      </div>

      {/* Right side — teal top → dark grey bottom, matches globe perfectly */}
      <div style={{
        position: "absolute",
        top: 0, right: 0,
        width: hasSelection ? "35%" : "0%",
        height: "100%",
        transition: "width 0.55s cubic-bezier(0.16,1,0.3,1)",
        zIndex: 2,
        background: `
          linear-gradient(
            to bottom,
            #042e38 0%,
            #03212a 15%,
            #021820 30%,
            #021218 45%,
            #060e14 60%,
            #050a10 75%,
            #04080c 88%,
            #030609 100%
          )
        `,
        pointerEvents: "none",
      }}>
        {/* Left edge fade to blend with globe */}
        <div style={{
          position: "absolute", top: 0, left: 0,
          width: 60, height: "100%",
          background: `linear-gradient(to right, ${GLOBE_BG}, transparent)`,
          zIndex: 3, pointerEvents: "none",
        }} />
      </div>

      {/* Floating panel */}
      {hasSelection && (
        <div style={{
          position: "absolute",
          top: 80, right: 16,
          width: "32%",
          maxHeight: "calc(100vh - 90px)",
          zIndex: 20,
          animation: "panelSlideIn 0.45s cubic-bezier(0.16,1,0.3,1) both",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          pointerEvents: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 4 }}>
            <button
              onClick={() => onAssetSelect(null)}
              style={{
                background: "rgba(10,12,20,0.75)",
                border: "1px solid rgba(0,180,255,0.20)",
                borderRadius: 7,
                color: "rgba(180,210,255,0.55)",
                fontFamily: mono, fontSize: 11,
                padding: "5px 14px",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                transition: "all 0.15s",
                letterSpacing: "0.05em",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(0,180,255,0.12)";
                e.currentTarget.style.color = "#00d4ff";
                e.currentTarget.style.borderColor = "rgba(0,180,255,0.40)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(10,12,20,0.75)";
                e.currentTarget.style.color = "rgba(180,210,255,0.55)";
                e.currentTarget.style.borderColor = "rgba(0,180,255,0.20)";
              }}
            >
              ✕ close
            </button>
          </div>
          <div
            className="hero-panel-scroll"
            style={{ overflowY: "auto", borderRadius: 20, maxHeight: "calc(100vh - 140px)" }}
          >
            <SearchPanel
              asset={selectedAsset}
              onClose={() => onAssetSelect(null)}
              navbarRef={navbarRef}
              inline={true}
            />
          </div>
        </div>
      )}

      {/* LIVE badge */}
      <div style={{
        position: "absolute", top: 88, left: 32, zIndex: 20,
        display: "flex", alignItems: "center", gap: 9, pointerEvents: "none",
      }}>
        <div className="dot-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#00d4ff", boxShadow: "0 0 8px #00d4ff" }} />
        <span style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.09em", fontWeight: 500 }}>LIVE</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(200,225,255,0.55)", letterSpacing: "0.09em" }}>MARKET OVERVIEW</span>
      </div>

      {!hasSelection && (
        <div style={{
          position: "absolute", bottom: 34, left: "50%",
          transform: "translateX(-50%)", zIndex: 6,
          pointerEvents: "none", opacity: 0.4,
        }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(0,180,255,0.9)", letterSpacing: "0.15em" }}>
            CLICK A BUBBLE TO EXPLORE
          </span>
        </div>
      )}
    </section>
  );
}

function LoggedOutHero({ onExploreClick }: { onExploreClick?: () => void }) {
  const navigate = useNavigate();

  return (
    <section style={{
      position: "relative", height: "100vh", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <LandingMarketGlobe onTickerClick={undefined} />
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "rgba(4,12,24,0.05)", pointerEvents: "none" }} />
      <div style={{
        position: "absolute", inset: 0, zIndex: 2,
        background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(160,215,255,0.02) 35%, transparent 58%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", inset: 0, zIndex: 2,
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        maskImage: "radial-gradient(ellipse 340px 300px at 50% 50%, black 0%, black 25%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 340px 300px at 50% 50%, black 0%, black 25%, transparent 100%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 200,
        background: "linear-gradient(to top, #060810 0%, transparent 100%)",
        zIndex: 3, pointerEvents: "none",
      }} />
      <div style={{ position: "absolute", top: 108, right: 32, zIndex: 4, display: "flex", alignItems: "center", gap: 9 }}>
        <div className="dot-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#00d4ff", boxShadow: "0 0 8px #00d4ff" }} />
        <span style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.09em", fontWeight: 500 }}>LIVE</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(200,225,255,0.55)", letterSpacing: "0.09em" }}>MARKET OVERVIEW</span>
      </div>
      <div style={{ position: "relative", zIndex: 4, textAlign: "center", maxWidth: 540, padding: "0 24px", width: "100%", pointerEvents: "none" }}>
        <div className="anim-1" style={{ padding: "44px 54px", pointerEvents: "none" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.18em", marginBottom: 20, opacity: 0.75 }}>
            MARKET INTELLIGENCE PLATFORM
          </div>
          <h1 style={{ fontFamily: serif, fontSize: 54, lineHeight: 1.06, color: "#e8f4ff", marginBottom: 18, letterSpacing: "-0.01em" }}>
            The market,<br />
            <em style={{ color: "#00d4ff", fontStyle: "italic" }}>visible.</em>
          </h1>
          <p className="anim-2" style={{ fontFamily: sans, fontSize: 16, color: "rgba(180,210,255,0.65)", lineHeight: 1.7, fontWeight: 300, maxWidth: 420, margin: "0 auto 34px" }}>
            Institutional-grade options analytics, AI filing intelligence, and strategy simulation — from the first search to the last trade.
          </p>
          <div className="anim-3" style={{ display: "flex", gap: 12, justifyContent: "center", pointerEvents: "auto" }}>
            <button
              onClick={onExploreClick}
              style={{ padding: "12px 28px", borderRadius: 10, background: "rgba(0,180,255,0.18)", border: "1px solid rgba(0,180,255,0.40)", color: "#00d4ff", fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "background 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.30)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.18)")}
            >
              Explore free ↓
            </button>
            <button
              onClick={() => navigate("/register")}
              style={{ padding: "12px 28px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(200,225,255,0.70)", fontFamily: sans, fontSize: 14, cursor: "pointer", transition: "background 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            >
              See what's locked
            </button>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 34, left: "50%", transform: "translateX(-50%)", zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.35 }}>
        <div style={{ width: 1, height: 38, background: "linear-gradient(to bottom, transparent, rgba(0,180,255,0.9))" }} />
        <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(0,180,255,0.9)", letterSpacing: "0.15em" }}>SCROLL</span>
      </div>
    </section>
  );
}

export function HeroSection({ onExploreClick, selectedAsset, onAssetSelect }: HeroSectionProps) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <LoggedInHero selectedAsset={selectedAsset} onAssetSelect={onAssetSelect} />;
  return <LoggedOutHero onExploreClick={onExploreClick} />;
}
