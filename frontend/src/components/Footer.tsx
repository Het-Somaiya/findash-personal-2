const LINKS = {
  Product:   ["Options Surface", "Strategy Builder", "AI Filing Reader", "Screener", "API Docs"],
  Company:   ["About", "Careers", "Blog", "Press", "Status"],
  Legal:     ["Privacy Policy", "Terms of Service", "Cookie Policy"],
  Resources: ["Documentation", "Options 101", "Market Glossary", "Community"],
};

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

export function Footer() {
  return (
    <footer style={{
      background: "#060810",
      borderTop: "1px solid rgba(0,180,255,0.06)",
      padding: "64px 32px 40px",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "220px 1fr 1fr 1fr 1fr",
          gap: 32, marginBottom: 52,
        }}>
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: "linear-gradient(135deg, #00d4ff, #0055ee)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontFamily: mono, fontSize: 14, color: "#fff", fontWeight: 500 }}>F</span>
              </div>
              <span style={{ fontFamily: serif, fontSize: 18, color: "#e0f0ff", letterSpacing: "0.01em" }}>
                FinDash
              </span>
            </div>
            <p style={{
              fontFamily: sans, fontSize: 13,
              color: "rgba(180,210,255,0.35)",
              lineHeight: 1.7, fontWeight: 300, marginBottom: 20,
            }}>
              The options market, rendered. Real-time volatility surfaces and institutional-grade
              analytics for every investor.
            </p>
            <p style={{
              fontFamily: mono, fontSize: 10,
              color: "rgba(180,210,255,0.20)",
              letterSpacing: "0.05em", lineHeight: 1.7,
            }}>
              Powered by{" "}
              <a
                href="https://massive.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "rgba(0,180,255,0.45)", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = "#00d4ff")}
                onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(0,180,255,0.45)")}
              >
                Massive.com
              </a>{" "}
              Stock API
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category}>
              <div style={{
                fontFamily: mono, fontSize: 10,
                color: "rgba(0,180,255,0.45)",
                letterSpacing: "0.10em", marginBottom: 16,
              }}>
                {category.toUpperCase()}
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {links.map(link => (
                  <li key={link}>
                    <a
                      href="#"
                      style={{
                        fontFamily: sans, fontSize: 13,
                        color: "rgba(180,210,255,0.38)",
                        textDecoration: "none", transition: "color 0.15s",
                      }}
                      onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(200,225,255,0.75)")}
                      onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(180,210,255,0.38)")}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: "1px solid rgba(0,180,255,0.06)",
          paddingTop: 24,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 12,
        }}>
          <p style={{ fontFamily: mono, fontSize: 10, color: "rgba(180,210,255,0.22)", letterSpacing: "0.04em" }}>
            © 2026 FinDash Technologies Inc. All rights reserved.
          </p>
          <p style={{
            fontFamily: mono, fontSize: 10, color: "rgba(180,210,255,0.16)",
            letterSpacing: "0.03em", maxWidth: 520, textAlign: "right",
          }}>
            OPTIONS TRADING INVOLVES SUBSTANTIAL RISK. NOT FINANCIAL ADVICE. FOR INFORMATIONAL PURPOSES ONLY.
          </p>
        </div>
      </div>
    </footer>
  );
}
