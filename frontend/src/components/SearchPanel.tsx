/**
 * FinDash — SearchPanel.tsx
 *
 * Drop-in replacement for the search dropdown in Navbar.tsx.
 * Shows a full asset card with:
 *   - Price history chart (recharts)
 *   - Price & Volume metrics
 *   - 52-week range slider
 *   - Valuation block (P/E, Fwd P/E, PEG, Div Yield)
 *   - Momentum & Risk (RSI gauge, Beta bar, Short Interest)
 *   - Ownership & Growth (Ownership ring, Revenue bars)
 *
 * Usage inside Navbar.tsx:
 *   1. Add `import { SearchPanel } from "./SearchPanel"` at the top
 *   2. Add `const navbarRef = useRef<HTMLDivElement>(null)` on the <nav> element
 *   3. Render `<SearchPanel asset={selectedAsset} onClose={() => setSelectedAsset(null)} navbarRef={navbarRef} />`
 *      inside the search wrapper div when `selectedAsset` is set.
 *
 * Requires:
 *   npm install recharts
 *   (three is already in your package.json)
 */

import { useState, useEffect, useRef, RefObject } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// ─── Asset data shape ─────────────────────────────────────────────────────────

export interface AssetData {
  ticker: string;
  name: string;
  type: "STOCK" | "ETF" | "CRYPTO";
  sector: string;
  price: number;
  change: number;
  changePct: number;
  up: boolean;
  volume: string;
  avgVolume: string;
  volRatio: number;
  marketCap: string;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  revenueGrowthQoQ: number[] | null;
  week52High: number;
  week52Low: number;
  week52Pos: number;
  nextEarnings: string | null;
  rsi: number;
  beta: number;
  shortFloatPct: number | null;
  daysToCover: number | null;
  institutionalOwnership: number;
  insiderActivity: "buy" | "sell" | "neutral";
  insiderNet: number;
  dividendYield: number | null;
  freeCashFlow: string | null;
  description: string;
  chartSeed: number;
  chartTrend: number;
}

// ─── Built-in mock asset database ─────────────────────────────────────────────
// Wire up to your real API by passing asset from outside; these are fallbacks.

