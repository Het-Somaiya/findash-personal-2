const MARKET = [
  { label: "SPX", value: "5,842.31", change: "+0.41%", up: true },
  { label: "NDX", value: "20,614.87", change: "+0.78%", up: true },
  { label: "VIX", value: "14.23", change: "-3.12%", up: false },
  { label: "DXY", value: "103.84", change: "-0.19%", up: false },
  { label: "10Y", value: "4.31%", change: "+0.04", up: true },
  { label: "BTC", value: "87,240", change: "+1.24%", up: true },
  { label: "GLD", value: "2,312.40", change: "+0.32%", up: true },
  { label: "OIL", value: "78.54", change: "-0.87%", up: false },
];

export default function TickerTape() {
  // Triple the array so the seamless loop works
  const items = [...MARKET, ...MARKET, ...MARKET];

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        left: 0,
        right: 0,
        zIndex: 99,
        height: 27,
        background: "rgba(3,13,26,0.88)",
        borderBottom: "1px solid rgba(0,180,255,0.07)",
        overflow: "hidden",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          display: "flex",
          animation: "ticker 32s linear infinite",
          whiteSpace: "nowrap",
          height: "100%",
          alignItems: "center",
          width: "max-content",
        }}
      >
        {items.map((m, i) => (
          <span
            key={i}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: "rgba(200,225,255,0.45)",
              marginRight: 40,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ color: "rgba(200,225,255,0.28)" }}>{m.label}</span>
            <span style={{ color: "rgba(200,225,255,0.7)" }}>{m.value}</span>
            <span style={{ color: m.up ? "#00d282" : "#ff5064" }}>
              {m.change}
            </span>
            <span style={{ color: "rgba(0,180,255,0.15)", marginLeft: 8 }}>
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
