import Surface3D from "./Surface3D";

const glass = {
  background: "rgba(8, 20, 36, 0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(0, 180, 255, 0.14)",
  borderRadius: 16,
};

export default function HeroSection() {
  return (
    <section
      style={{
        position: "relative",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Three.js surface */}
      <Surface3D />

      {/* Radial overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(3,13,26,0.2) 0%, rgba(3,13,26,0.72) 75%)",
          zIndex: 1,
        }}
      />

      {/* Bottom fade */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 180,
          background: "linear-gradient(to top, #030d1a, transparent)",
          zIndex: 1,
        }}
      />

      {/* Live badge */}
      <div
        style={{
          position: "absolute",
          top: 108,
          right: 32,
          zIndex: 2,
          ...glass,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 9,
          animation: "glow 3s infinite",
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#00d4ff",
            boxShadow: "0 0 8px #00d4ff",
            animation: "pulse 2s infinite",
          }}
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "rgba(200,225,255,0.55)",
            letterSpacing: "0.09em",
          }}
        >
          SPY OPTIONS POSITIONING — LIVE
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "#00d282",
            fontWeight: 500,
          }}
        >
          +GEX
        </span>
      </div>

      {/* Axis labels */}
      <div
        style={{ position: "absolute", bottom: 200, left: 32, zIndex: 2 }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: "rgba(0,180,255,0.35)",
            letterSpacing: "0.1em",
          }}
        >
          ← STRIKE PRICE →
        </span>
      </div>
      <div
        style={{ position: "absolute", bottom: 200, right: 32, zIndex: 2 }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: "rgba(0,180,255,0.35)",
            letterSpacing: "0.1em",
          }}
        >
          ← EXPIRATION →
        </span>
      </div>

      {/* Hero glass panel */}
      <div
        className="anim1"
        style={{
          position: "relative",
          zIndex: 2,
          textAlign: "center",
          maxWidth: 620,
          padding: "0 24px",
        }}
      >
        <div
          style={{
            ...glass,
            padding: "44px 54px",
            boxShadow:
              "0 32px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "#00d4ff",
              letterSpacing: "0.18em",
              marginBottom: 20,
              opacity: 0.75,
            }}
          >
            MARKET INTELLIGENCE PLATFORM
          </div>

          <h1
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 54,
              lineHeight: 1.06,
              color: "#e8f4ff",
              marginBottom: 18,
              letterSpacing: "-0.01em",
            }}
          >
            The market,
            <br />
            <em style={{ color: "#00d4ff", fontStyle: "italic" }}>visible.</em>
          </h1>

          <p
            className="anim2"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 16,
              color: "rgba(180,210,255,0.65)",
              lineHeight: 1.7,
              fontWeight: 300,
              maxWidth: 420,
              margin: "0 auto 34px",
            }}
          >
            Institutional-grade options analytics, AI filing intelligence, and
            strategy simulation — from the first search to the last trade.
          </p>

          <div
            className="anim3"
            style={{ display: "flex", gap: 12, justifyContent: "center" }}
          >
            <button
              className="register-btn-primary"
              style={{
                padding: "12px 28px",
                borderRadius: 10,
                background: "rgba(0,180,255,0.18)",
                border: "1px solid rgba(0,180,255,0.4)",
                color: "#00d4ff",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              Explore free ↓
            </button>
            <button
              className="register-btn-secondary"
              style={{
                padding: "12px 28px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(200,225,255,0.7)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
              }}
            >
              See what's unlocked
            </button>
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div
        style={{
          position: "absolute",
          bottom: 30,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          animation: "scrollCue 2.5s ease-in-out infinite",
        }}
      >
        <div
          style={{
            width: 1,
            height: 38,
            background:
              "linear-gradient(to bottom, transparent, rgba(0,180,255,0.9))",
          }}
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: "rgba(0,180,255,0.9)",
            letterSpacing: "0.15em",
          }}
        >
          SCROLL
        </span>
      </div>
    </section>
  );
}
