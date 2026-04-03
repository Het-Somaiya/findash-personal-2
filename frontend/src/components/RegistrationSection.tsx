const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

export function RegistrationSection() {
  return (
    <section style={{
      background: "rgba(8,10,16,0.70)",
      borderTop: "1px solid rgba(0,180,255,0.08)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      padding: "72px 32px",
      textAlign: "center",
    }}>
      <h2 style={{
        fontFamily: serif, fontSize: 40,
        color: "#e0f0ff", marginBottom: 16, lineHeight: 1.15,
      }}>
        Ready to go deeper?
      </h2>
      <p style={{
        fontFamily: sans, fontSize: 16,
        color: "rgba(180,210,255,0.45)",
        marginBottom: 34, fontWeight: 300, lineHeight: 1.65,
        maxWidth: 480, marginLeft: "auto", marginRight: "auto",
      }}>
        Registration is free. Strategy simulation, historical intelligence, and filing
        analysis unlock immediately.
      </p>
      <div style={{ display: "flex", gap: 13, justifyContent: "center", marginBottom: 32 }}>
        <button
          style={{
            padding: "13px 34px", borderRadius: 10,
            background: "rgba(0,180,255,0.18)",
            border: "1px solid rgba(0,180,255,0.38)",
            color: "#00d4ff",
            fontFamily: sans, fontSize: 14, fontWeight: 500,
            cursor: "pointer", transition: "background 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.28)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.18)")}
        >
          Start free
        </button>
        <button
          style={{
            padding: "13px 34px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(200,225,255,0.55)",
            fontFamily: sans, fontSize: 14,
            cursor: "pointer", transition: "background 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
        >
          See what's unlocked
        </button>
      </div>
      <p style={{
        fontFamily: mono, fontSize: 10,
        color: "rgba(180,210,255,0.18)",
        letterSpacing: "0.05em",
        maxWidth: 600, marginLeft: "auto", marginRight: "auto",
        lineHeight: 1.6,
      }}>
        MARKET DATA AND AI OUTPUTS ARE NOT FINANCIAL ADVICE. FOR INFORMATIONAL AND EDUCATIONAL
        PURPOSES ONLY. SIMULATED RESULTS DO NOT GUARANTEE FUTURE PERFORMANCE.
      </p>
    </section>
  );
}