export const ASSET_DB: Record<string, AssetData> = {
  NVDA: {
    ticker: "NVDA", name: "NVIDIA Corporation", type: "STOCK", sector: "Technology",
    price: 924.58, change: 18.42, changePct: 2.03, up: true,
    volume: "42.1M", avgVolume: "38.4M", volRatio: 1.10,
    marketCap: "2.27T", pe: 68.4, forwardPe: 38.2, peg: 1.12, eps: 13.52,
    revenueGrowth: 122, revenueGrowthQoQ: [88, 101, 114, 122],
    week52High: 974.00, week52Low: 435.10, week52Pos: 84,
    nextEarnings: "May 22", rsi: 67, beta: 1.72, shortFloatPct: 1.8, daysToCover: 0.9,
    institutionalOwnership: 66, insiderActivity: "buy", insiderNet: 2.1,
    dividendYield: null, freeCashFlow: "26.9B",
    description: "Designs and manufactures GPUs and system-on-chip units for gaming, data centers, and AI.",
    chartSeed: 435, chartTrend: 1.8,
  },
  AAPL: {
    ticker: "AAPL", name: "Apple Inc.", type: "STOCK", sector: "Technology",
    price: 211.45, change: -1.23, changePct: -0.58, up: false,
    volume: "58.3M", avgVolume: "62.1M", volRatio: 0.94,
    marketCap: "3.24T", pe: 34.1, forwardPe: 29.8, peg: 2.41, eps: 6.20,
    revenueGrowth: 4, revenueGrowthQoQ: [2, 3, 5, 4],
    week52High: 237.49, week52Low: 164.08, week52Pos: 64,
    nextEarnings: "May 1", rsi: 44, beta: 1.21, shortFloatPct: 0.7, daysToCover: 0.5,
    institutionalOwnership: 61, insiderActivity: "sell", insiderNet: 8.4,
    dividendYield: 0.54, freeCashFlow: "111.4B",
    description: "Designs and markets smartphones, personal computers, tablets, and wearables globally.",
    chartSeed: 164, chartTrend: 0.6,
  },
  SPY: {
    ticker: "SPY", name: "SPDR S&P 500 ETF Trust", type: "ETF", sector: "Broad Market",
    price: 582.43, change: 2.38, changePct: 0.41, up: true,
    volume: "71.4M", avgVolume: "68.2M", volRatio: 1.05,
    marketCap: "533B AUM", pe: 24.8, forwardPe: 22.1, peg: null, eps: null,
    revenueGrowth: null, revenueGrowthQoQ: null,
    week52High: 613.23, week52Low: 492.15, week52Pos: 75,
    nextEarnings: null, rsi: 52, beta: 1.00, shortFloatPct: 0.4, daysToCover: 0.3,
    institutionalOwnership: 82, insiderActivity: "neutral", insiderNet: 0,
    dividendYield: 1.24, freeCashFlow: null,
    description: "Tracks the S&P 500 index. Largest ETF by AUM with over $500B in assets.",
    chartSeed: 492, chartTrend: 0.9,
  },
  MSFT: {
    ticker: "MSFT", name: "Microsoft Corporation", type: "STOCK", sector: "Technology",
    price: 418.92, change: 4.17, changePct: 1.01, up: true,
    volume: "19.8M", avgVolume: "22.3M", volRatio: 0.89,
    marketCap: "3.11T", pe: 36.8, forwardPe: 31.4, peg: 2.08, eps: 11.38,
    revenueGrowth: 16, revenueGrowthQoQ: [13, 15, 17, 16],
    week52High: 468.35, week52Low: 363.00, week52Pos: 53,
    nextEarnings: "Apr 30", rsi: 58, beta: 0.89, shortFloatPct: 0.6, daysToCover: 0.8,
    institutionalOwnership: 73, insiderActivity: "sell", insiderNet: 3.2,
    dividendYield: 0.72, freeCashFlow: "74.1B",
    description: "Develops and licenses software, cloud computing services, and hardware devices worldwide.",
    chartSeed: 363, chartTrend: 0.7,
  },
  TSLA: {
    ticker: "TSLA", name: "Tesla Inc.", type: "STOCK", sector: "Consumer Discretionary",
    price: 172.63, change: -3.84, changePct: -2.17, up: false,
    volume: "104.2M", avgVolume: "91.6M", volRatio: 1.14,
    marketCap: "551B", pe: 48.2, forwardPe: 62.4, peg: 3.84, eps: 3.58,
    revenueGrowth: -9, revenueGrowthQoQ: [2, -1, -4, -9],
    week52High: 488.54, week52Low: 138.80, week52Pos: 22,
    nextEarnings: "Apr 22", rsi: 29, beta: 2.31, shortFloatPct: 9.2, daysToCover: 4.1,
    institutionalOwnership: 44, insiderActivity: "sell", insiderNet: 24.6,
    dividendYield: null, freeCashFlow: "3.6B",
    description: "Designs and sells electric vehicles, energy storage systems, and solar energy products.",
    chartSeed: 138, chartTrend: -0.4,
  },
  BTC: {
    ticker: "BTC", name: "Bitcoin", type: "CRYPTO", sector: "Digital Asset",
    price: 87240, change: 1068, changePct: 1.24, up: true,
    volume: "38.4B", avgVolume: "31.2B", volRatio: 1.23,
    marketCap: "1.72T", pe: null, forwardPe: null, peg: null, eps: null,
    revenueGrowth: null, revenueGrowthQoQ: null,
    week52High: 108300, week52Low: 38500, week52Pos: 70,
    nextEarnings: null, rsi: 55, beta: 1.84, shortFloatPct: null, daysToCover: null,
    institutionalOwnership: 31, insiderActivity: "neutral", insiderNet: 0,
    dividendYield: null, freeCashFlow: null,
    description: "Decentralized digital currency and store of value on a peer-to-peer network.",
    chartSeed: 38500, chartTrend: 1.2,
  },
};

// ─── Chart generator (seeded, deterministic) ──────────────────────────────────

type ChartRange = "1D" | "5D" | "1M" | "3M";

interface ChartPoint {
  idx: number;
  label: string;
  price: number;
}

