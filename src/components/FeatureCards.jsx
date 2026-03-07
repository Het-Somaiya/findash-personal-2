const FEATURES = [
  {
    icon: "◈",
    tag: "FREE",
    tagColor: "#00d282",
    title: "See the market in three dimensions",
    body: "A live 3D surface of options positioning across strike and expiration reveals gamma concentration, max pain zones, and potential squeeze regions at a glance.",
    cta: null,
    highlight: true,
  },
  {
    icon: "◎",
    tag: "AUTHENTICATED",
    tagColor: "rgba(0,180,255,0.38)",
    title: "Test your instincts against history",
    body: "Select a date in the past, operate with only the data that existed then, and reveal what actually happened. Learn decision-making under realistic information constraints.",
    cta: "Unlock free →",
    highlight: false,
  },
  {
    icon: "◉",
    tag: "AUTHENTICATED",
    tagColor: "rgba(0,180,255,0.38)",
    title: "Ask the filing, not the analyst",
    body: "A GraphRAG knowledge graph built from EDGAR 10-K and 10-Q filings answers questions about risk, supply chain, and sentiment shifts — cited to the source.",
    cta: "Unlock free →",
    highlight: false,
  },
];

const glass = {
  background: "rgba(8, 20, 36, 0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  borderRadius: 16,
};

export default function FeatureCards() {
  return (
    <section
      style={{
        padding: "0 32px 80px",
        maxWidth: 1280,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          borderTop: "1px solid rgba(0,180,255,0.08)",
          paddingTop: 52,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {FEATURES.map((f, i) => (
          <div
            key={i}
            className="fcard"
            style={{
              ...glass,
              padding: "28px 26px",
              border: f.highlight
                ? "1px solid rgba(0,180,255,0.22)"
                : "1px solid rgba(0,180,255,0.1)",
              boxShadow: f.highlight
                ? "0 0 40px rgba(0,180,255,0.05)"
                : "none",
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 24,
                color: "#00d4ff",
                marginBottom: 14,
                opacity: 0.65,
              }}
            >
              {f.icon}
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: f.tagColor,
                letterSpacing: "0.12em",
                marginBottom: 10,
              }}
            >
              {f.tag}
            </div>
            <h3
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 18,
                color: "#e0f0ff",
                marginBottom: 12,
                lineHeight: 1.3,
              }}
            >
              {f.title}
            </h3>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13.5,
                color: "rgba(180,210,255,0.5)",
                lineHeight: 1.68,
                fontWeight: 300,
                marginBottom: f.cta ? 18 : 0,
              }}
            >
              {f.body}
            </p>
            {f.cta && (
              <span
                className="cta-link"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "rgba(0,180,255,0.48)",
                  cursor: "pointer",
                }}
              >
                {f.cta}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
