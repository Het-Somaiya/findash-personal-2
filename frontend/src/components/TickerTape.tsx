import { useState, useEffect } from "react";
import { getMarketSnapshot, type MarketSnapshot } from "../lib/api";

const SYMBOLS = ["SPX", "NDX", "SPY", "VIX", "DXY", "10Y", "BTC", "QQQ", "GLD", "IWM"];

const FALLBACK: MarketSnapshot[] = [
  { label: "SPX", value: "5,842.31",  change: "+0.41%", up: true  },
  { label: "NDX", value: "20,614.87", change: "+0.78%", up: true  },
  { label: "SPY", value: "584.11",    change: "+0.42%", up: true  },
  { label: "VIX", value: "14.23",     change: "-3.12%", up: false },
  { label: "DXY", value: "103.84",    change: "-0.19%", up: false },
  { label: "10Y", value: "4.31%",     change: "+0.04",  up: true  },
  { label: "BTC", value: "87,240",    change: "+1.24%", up: true  },
  { label: "QQQ", value: "448.87",    change: "+0.79%", up: true  },
  { label: "GLD", value: "232.11",    change: "+0.55%", up: true  },
  { label: "IWM", value: "208.54",    change: "-0.31%", up: false },
];

const mono = "'JetBrains Mono', monospace";

export function TickerTape() {
  const [tickers, setTickers] = useState<MarketSnapshot[]>(FALLBACK);

  useEffect(() => {
    getMarketSnapshot(SYMBOLS)
      .then(data => { if (data.length) setTickers(data); })
      .catch(() => {});
  }, []);

  // Triple for seamless loop
  const items = [...tickers, ...tickers, ...tickers];

  return (
    <div style={{
      position: "fixed", top: 60, left: 0, right: 0, zIndex: 99,
      height: 27,
      background: "rgba(3,13,26,0.85)",
      borderBottom: "1px solid rgba(0,180,255,0.07)",
      overflow: "hidden",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
    }}>
      <div
        className="ticker-animate"
        style={{
          display: "flex",
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
              fontFamily: mono, fontSize: 11,
              marginRight: 36,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ color: "rgba(200,225,255,0.28)" }}>{m.label}</span>
            <span style={{ color: "rgba(200,225,255,0.65)" }}>{m.value}</span>
            <span style={{ color: m.up ? "#00d282" : "#ff5064" }}>{m.change}</span>
            <span style={{ color: "rgba(0,180,255,0.15)", marginLeft: 4 }}>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