function genChart(asset: AssetData, range: ChartRange): ChartPoint[] {
  const pts = ({ "1D": 78, "5D": 75, "1M": 30, "3M": 90 } as Record<ChartRange, number>)[range] ?? 75;
  const data: ChartPoint[] = [];
  let price = asset.week52Low + (asset.week52High - asset.week52Low) * 0.3;
  for (let i = 0; i < pts; i++) {
    const noise =
      (Math.sin(i * 0.7 + asset.chartSeed) * 0.4 +
        Math.cos(i * 1.3 + asset.chartSeed * 0.1) * 0.3 +
        Math.sin(i * 2.1) * 0.2) *
      (asset.price * 0.012);
    price = Math.max(
      asset.week52Low * 0.95,
      price + noise + (asset.chartTrend / pts) * asset.price * 0.018
    );
    let label = "";
    if (range === "1D")
      label = `${9 + Math.floor(i / 4)}:${String((i % 4) * 15).padStart(2, "0")}`;
    else if (range === "5D") {
      if (i % 15 === 0)
        label = ["Mon", "Tue", "Wed", "Thu", "Fri"][Math.floor(i / 15)] ?? "";
    } else if (i % 7 === 0) {
      const d = new Date(2026, 0, i + 1);
      label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    data.push({ idx: i, label, price: parseFloat(price.toFixed(asset.type === "CRYPTO" ? 0 : 2)) });
  }
  if (data.length) data[data.length - 1].price = asset.price;
  return data;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const glassDeep: React.CSSProperties = {
  background: "rgba(4,14,28,0.93)",
  backdropFilter: "blur(28px)",
  WebkitBackdropFilter: "blur(28px)",
  border: "1px solid rgba(0,180,255,0.22)",
  borderRadius: 20,
};

const T: React.CSSProperties = {
  background: "rgba(0,180,255,0.04)",
  border: "1px solid rgba(0,180,255,0.09)",
  borderRadius: 9,
  padding: "8px 10px",
};

const LABEL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 8,
  color: "rgba(0,180,255,0.4)",
  letterSpacing: "0.1em",
};

const VAL: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  color: "#e0f0ff",
  fontWeight: 500,
};

const SUB: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 10,
  color: "rgba(180,210,255,0.38)",
  marginTop: 2,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, marginTop: 10 }}>
      <div style={{ height: 1, width: 10, background: "rgba(0,180,255,0.22)" }} />
      <span style={{ ...LABEL, letterSpacing: "0.12em" }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(0,180,255,0.07)" }} />
    </div>
  );
}

function MetricTile({
  label, value, sub, accent, span,
}: {
  label: string; value: string; sub?: string; accent?: string; span?: number;
}) {
  return (
    <div style={{ ...T, gridColumn: span ? `span ${span}` : undefined }}>
      <div style={{ ...LABEL, marginBottom: 4 }}>{label}</div>
      <div style={{ ...VAL, color: accent ?? "#e0f0ff" }}>{value}</div>
      {sub && <div style={SUB}>{sub}</div>}
    </div>
  );
}

