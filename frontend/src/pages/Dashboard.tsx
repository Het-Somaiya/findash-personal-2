import React from "react";
import { useAuth } from "../context/AuthContext";

const sans = "'DM Sans', sans-serif";
const serif = "'DM Serif Display', serif";
const mono = "'JetBrains Mono', monospace";

export function Dashboard() {
  const { user } = useAuth();

  return (
    <div style={containerStyle}>
      {/* --- Dashboard Header --- */}
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>System Terminal</h1>
          <p style={welcomeStyle}>
            IDENTIFIED: <span style={{ color: "#00d4ff", fontWeight: 600 }}>{user?.name || user?.email || "Unknown Operator"}</span> 
            <span style={statusTagStyle}>SESSION ACTIVE</span>
          </p>
        </div>
        <div style={systemMetaStyle}>
          <div style={{ opacity: 0.5 }}>LOCAL_TIME: {new Date().toLocaleTimeString()}</div>
          <div style={{ color: "#00d4ff" }}>LATENCY: 14ms</div>
        </div>
      </header>

      {/* --- Main Dashboard Grid --- */}
      <div style={gridStyle}>
        
        {/* Row 1: Search Integration (Full Width) */}
        <section style={{ ...gridItemStyle, gridColumn: "1 / -1" }}>
          <div style={sectionHeaderStyle}>
            <span style={sectionLabelStyle}>MARKET_INTELLIGENCE_QUERY</span>
            <span style={liveDotStyle}>● LIVE</span>
          </div>
          <div style={searchPlaceholderStyle}>
            <div style={{ opacity: 0.4, fontSize: 13, fontFamily: mono }}>
              &gt; Ready for asset ticker or natural language query...
            </div>
          </div>
        </section>

        {/* Row 2: Deep Dive Metrics */}
        <section style={gridItemStyle}>
          <h3 style={sectionLabelStyle}>ALPHA_CORE</h3>
          <div style={metricContentStyle}>
            <div style={{ ...dataNodeStyle, color: "#00ffcc" }}>+14.82%</div>
            <p style={metricSubtextStyle}>Portfolio vs. Benchmark (YTD)</p>
          </div>
        </section>

        <section style={gridItemStyle}>
          <h3 style={sectionLabelStyle}>VOLATILITY_INDEX</h3>
          <div style={metricContentStyle}>
            <div style={{ ...dataNodeStyle, color: "#ffb800" }}>LOW-MOD</div>
            <p style={metricSubtextStyle}>Risk Exposure Coefficient</p>
          </div>
        </section>

        <section style={gridItemStyle}>
          <h3 style={sectionLabelStyle}>SENTIMENT_ENGINE</h3>
          <div style={metricContentStyle}>
            <div style={{ ...dataNodeStyle, color: "#00d4ff" }}>BULLISH</div>
            <p style={metricSubtextStyle}>AI-Aggregated News Sentiment</p>
          </div>
        </section>

        {/* Row 3: Activity Table */}
        <section style={{ ...gridItemStyle, gridColumn: "1 / span 2" }}>
          <h3 style={sectionLabelStyle}>RECENT_TERMINAL_LOGS</h3>
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeaderRowStyle}>
                <th style={thStyle}>ID_KEY</th>
                <th style={thStyle}>OPERATION</th>
                <th style={thStyle}>TIMESTAMP</th>
                <th style={thStyle}>RESULT</th>
              </tr>
            </thead>
            <tbody>
              <tr style={tableRowStyle}>
                <td style={tdStyle}>#BTC-99</td>
                <td style={tdStyle}>Liquidity Mapping</td>
                <td style={tdStyle}>08:42:11</td>
                <td style={{ ...tdStyle, color: "#00ffcc" }}>SUCCESS</td>
              </tr>
              <tr style={tableRowStyle}>
                <td style={tdStyle}>#NVDA-04</td>
                <td style={tdStyle}>Sentiment Extraction</td>
                <td style={tdStyle}>07:15:22</td>
                <td style={{ ...tdStyle, color: "#00ffcc" }}>SUCCESS</td>
              </tr>
              <tr style={tableRowStyle}>
                <td style={tdStyle}>#ETH-21</td>
                <td style={tdStyle}>Volume Anomaly</td>
                <td style={tdStyle}>06:01:45</td>
                <td style={{ ...tdStyle, color: "#ff5050" }}>REJECTED</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Row 3: System Status */}
        <section style={gridItemStyle}>
          <h3 style={sectionLabelStyle}>SYSTEM_STABILITY</h3>
          <div style={logsContainerStyle}>
            <div style={logEntryStyle}>[INFO] Neural cores online</div>
            <div style={logEntryStyle}>[INFO] Data stream synchronized</div>
            <div style={logEntryStyle}>[WARN] High volatility detected: $SOL</div>
            <div style={logEntryStyle}>[INFO] Encryption layer: AES-256</div>
          </div>
        </section>

      </div>
    </div>
  );
}

// --- Styles ---

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#04060c",
  padding: "120px 40px 60px 40px",
  color: "#e0f0ff",
  fontFamily: sans,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  marginBottom: 48,
  borderBottom: "1px solid rgba(0, 180, 255, 0.1)",
  paddingBottom: 24,
};

const titleStyle: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 40,
  fontWeight: 400,
  margin: 0,
  letterSpacing: "-0.01em",
};

const welcomeStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  marginTop: 8,
  opacity: 0.8,
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const statusTagStyle: React.CSSProperties = {
  background: "rgba(0, 212, 255, 0.1)",
  border: "1px solid rgba(0, 212, 255, 0.2)",
  color: "#00d4ff",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
};

const systemMetaStyle: React.CSSProperties = {
  textAlign: "right",
  fontFamily: mono,
  fontSize: 11,
  lineHeight: "1.8",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "24px",
};

const gridItemStyle: React.CSSProperties = {
  background: "rgba(10, 15, 28, 0.6)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(0, 180, 255, 0.12)",
  borderRadius: 20,
  padding: 24,
  boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 10,
  fontWeight: 600,
  color: "rgba(0, 212, 255, 0.5)",
  letterSpacing: "0.2em",
};

const liveDotStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 9,
  color: "#00ffcc",
  letterSpacing: "0.1em",
};

const searchPlaceholderStyle: React.CSSProperties = {
  height: 60,
  background: "rgba(0,0,0,0.2)",
  border: "1px solid rgba(0, 180, 255, 0.1)",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  padding: "0 20px",
};

const metricContentStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "10px 0",
};

const dataNodeStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 36,
  fontWeight: 700,
  marginBottom: 4,
};

const metricSubtextStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.5,
  margin: 0,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 8px",
  fontSize: 10,
  fontFamily: mono,
  color: "rgba(255,255,255,0.3)",
  borderBottom: "1px solid rgba(0,180,255,0.1)",
};

const tdStyle: React.CSSProperties = {
  padding: "16px 8px",
  fontSize: 13,
  fontFamily: mono,
  borderBottom: "1px solid rgba(255,255,255,0.03)",
};

const tableHeaderRowStyle: React.CSSProperties = {};
const tableRowStyle: React.CSSProperties = {};

const logsContainerStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)",
  padding: "16px",
  borderRadius: 12,
  height: "100px",
  overflowY: "auto",
};

const logEntryStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  color: "#888",
  marginBottom: "6px",
};