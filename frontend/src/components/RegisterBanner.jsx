export default function RegisterBanner() {
  return (
    <section
      style={{
        background: "rgba(0,18,38,0.7)",
        borderTop: "1px solid rgba(0,180,255,0.08)",
        padding: "56px 32px",
        textAlign: "center",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <h2
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 36,
          color: "#e0f0ff",
          marginBottom: 14,
        }}
      >
        Ready to go deeper?
      </h2>
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 15,
          color: "rgba(180,210,255,0.45)",
          marginBottom: 30,
          fontWeight: 300,
        }}
      >
        Registration is free. Strategies, simulation, and filing intelligence
        unlock immediately.
      </p>
      <div
        style={{
          display: "flex",
          gap: 12,
          justifyContent: "center",
          marginBottom: 28,
        }}
      >
        <button
          className="register-btn-primary"
          style={{
            padding: "13px 32px",
            borderRadius: 10,
            background: "rgba(0,180,255,0.18)",
            border: "1px solid rgba(0,180,255,0.38)",
            color: "#00d4ff",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          Start free
        </button>
        <button
          className="register-btn-secondary"
          style={{
            padding: "13px 32px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(200,225,255,0.55)",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
          }}
        >
          See what's unlocked
        </button>
      </div>
      <p
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: "rgba(180,210,255,0.18)",
          letterSpacing: "0.05em",
        }}
      >
        MARKET DATA AND AI OUTPUTS ARE NOT FINANCIAL ADVICE. FOR INFORMATIONAL
        PURPOSES ONLY.
      </p>
    </section>
  );
}