function RangeBar({
  low, high, pos, price, type,
}: {
  low: number; high: number; pos: number; price: number; type: string;
}) {
  const fmt = (v: number) =>
    type === "CRYPTO"
      ? `$${Number(v).toLocaleString()}`
      : v >= 1000
        ? `$${(v / 1000).toFixed(1)}K`
        : `$${Number(v).toFixed(0)}`;
  return (
    <div style={{ ...T, gridColumn: "span 2" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
        <span style={LABEL}>52-WEEK RANGE</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#00d4ff" }}>
          {fmt(price)}
        </span>
      </div>
      <div style={{ position: "relative", height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 5 }}>
        <div style={{ position: "absolute", left: 0, width: `${pos}%`, height: "100%", background: "linear-gradient(to right,rgba(0,180,255,0.2),#00d4ff)", borderRadius: 2 }} />
        <div style={{ position: "absolute", left: `${pos}%`, top: "50%", transform: "translate(-50%,-50%)", width: 10, height: 10, borderRadius: "50%", background: "#00d4ff", border: "2px solid #04080e", boxShadow: "0 0 5px #00d4ff" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(180,210,255,0.32)" }}>L {fmt(low)}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(180,210,255,0.32)" }}>H {fmt(high)}</span>
      </div>
    </div>
  );
}

function ValuationBlock({
  pe, forwardPe, peg, dividendYield,
}: {
  pe: number | null; forwardPe: number | null; peg: number | null; dividendYield: number | null;
}) {
  const fwdDelta = pe && forwardPe ? ((forwardPe - pe) / pe) * 100 : null;
  const cheaper = fwdDelta !== null && fwdDelta < 0;
  const items = [
    pe && { label: "P/E (TTM)", value: pe.toFixed(1), color: "#e0f0ff", badge: null as null | { val: string; color: string } },
    forwardPe && {
      label: "FWD P/E", value: forwardPe.toFixed(1), color: "#e0f0ff",
      badge: fwdDelta !== null
        ? { val: `${cheaper ? "▼" : "▲"}${Math.abs(fwdDelta).toFixed(0)}%`, color: cheaper ? "#00d282" : "#ff5064" }
        : null,
    },
    peg && { label: "PEG", value: peg.toFixed(2), color: peg < 1 ? "#00d282" : peg < 2 ? "#e0f0ff" : "#ffb800", badge: null },
    dividendYield && { label: "DIV YIELD", value: `${dividendYield}%`, color: "#00d4ff", badge: null },
  ].filter(Boolean) as Array<{ label: string; value: string; color: string; badge: { val: string; color: string } | null }>;

  return (
    <div style={{ ...T, gridColumn: "span 2" }}>
      <div style={{ ...LABEL, marginBottom: 7 }}>VALUATION</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: fwdDelta !== null ? 7 : 0 }}>
        {items.map((item, i) => (
          <div key={i}>
            <div style={{ ...LABEL, marginBottom: 3 }}>{item.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: item.color, fontWeight: 500 }}>
                {item.value}
              </span>
              {item.badge && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: item.badge.color }}>
                  {item.badge.val}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {fwdDelta !== null && (
        <div style={{
          padding: "4px 7px",
          background: cheaper ? "rgba(0,210,130,0.05)" : "rgba(255,80,100,0.05)",
          border: `1px solid ${cheaper ? "rgba(0,210,130,0.12)" : "rgba(255,80,100,0.12)"}`,
          borderRadius: 5,
        }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: cheaper ? "rgba(0,210,130,0.65)" : "rgba(255,80,100,0.65)" }}>
            {cheaper
              ? `Forward estimates imply ${Math.abs(fwdDelta).toFixed(0)}% cheaper than trailing P/E.`
              : `Forward estimates make the stock ${Math.abs(fwdDelta).toFixed(0)}% more expensive than trailing P/E.`}
          </span>
        </div>
      )}
    </div>
  );
}

