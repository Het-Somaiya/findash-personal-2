const FEATURES = [
  {
    icon: "◈",
    tag: "FREE",
    tagColor: "#00d282",
    title: "See the market in three dimensions",
    body: "A live 3D surface of options positioning across strike and expiration reveals gamma concentration zones, max pain levels, and potential squeeze regions — at a single glance.",
    cta: null,
    borderColor: "rgba(0,180,255,0.20)",
  },
  {
    icon: "◎",
    tag: "AUTHENTICATED",
    tagColor: "rgba(0,180,255,0.50)",
    title: "Test your instincts against history",
    body: "Select a date in the past, operate with only the data that existed then, and reveal what actually happened. Learn decision-making under realistic information constraints.",
    cta: "Unlock free →",
    borderColor: "rgba(0,180,255,0.10)",
  },
  {
    icon: "◉",
    tag: "AUTHENTICATED",
    tagColor: "rgba(0,180,255,0.50)",
    title: "Ask the filing, not the analyst",
    body: "A GraphRAG knowledge graph built from EDGAR 10-K and 10-Q filings answers questions about risk, supply chain, and sentiment shifts — cited directly to the source.",
    cta: "Unlock free →",
    borderColor: "rgba(0,180,255,0.10)",
  },
];

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

const glass = {
  background: "rgba(10,12,20,0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  borderRadius: 16,
  boxShadow: "0 0 5px rgba(0,180,255,0.05)",
};

export function FeatureCards() {
  return (
    <section style={{ padding: "0 32px 88px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{
        borderTop: "1px solid rgba(0,180,255,0.08)",
        paddingTop: 56,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 18,
      }}>
        {FEATURES.map((f, i) => (
          <div
            key={i}
            style={{
              ...glass,
              padding: "32px 28px",
              transition: "all 0.25s",
              cursor: "default",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.transform = "translateY(-4px)";
              el.style.boxShadow = "0 0 8px rgba(0,180,255,0.10), 0 20px 60px rgba(0,0,0,0.4)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.transform = "translateY(0)";
              el.style.boxShadow = "0 0 5px rgba(0,180,255,0.05)";
            }}
          >
            <div style={{
              fontFamily: mono, fontSize: 26,
              color: "rgba(0,212,255,0.65)",
              marginBottom: 14, lineHeight: 1,
            }}>
              {f.icon}
            </div>
            <div style={{
              fontFamily: mono, fontSize: 9,
              color: f.tagColor, letterSpacing: "0.12em",
              marginBottom: 12,
            }}>
              {f.tag}
            </div>
            <h3 style={{
              fontFamily: serif, fontSize: 20,
              color: "#e0f0ff", marginBottom: 14, lineHeight: 1.3,
            }}>
              {f.title}
            </h3>
            <p style={{
              fontFamily: sans, fontSize: 13.5,
              color: "rgba(180,210,255,0.50)",
              lineHeight: 1.68, fontWeight: 300,
              marginBottom: f.cta ? 20 : 0,
            }}>
              {f.body}
            </p>
            {f.cta && (
              <span
                style={{
                  fontFamily: sans, fontSize: 12,
                  color: "rgba(0,180,255,0.48)",
                  cursor: "pointer", transition: "color 0.15s",
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLSpanElement).style.color = "#00d4ff")}
                onMouseLeave={e => ((e.currentTarget as HTMLSpanElement).style.color = "rgba(0,180,255,0.48)")}
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