function RSIGauge({ value }: { value: number }) {
  const r = 30, cx = 40, cy = 36, sw = 5.5, circ = Math.PI * r, pct = value / 100;
  const color = value >= 70 ? "#ff5064" : value <= 30 ? "#00d282" : value >= 55 ? "#ffb800" : "#00b4ff";
  const label = value >= 70 ? "Overbought" : value <= 30 ? "Oversold" : value >= 55 ? "Bullish" : "Neutral";
  const ang = (-180 + pct * 180) * (Math.PI / 180);
  const nx = cx + (r - sw / 2) * Math.cos(ang);
  const ny = cy + (r - sw / 2) * Math.sin(ang);
  return (
    <div style={{ ...T, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 8px 6px" }}>
      <div style={{ ...LABEL, marginBottom: 4, alignSelf: "flex-start" }}>RSI (14)</div>
      <svg width={80} height={42} viewBox="0 0 80 42">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} strokeLinecap="round" />
        {[
          { c: "#00d28228", s: 0, e: 30 },
          { c: "#00b4ff15", s: 30, e: 70 },
          { c: "#ff506428", s: 70, e: 100 },
        ].map((z, i) => {
          const sa = (-180 + (z.s / 100) * 180) * (Math.PI / 180);
          const ea = (-180 + (z.e / 100) * 180) * (Math.PI / 180);
          const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
          const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
          return (
            <path key={i} d={`M ${x1} ${y1} A ${r} ${r} 0 ${z.e - z.s > 50 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={z.c} strokeWidth={sw} />
          );
        })}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${circ * pct} ${circ}`} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.9} />
        <circle cx={cx} cy={cy} r={2.5} fill={color} />
        <text x={cx} y={cy - 8} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={12} fontWeight={500} fill="#e0f0ff">{value}</text>
      </svg>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color, letterSpacing: "0.05em", marginTop: -2 }}>{label}</div>
    </div>
  );
}

function BetaBar({ beta }: { beta: number }) {
  const pct = Math.min(100, (beta / 3) * 100);
  const color = beta > 2 ? "#ff5064" : beta > 1.3 ? "#ffb800" : beta > 0.8 ? "#00b4ff" : "#00d282";
  const label = beta > 2 ? "High Risk" : beta > 1.3 ? "Volatile" : beta > 0.8 ? "Market-Like" : "Defensive";
  return (
    <div style={T}>
      <div style={{ ...LABEL, marginBottom: 5 }}>BETA (MARKET RISK)</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ ...VAL, fontSize: 16 }}>{beta.toFixed(2)}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color, background: `${color}15`, border: `1px solid ${color}25`, borderRadius: 4, padding: "1px 5px" }}>{label}</span>
      </div>
      <div style={{ position: "relative", height: 3, background: "linear-gradient(to right,#00d282,#00b4ff 40%,#ffb800 70%,#ff5064)", borderRadius: 2, marginBottom: 4 }}>
        <div style={{ position: "absolute", left: "33%", top: -2, width: 1, height: 7, background: "rgba(255,255,255,0.18)" }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: "50%", transform: "translate(-50%,-50%)", width: 9, height: 9, borderRadius: "50%", background: color, border: "2px solid #04080e", boxShadow: `0 0 4px ${color}` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {["0", "1.0", "3+"].map(l => (
          <span key={l} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: "rgba(180,210,255,0.28)" }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function ShortInterest({ pct, dtc }: { pct: number | null; dtc: number | null }) {
  if (pct === null) {
    return (
      <div style={T}>
        <div style={{ ...LABEL, marginBottom: 4 }}>SHORT INTEREST</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(180,210,255,0.28)", marginTop: 8 }}>N/A for this asset.</div>
      </div>
    );
  }
  const color = pct > 15 ? "#ff5064" : pct > 7 ? "#ffb800" : "#00d282";
  const risk = pct > 15 ? "High" : pct > 7 ? "Moderate" : "Low";
  return (
    <div style={T}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={LABEL}>SHORT INTEREST</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color, background: `${color}15`, border: `1px solid ${color}25`, borderRadius: 3, padding: "1px 5px" }}>Squeeze: {risk}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <div>
          <div style={{ ...VAL, fontSize: 15 }}>{pct}%</div>
          <div style={{ ...SUB, fontSize: 9 }}>Float short</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ ...VAL, fontSize: 15 }}>{dtc}d</div>
          <div style={{ ...SUB, fontSize: 9 }}>Days to cover</div>
        </div>
      </div>
      <div style={{ position: "relative", height: 2.5, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
        <div style={{ position: "absolute", left: 0, width: `${Math.min(100, (pct / 20) * 100)}%`, height: "100%", background: `linear-gradient(to right,rgba(0,210,130,0.4),${color})`, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function OwnershipRing({
  institutional, insiderActivity, insiderNet,
}: {
  institutional: number; insiderActivity: "buy" | "sell" | "neutral"; insiderNet: number;
}) {
  const retail = 100 - institutional;
  const r = 18, cx = 22, cy = 22, sw = 6, full = 2 * Math.PI * r;
  const actColor = insiderActivity === "buy" ? "#00d282" : insiderActivity === "sell" ? "#ff5064" : "#8a9ab0";
  const actLabel = insiderActivity === "buy" ? "Net Buying" : insiderActivity === "sell" ? "Net Selling" : "Neutral";
  return (
    <div style={{ ...T, display: "grid", gridTemplateColumns: "44px 1fr", gap: 10, alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ ...LABEL, marginBottom: 4, whiteSpace: "nowrap" }}>OWNERSHIP</div>
        <svg width={44} height={44} viewBox="0 0 44 44">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#00b4ff" strokeWidth={sw}
            strokeDasharray={`${(institutional / 100) * full} ${full}`}
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
          <text x={cx} y={cy + 3} textAnchor="middle" fontFamily="JetBrains Mono" fontSize={8} fill="#e0f0ff">{institutional}%</text>
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#00b4ff", marginBottom: 2 }}>{institutional}% Institutional</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(180,210,255,0.38)", marginBottom: 6 }}>{retail}% Retail</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: actColor }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: actColor }}>Insider {actLabel}</span>
          {insiderNet > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(180,210,255,0.3)", marginLeft: 2 }}>
              ${insiderNet}M 90d
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function RevenueBar({ growth, data }: { growth: number | null; data: number[] | null }) {
  if (growth === null || !data || data.length === 0) {
    return (
      <div style={T}>
        <div style={{ ...LABEL, marginBottom: 4 }}>REVENUE GROWTH YOY</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(180,210,255,0.28)", marginTop: 8 }}>N/A</div>
      </div>
    );
  }
  const color = growth > 0 ? "#00d282" : "#ff5064";
  const maxAbs = Math.max(...data.map(Math.abs));
  return (
    <div style={T}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span style={LABEL}>REVENUE GROWTH YOY</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span style={{ ...VAL, fontSize: 15, color }}>{growth > 0 ? "+" : ""}{growth}%</span>
        <span style={{ ...SUB, fontSize: 9 }}>Most recent qtr</span>
      </div>
      <div style={{ display: "flex", gap: 2.5, alignItems: "flex-end", height: 22 }}>
        {data.map((v, i) => {
          const h = (Math.abs(v) / maxAbs) * 20;
          const isLast = i === data.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
              <div style={{
                width: "100%", height: h,
                background: v > 0 ? (isLast ? color : "#00d28260") : (isLast ? color : "#ff506460"),
                borderRadius: "2px 2px 0 0",
                border: isLast ? `1px solid ${color}` : "none",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", marginTop: 2 }}>
        {["Q1", "Q2", "Q3", "Q4"].map(q => (
          <span key={q} style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: "rgba(180,210,255,0.22)", textAlign: "center" }}>{q}</span>
        ))}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(4,14,28,0.97)", border: "1px solid rgba(0,180,255,0.25)", borderRadius: 7, padding: "6px 10px" }}>
      {label && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(0,180,255,0.5)", marginBottom: 2 }}>{label}</div>}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#e0f0ff" }}>${Number(payload[0].value).toLocaleString()}</div>
    </div>
  );
}

// ─── Main SearchPanel ─────────────────────────────────────────────────────────

export interface SearchPanelProps {
  asset: AssetData;
  onClose: () => void;
  navbarRef: RefObject<HTMLElement | null>;
}

export function SearchPanel({ asset, onClose, navbarRef }: SearchPanelProps) {
  const [range, setRange] = useState<ChartRange>("5D");
  const [chartData, setChartData] = useState<ChartPoint[]>(() => genChart(asset, "5D"));
  const panelRef = useRef<HTMLDivElement>(null);

  const isUp = asset.up;
  const typeColor = { STOCK: "#00b4ff", ETF: "#00d282", CRYPTO: "#a78bfa" }[asset.type] ?? "#00b4ff";
  const accent = isUp ? "#00d282" : "#ff5064";
  const fmt = (v: number) =>
    asset.type === "CRYPTO" ? `$${Number(v).toLocaleString()}` : `$${Number(v).toFixed(2)}`;
  const volAccent = asset.volRatio > 1.3 ? "#ff9040" : asset.volRatio > 1.1 ? "#ffb800" : undefined;

  useEffect(() => {
    setChartData(genChart(asset, range));
  }, [asset, range]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !navbarRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => {
      document.addEventListener("mousedown", down);
      document.addEventListener("keydown", key);
    }, 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose, navbarRef]);

  const prices = chartData.map(d => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = (maxP - minP) * 0.12;
  const openPrice = chartData[0]?.price;

  return (
    <>
      {/* Inject keyframe animation once */}
      <style>{`
        @keyframes panelIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);    }
        }
        .panel-scroll::-webkit-scrollbar { width: 3px; }
        .panel-scroll::-webkit-scrollbar-track { background: transparent; }
        .panel-scroll::-webkit-scrollbar-thumb { background: rgba(0,180,255,0.18); border-radius: 2px; }
      `}</style>

      <div
        ref={panelRef}
        className="panel-scroll"
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          width: 640,
          zIndex: 200,
          ...glassDeep,
          boxShadow: "0 36px 90px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,180,255,0.07), inset 0 1px 0 rgba(255,255,255,0.04)",
          animation: "panelIn 0.22s cubic-bezier(0.16,1,0.3,1) both",
          maxHeight: "calc(100vh - 110px)",
          overflowY: "auto",
        }}
      >
        {/* Sentiment accent bar at top */}
        <div style={{
          height: 2,
          background: `linear-gradient(to right, transparent, ${accent} 40%, rgba(0,212,255,0.5) 70%, transparent)`,
          borderRadius: "20px 20px 0 0",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }} />

        <div style={{ padding: "14px 18px 16px" }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            {/* Left: logo + name */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: `${typeColor}12`,
                border: `1px solid ${typeColor}20`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: typeColor, fontWeight: 500 }}>
                  {asset.ticker.slice(0, 2)}
                </span>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                  <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: "#e8f4ff" }}>
                    {asset.ticker}
                  </span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: typeColor,
                    background: `${typeColor}12`, border: `1px solid ${typeColor}20`,
                    borderRadius: 4, padding: "1px 6px", letterSpacing: "0.08em",
                  }}>
                    {asset.type}
                  </span>
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(180,210,255,0.4)" }}>
                  {asset.name} · {asset.sector}
                </div>
              </div>
            </div>

            {/* Right: price */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 23, color: "#e8f4ff", letterSpacing: "-0.02em", lineHeight: 1 }}>
                {fmt(asset.price)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginTop: 4 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: accent }}>
                  {isUp ? "+" : ""}{fmt(asset.change)}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: accent,
                  background: isUp ? "rgba(0,210,130,0.11)" : "rgba(255,80,100,0.11)",
                  border: `1px solid ${isUp ? "rgba(0,210,130,0.24)" : "rgba(255,80,100,0.24)"}`,
                  borderRadius: 4, padding: "1px 5px",
                }}>
                  {isUp ? "+" : ""}{asset.changePct.toFixed(2)}%
                </span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(180,210,255,0.2)", marginTop: 3 }}>
                {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} ET · 15 MIN DELAY
              </div>
            </div>
          </div>

          {/* ── Price history chart ── */}
          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 11, border: "1px solid rgba(0,180,255,0.06)", padding: "8px 4px 4px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 7, paddingRight: 5, marginBottom: 5 }}>
              <span style={{ ...LABEL, letterSpacing: "0.1em" }}>PRICE HISTORY</span>
              <div style={{ display: "flex", gap: 2 }}>
                {(["1D", "5D", "1M", "3M"] as ChartRange[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      padding: "2px 7px", borderRadius: 4, cursor: "pointer",
                      background: range === r ? "rgba(0,180,255,0.15)" : "transparent",
                      border: range === r ? "1px solid rgba(0,180,255,0.3)" : "1px solid transparent",
                      color: range === r ? "#00d4ff" : "rgba(180,210,255,0.28)",
                      transition: "all 0.15s",
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={chartData} margin={{ top: 3, right: 3, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="idx"
                  tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, fill: "rgba(180,210,255,0.2)" }}
                  axisLine={false} tickLine={false}
                  interval="preserveStartEnd"
                  tickFormatter={(idx: number) => chartData[idx]?.label ?? ""}
                />
                <YAxis
                  domain={[minP - pad, maxP + pad]}
                  tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, fill: "rgba(180,210,255,0.2)" }}
                  axisLine={false} tickLine={false} width={46}
                  tickFormatter={(v: number) =>
                    asset.type === "CRYPTO"
                      ? `$${(v / 1000).toFixed(0)}K`
                      : v >= 1000
                        ? `$${(v / 1000).toFixed(1)}K`
                        : `$${v.toFixed(0)}`
                  }
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={openPrice ?? 0} stroke={openPrice ? "rgba(255,255,255,0.09)" : "transparent"} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="price" stroke={accent} strokeWidth={1.5} dot={false} activeDot={{ r: 2.5, fill: accent, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── Price & Volume ── */}
          <SectionLabel text="PRICE & VOLUME" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginBottom: 5 }}>
            <MetricTile label="VOLUME" value={asset.volume} sub={`${asset.volRatio}x avg · ${asset.avgVolume}`} accent={volAccent} />
            <MetricTile label="MARKET CAP" value={asset.marketCap} />
            {asset.pe
              ? <MetricTile label="P/E RATIO" value={asset.pe.toFixed(1)} sub={asset.eps ? `EPS $${asset.eps}` : undefined} />
              : <MetricTile label="ASSET CLASS" value={asset.sector} />
            }
            {asset.nextEarnings
              ? <MetricTile label="NEXT EARNINGS" value={asset.nextEarnings} accent="#ffb800" sub="Est." />
              : <MetricTile label="TYPE" value={asset.type} />
            }
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginBottom: 0 }}>
            <RangeBar low={asset.week52Low} high={asset.week52High} pos={asset.week52Pos} price={asset.price} type={asset.type} />
            {asset.freeCashFlow && <MetricTile label="FREE CASH FLOW" value={asset.freeCashFlow} />}
            {asset.dividendYield && <MetricTile label="DIV YIELD" value={`${asset.dividendYield}%`} accent="#00d4ff" sub="Annual" />}
          </div>

          {/* ── Valuation ── */}
          {(asset.pe || asset.forwardPe) && (
            <>
              <SectionLabel text="VALUATION" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                <ValuationBlock pe={asset.pe} forwardPe={asset.forwardPe} peg={asset.peg} dividendYield={asset.dividendYield} />
              </div>
            </>
          )}

          {/* ── Momentum & Risk ── */}
          <SectionLabel text="MOMENTUM & RISK" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
            <RSIGauge value={asset.rsi} />
            <BetaBar beta={asset.beta} />
            <ShortInterest pct={asset.shortFloatPct} dtc={asset.daysToCover} />
          </div>

          {/* ── Ownership & Growth ── */}
          <SectionLabel text="OWNERSHIP & GROWTH" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 12 }}>
            <OwnershipRing
              institutional={asset.institutionalOwnership}
              insiderActivity={asset.insiderActivity}
              insiderNet={asset.insiderNet}
            />
            <RevenueBar growth={asset.revenueGrowth} data={asset.revenueGrowthQoQ ?? []} />
          </div>

          {/* ── Footer ── */}
          <div style={{ borderTop: "1px solid rgba(0,180,255,0.07)", paddingTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(180,210,255,0.32)", lineHeight: 1.5, margin: 0, flex: 1 }}>
              {asset.description}
            </p>
            <button
              style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 7, background: "rgba(0,180,255,0.09)", border: "1px solid rgba(0,180,255,0.25)", color: "#00d4ff", fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.09)")}
            >
              Full dashboard →
            </button>
          </div>

          <div style={{ marginTop: 7, fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: "rgba(180,210,255,0.12)", letterSpacing: "0.05em", textAlign: "center" }}>
            DATA DELAYED 15 MIN · NOT FINANCIAL ADVICE · FOR INFORMATIONAL PURPOSES ONLY
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Autocomplete dropdown ────────────────────────────────────────────────────

export interface SearchSuggestion {
  ticker: string;
  name: string;
  type: string;
}

export const SEARCH_SUGGESTIONS: SearchSuggestion[] = [
  { ticker: "NVDA", name: "NVIDIA Corporation", type: "STOCK" },
  { ticker: "AAPL", name: "Apple Inc.", type: "STOCK" },
  { ticker: "SPY",  name: "SPDR S&P 500 ETF",  type: "ETF"   },
  { ticker: "MSFT", name: "Microsoft Corporation", type: "STOCK" },
  { ticker: "TSLA", name: "Tesla Inc.", type: "STOCK" },
  { ticker: "BTC",  name: "Bitcoin", type: "CRYPTO" },
];

export function AutocompleteDropdown({
  suggestions,
  onSelect,
  isPopular,
}: {
  suggestions: SearchSuggestion[];
  onSelect: (ticker: string) => void;
  isPopular: boolean;
}) {
  return (
    <div
      onMouseDown={e => e.preventDefault()}
      style={{
        position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 201,
        background: "rgba(8,20,36,0.55)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(0,180,255,0.14)", borderRadius: 10,
        overflow: "hidden", boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
      }}
    >
      {isPopular && (
        <div style={{ padding: "7px 14px 5px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "rgba(0,180,255,0.38)", letterSpacing: "0.12em" }}>POPULAR</span>
        </div>
      )}
      {suggestions.map((s, i) => (
        <div
          key={s.ticker}
          onClick={() => onSelect(s.ticker)}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
            cursor: "pointer",
            borderBottom: i < suggestions.length - 1 ? "1px solid rgba(0,180,255,0.07)" : "none",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.07)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#00d4ff", minWidth: 44 }}>{s.ticker}</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(180,210,255,0.6)", flex: 1 }}>{s.name}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(0,180,255,0.4)",
            background: "rgba(0,180,255,0.08)", border: "1px solid rgba(0,180,255,0.14)",
            borderRadius: 3, padding: "1px 5px",
          }}>
            {s.type}
          </span>
        </div>
      ))}
    </div>
  );
}
