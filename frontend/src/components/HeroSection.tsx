import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { LandingMarketGlobe } from "./MarketGlobe";
import { SearchPanel, type AssetData } from "./SearchPanel";
import { useAuth } from "../lib/AuthContext";
import {
  getTicker24hBars,
  type BarPoint,
  fetchWatchlistSymbols,
  fetchAssetData,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  reorderWatchlist,
} from "../lib/api";

const serif = "'DM Serif Display', serif";
const sans  = "'DM Sans', sans-serif";
const mono  = "'JetBrains Mono', monospace";

const GLOBE_BG = "#04080f";

interface HeroSectionProps {
  onExploreClick?: () => void;
  selectedAsset?: AssetData | null;
  onAssetSelect?: (asset: AssetData | null) => void;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ bars, up }: { bars: BarPoint[]; up: boolean }) {
  if (!bars.length) return null;
  const color = up ? "#00d282" : "#ff5064";
  const vals = bars.map(b => b.c);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 100, h = 36;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const fillPts = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 36, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${up ? "up" : "dn"}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#sg-${up ? "up" : "dn"})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Rich Dashboard Card ──────────────────────────────────────────────────────

function DashboardCard({
  asset, onRemove, onOpen, isDragging, onDragStart, onDragEnter, onDragEnd,
}: {
  asset: AssetData; onRemove: () => void; onOpen: () => void;
  isDragging: boolean; onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [bars, setBars] = useState<BarPoint[]>([]);
  const up = asset.changePct >= 0;
  const color = up ? "#00d282" : "#ff5064";

  // ✅ FIX 3: Don't add a sign prefix — toFixed already includes "-" for negatives
  const changePctDisplay = `${asset.changePct >= 0 ? "+" : ""}${asset.changePct.toFixed(2)}%`;

  useEffect(() => {
    getTicker24hBars(asset.ticker).then(setBars).catch(() => {});
  }, [asset.ticker]);

  const fmt = (n: number | null | undefined, prefix = "", suffix = "", decimals = 1) =>
    n == null ? "—" : `${prefix}${n.toFixed(decimals)}${suffix}`;

  const fmtLarge = (v: string | number | null | undefined) => {
    if (v == null || v === "—") return "—";
    const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.]/g, "")) : v;
    if (isNaN(n)) return String(v);
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
    return String(v);
  };

  const insiderColor = asset.insiderActivity === "buying" ? "#00d282"
    : asset.insiderActivity === "selling" ? "#ff5064"
    : "rgba(180,210,255,0.45)";
  const insiderLabel = asset.insiderActivity === "buying" ? "INSIDER BUY"
    : asset.insiderActivity === "selling" ? "INSIDER SELL"
    : "INSIDER NEUTRAL";
  const optionsFlow = asset.shortFloatPct != null
    ? Math.max(10, Math.min(90, 50 + asset.shortFloatPct * 2)) : 50;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: isDragging ? "rgba(0,180,255,0.08)" : hovered ? "rgba(255,255,255,0.03)" : "rgba(7,9,18,0.98)",
        border: `1px solid ${isDragging ? "rgba(0,180,255,0.45)" : hovered ? "rgba(0,180,255,0.22)" : `${color}33`}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        transition: "all 0.18s ease", opacity: isDragging ? 0.6 : 1, userSelect: "none",
        flexShrink: 0,
      }}
      onClick={onOpen}
    >
      <div style={{ position: "absolute", top: 10, left: 10, color: "rgba(180,210,255,0.20)", fontSize: 11, cursor: "grab", lineHeight: 1, letterSpacing: 1 }}
        onClick={e => e.stopPropagation()}>⠿</div>
      <button onClick={e => { e.stopPropagation(); onRemove(); }}
        style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "rgba(180,210,255,0.25)", fontSize: 12, cursor: "pointer", padding: "2px 5px", borderRadius: 4, transition: "color 0.15s", zIndex: 2 }}
        onMouseEnter={e => (e.currentTarget.style.color = "#ff5064")}
        onMouseLeave={e => (e.currentTarget.style.color = "rgba(180,210,255,0.25)")}>✕</button>

      <div style={{ padding: "10px 14px 0 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
          <span style={{ fontFamily: mono, fontSize: 13, color: "#e8f4ff", fontWeight: 700, letterSpacing: "0.02em" }}>{asset.ticker}</span>
          <span style={{ fontFamily: mono, fontSize: 8, color: "rgba(180,210,255,0.55)", background: "rgba(180,210,255,0.08)", border: "1px solid rgba(180,210,255,0.15)", borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>
            {asset.type?.toUpperCase() ?? "STOCK"}</span>
          {/* ✅ FIX 3 applied here */}
          <span style={{ marginLeft: "auto", marginRight: 18, fontFamily: mono, fontSize: 11, color, fontWeight: 600 }}>{changePctDisplay}</span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 10, color: "rgba(180,210,255,0.40)", marginBottom: 6, paddingRight: 20 }}>
          {asset.name}{asset.sector && asset.sector !== "—" ? ` · ${asset.sector}` : ""}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: mono, fontSize: 20, color: "#e8f4ff", fontWeight: 600, letterSpacing: "-0.01em" }}>
            {asset.price > 0 ? `$${asset.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>
          <span style={{ fontFamily: mono, fontSize: 11, color }}>
            {asset.change !== 0 ? `${asset.change > 0 ? "▲" : "▼"} $${Math.abs(asset.change).toFixed(2)}` : ""}</span>
        </div>
      </div>

      <div style={{ marginBottom: 4 }}><Sparkline bars={bars} up={up} /></div>

      <div style={{ padding: "0 12px 10px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
          {[
            { label: "VOL",  value: asset.volRatio != null ? `${asset.volRatio.toFixed(2)}×` : "—" },
            { label: "MCAP", value: fmtLarge(asset.marketCap) },
            { label: "P/E",  value: fmt(asset.pe, "", "", 1) },
            { label: "EARN", value: asset.nextEarnings ?? "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.30)", letterSpacing: "0.08em", marginBottom: 1 }}>{label}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(220,235,255,0.75)", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {asset.week52High > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.30)", letterSpacing: "0.06em" }}>52W RANGE</span>
              <span style={{ fontFamily: mono, fontSize: 8, color }}>${asset.price > 0 ? asset.price.toFixed(0) : "—"}</span>
            </div>
            <div style={{ position: "relative", height: 3, background: "rgba(180,210,255,0.10)", borderRadius: 2 }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: `${asset.week52Pos ?? 50}%`, height: "100%", background: `linear-gradient(to right, rgba(0,180,255,0.3), ${color})`, borderRadius: 2 }} />
              <div style={{ position: "absolute", top: -2, left: `calc(${asset.week52Pos ?? 50}% - 3px)`, width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.25)" }}>L ${asset.week52Low?.toFixed(0) ?? "—"}</span>
              <span style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.25)" }}>H ${asset.week52High?.toFixed(0) ?? "—"}</span>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
          {[
            { label: "RSI (14)", value: asset.rsi != null ? asset.rsi.toFixed(0) : "—", color: asset.rsi != null ? (asset.rsi > 70 ? "#ff5064" : asset.rsi < 30 ? "#00d282" : "rgba(220,235,255,0.75)") : "rgba(220,235,255,0.75)" },
            { label: "BETA",    value: fmt(asset.beta, "", "", 2), color: "rgba(220,235,255,0.75)" },
            { label: "SHORT%",  value: fmt(asset.shortFloatPct, "", "%", 1), color: "rgba(220,235,255,0.75)" },
            { label: "INST%",   value: fmt(asset.institutionalOwnership, "", "%", 0), color: "rgba(220,235,255,0.75)" },
          ].map(({ label, value, color: c }) => (
            <div key={label}>
              <div style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.30)", letterSpacing: "0.08em", marginBottom: 1 }}>{label}</div>
              <div style={{ fontFamily: mono, fontSize: 10, color: c, fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 8, color: "rgba(180,210,255,0.45)", flexWrap: "wrap" }}>
          <span style={{ color: insiderColor, fontWeight: 600 }}>● {insiderLabel}</span>
          {asset.insiderNet != null && asset.insiderNet !== 0 && <span style={{ color: insiderColor }}>${Math.abs(asset.insiderNet / 1e6).toFixed(1)}M</span>}
          {asset.forwardPe != null && <span>| FWD P/E {asset.forwardPe.toFixed(1)}</span>}
          {asset.freeCashFlow != null && <span>| FCF {fmtLarge(asset.freeCashFlow)}</span>}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.30)", letterSpacing: "0.06em", marginBottom: 2 }}>REV GROWTH</div>
            <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: asset.revenueGrowth != null ? (asset.revenueGrowth > 0 ? "#00d282" : "#ff5064") : "rgba(180,210,255,0.45)" }}>
              {asset.revenueGrowth != null ? `${asset.revenueGrowth > 0 ? "+" : ""}${(asset.revenueGrowth * 100).toFixed(1)}%` : "N/A"}</div>
          </div>
          <div style={{ flex: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.30)", letterSpacing: "0.06em" }}>OPTIONS FLOW</span>
              <span style={{ fontFamily: mono, fontSize: 7, color: "rgba(180,210,255,0.30)" }}>C {optionsFlow.toFixed(0)}% P {(100 - optionsFlow).toFixed(0)}%</span>
            </div>
            <div style={{ position: "relative", height: 4, background: "rgba(255,80,100,0.25)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: `${optionsFlow}%`, height: "100%", background: "rgba(0,210,130,0.6)", borderRadius: 2 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Logged-In Hero ────────────────────────────────────────────────────────────

function LoggedInHero() {
  const navbarRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const [floatingAsset, setFloatingAsset] = useState<AssetData | null>(null);
  const [dashboardStocks, setDashboardStocks] = useState<AssetData[]>([]);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Tracks which ticker was JUST added so the button flips to "✓ ADDED"
  // instantly on click, independent of all state timing / re-render issues
  const [addedTicker, setAddedTicker] = useState<string | null>(null);

  const dashboardVisible = dashboardOpen && dashboardStocks.length > 0;

  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), 580);
    return () => clearTimeout(timer);
  }, [dashboardVisible]);

  // Hydrate persisted watchlist on login: fetch symbols, then full asset data per symbol.
  // Leaves the panel collapsed to the "OPEN DASHBOARD" pill — user clicks to expand.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const symbols = await fetchWatchlistSymbols();
        if (cancelled || symbols.length === 0) return;
        const assets = await Promise.all(
          symbols.map(s => fetchAssetData(s).catch(() => null))
        );
        if (cancelled) return;
        const valid = assets.filter((a): a is AssetData => !!a && !!a.ticker);
        if (valid.length) setDashboardStocks(valid);
      } catch { /* user has no watchlist yet, or auth failed — leave empty */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleAddToDashboard = useCallback((asset: AssetData) => {
    // 1. Instantly flip the button UI
    setAddedTicker(asset.ticker);
    // 2. Add to list (optimistic)
    setDashboardStocks(prev => {
      if (prev.find(s => s.ticker === asset.ticker)) return prev;
      return [...prev, asset];
    });
    // 3. Persist to server (fire-and-forget; idempotent on backend)
    addWatchlistSymbol(asset.ticker).catch(() => { /* ignore; UI already updated */ });
    // 4. Open panel after short delay so globe resize doesn't interfere
    setTimeout(() => setDashboardOpen(true), 50);
  }, []);

  // Reset addedTicker when a different bubble is opened
  useEffect(() => {
    setAddedTicker(null);
  }, [floatingAsset?.ticker]);

  useEffect(() => {
    const handler = (e: Event) => {
      const asset = (e as CustomEvent<AssetData>).detail;
      handleAddToDashboard(asset);
    };
    window.addEventListener("addToDashboard", handler);
    return () => window.removeEventListener("addToDashboard", handler);
  }, [handleAddToDashboard]);

  // Fired by Navbar when a logged-in user selects a ticker from search —
  // opens the floating tile without auto-adding to watchlist
  useEffect(() => {
    const handler = (e: Event) => {
      const asset = (e as CustomEvent<AssetData>).detail;
      setFloatingAsset(asset);
    };
    window.addEventListener("selectAsset", handler);
    return () => window.removeEventListener("selectAsset", handler);
  }, []);

  const handleRemoveFromDashboard = useCallback((ticker: string) => {
    setDashboardStocks(prev => {
      const next = prev.filter(s => s.ticker !== ticker);
      if (next.length === 0) setDashboardOpen(false);
      return next;
    });
    removeWatchlistSymbol(ticker).catch(() => { /* ignore; UI already updated */ });
  }, []);

  // Show green badge if just clicked OR already in dashboard list
  const isInDashboard = floatingAsset != null && (
    addedTicker === floatingAsset.ticker ||
    dashboardStocks.some(s => s.ticker === floatingAsset.ticker)
  );

  const handleDragEnd = useCallback(() => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setDashboardStocks(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(dragOverIdx, 0, moved);
        reorderWatchlist(next.map(s => s.ticker)).catch(() => { /* ignore */ });
        return next;
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, dragOverIdx]);

  // Memoize the globe so it NEVER remounts when dashboardVisible changes
  const globeMemo = useMemo(() => (
    <LandingMarketGlobe onTickerClick={setFloatingAsset} />
  ), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section style={{ position: "relative", height: "100vh", overflow: "visible", background: GLOBE_BG }}>
      <style>{`
        @keyframes panelSlideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes floatIn { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .dash-scroll::-webkit-scrollbar { width: 3px; }
        .dash-scroll::-webkit-scrollbar-track { background: transparent; }
        .dash-scroll::-webkit-scrollbar-thumb { background: rgba(0,180,255,0.18); border-radius: 2px; }
      `}</style>

      {/* Globe — width transitions but globe itself never remounts */}
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: dashboardVisible ? "65%" : "100%",
        height: "100%",
        overflow: "hidden",
        transition: "width 0.55s cubic-bezier(0.16,1,0.3,1)",
        zIndex: 1,
      }}>
        {globeMemo}
      </div>

      {/* Right panel background */}
      {dashboardVisible && (
        <div style={{ position: "absolute", top: 0, right: 0, width: "35%", height: "100%", zIndex: 2, background: `linear-gradient(to bottom, #042e38 0%, #03212a 15%, #021820 30%, #021218 45%, #060e14 60%, #050a10 75%, #04080c 88%, #030609 100%)`, pointerEvents: "none", animation: "panelSlideIn 0.45s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 60, height: "100%", background: `linear-gradient(to right, ${GLOBE_BG}, transparent)`, zIndex: 3, pointerEvents: "none" }} />
        </div>
      )}

      {/* Dashboard Panel */}
      {dashboardVisible && (
        <div style={{ position: "absolute", top: 72, right: 0, width: "35%", height: "calc(100vh - 72px)", zIndex: 110, display: "flex", flexDirection: "column", animation: "panelSlideIn 0.45s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 10px", borderBottom: "1px solid rgba(0,180,255,0.08)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.12em", fontWeight: 600 }}>MY DASHBOARD</span>
              <span style={{ fontFamily: sans, fontSize: 10, color: "rgba(180,210,255,0.35)" }}>{dashboardStocks.length} saved · drag to reorder</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00d4ff", boxShadow: "0 0 5px #00d4ff" }} />
              <button onClick={() => setDashboardOpen(false)}
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 5, color: "rgba(180,210,255,0.50)", fontFamily: mono, fontSize: 9, padding: "3px 10px", cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,80,100,0.10)"; e.currentTarget.style.color = "#ff5064"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(180,210,255,0.50)"; }}>
                CLOSE
                <span style={{ background: "rgba(180,210,255,0.12)", borderRadius: 3, padding: "0 5px", fontFamily: mono, fontSize: 9, color: "rgba(180,210,255,0.60)" }}>{dashboardStocks.length}</span>
              </button>
            </div>
          </div>
          <div style={{ padding: "5px 16px", fontFamily: mono, fontSize: 8, color: "rgba(180,210,255,0.20)", letterSpacing: "0.06em", flexShrink: 0 }}>
            CLICK TILE → OPEN DETAILS &nbsp;·&nbsp; DRAG ⠿ → REORDER
          </div>
          <div className="dash-scroll" style={{ overflowY: "auto", padding: "6px 12px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            {dashboardStocks.map((stock, i) => (
              <DashboardCard key={stock.ticker} asset={stock}
                onRemove={() => handleRemoveFromDashboard(stock.ticker)}
                onOpen={() => setFloatingAsset(stock)}
                isDragging={dragIdx === i}
                onDragStart={() => setDragIdx(i)}
                onDragEnter={() => setDragOverIdx(i)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        </div>
      )}

      {/* Open Dashboard button */}
      {!dashboardOpen && dashboardStocks.length > 0 && (
        <button onClick={() => setDashboardOpen(true)}
          style={{ position: "absolute", top: 88, right: 20, zIndex: 110, background: "rgba(5,7,14,0.90)", border: "1px solid rgba(0,180,255,0.30)", borderRadius: 8, color: "#00d4ff", fontFamily: mono, fontSize: 10, padding: "7px 14px", cursor: "pointer", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 7, backdropFilter: "blur(10px)", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,180,255,0.12)"; e.currentTarget.style.borderColor = "rgba(0,180,255,0.55)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(5,7,14,0.90)"; e.currentTarget.style.borderColor = "rgba(0,180,255,0.30)"; }}>
          <span style={{ background: "rgba(0,180,255,0.18)", borderRadius: 3, padding: "0px 5px", fontSize: 9 }}>{dashboardStocks.length}</span>
          OPEN DASHBOARD
        </button>
      )}

      {/* Floating tile */}
      {floatingAsset && (
        <div style={{ position: "absolute", inset: 0, zIndex: 110 }}>
          {/* Backdrop — click outside tile to close.
              Uses onMouseDown + target check so button clicks inside the tile
              never bubble up and accidentally close it. */}
          <div
            style={{ position: "absolute", inset: 0, background: "transparent", cursor: "default" }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setFloatingAsset(null); }}
          />
          {/* Centering wrapper */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: "min(460px, 88vw)",
                maxHeight: "calc(100vh - 80px)",
                display: "flex", flexDirection: "column", gap: 8,
                pointerEvents: "auto",
                animation: "floatIn 0.35s cubic-bezier(0.16,1,0.3,1) both",
                marginRight: dashboardVisible ? "35%" : 0,
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {isInDashboard ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10, color: "#00d282", background: "rgba(0,210,130,0.10)", border: "1px solid rgba(0,210,130,0.25)", borderRadius: 6, padding: "5px 12px" }}>
                    <span>✓</span><span>IN DASHBOARD</span>
                  </div>
                ) : (
                  <button
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleAddToDashboard(floatingAsset); }}
                    style={{ background: "rgba(0,180,255,0.12)", border: "1px solid rgba(0,180,255,0.35)", borderRadius: 6, color: "#00d4ff", fontFamily: mono, fontSize: 10, padding: "5px 14px", cursor: "pointer", letterSpacing: "0.06em", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,180,255,0.22)"; e.currentTarget.style.borderColor = "rgba(0,180,255,0.60)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,180,255,0.12)"; e.currentTarget.style.borderColor = "rgba(0,180,255,0.35)"; }}
                  >
                    <span style={{ fontSize: 13 }}>+</span>
                    <span>ADD TO DASHBOARD</span>
                  </button>
                )}
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setFloatingAsset(null); }}
                  style={{ background: "rgba(10,12,20,0.75)", border: "1px solid rgba(0,180,255,0.20)", borderRadius: 7, color: "rgba(180,210,255,0.55)", fontFamily: mono, fontSize: 11, padding: "5px 14px", cursor: "pointer", backdropFilter: "blur(10px)", transition: "all 0.15s", letterSpacing: "0.05em" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,180,255,0.12)"; e.currentTarget.style.color = "#00d4ff"; e.currentTarget.style.borderColor = "rgba(0,180,255,0.40)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(10,12,20,0.75)"; e.currentTarget.style.color = "rgba(180,210,255,0.55)"; e.currentTarget.style.borderColor = "rgba(0,180,255,0.20)"; }}
                >
                  ✕ close
                </button>
              </div>

              <div className="dash-scroll" style={{ overflowY: "auto", borderRadius: 20, maxHeight: "calc(100vh - 160px)" }}>
                <SearchPanel asset={floatingAsset} onClose={() => setFloatingAsset(null)} navbarRef={navbarRef} inline={true} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE badge */}
      <div style={{ position: "absolute", top: 88, left: 32, zIndex: 20, display: "flex", alignItems: "center", gap: 9, pointerEvents: "none" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00d4ff", boxShadow: "0 0 8px #00d4ff" }} />
        <span style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.09em", fontWeight: 500 }}>LIVE</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(200,225,255,0.55)", letterSpacing: "0.09em" }}>MARKET OVERVIEW</span>
      </div>

      {!floatingAsset && (
        <div style={{ position: "absolute", bottom: 34, left: "50%", transform: "translateX(-50%)", zIndex: 6, pointerEvents: "none", opacity: 0.4 }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(0,180,255,0.9)", letterSpacing: "0.15em" }}>CLICK A BUBBLE TO EXPLORE</span>
        </div>
      )}
    </section>
  );
}

// ─── Logged-Out Hero ──────────────────────────────────────────────────────────

function LoggedOutHero({ onExploreClick }: { onExploreClick?: () => void }) {
  const navigate = useNavigate();
  return (
    <section style={{ position: "relative", height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}><LandingMarketGlobe onTickerClick={undefined} /></div>
      <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "rgba(4,12,24,0.05)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(160,215,255,0.02) 35%, transparent 58%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 2, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", maskImage: "radial-gradient(ellipse 340px 300px at 50% 50%, black 0%, black 25%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 340px 300px at 50% 50%, black 0%, black 25%, transparent 100%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200, background: "linear-gradient(to top, #060810 0%, transparent 100%)", zIndex: 3, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 108, right: 32, zIndex: 4, display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00d4ff", boxShadow: "0 0 8px #00d4ff" }} />
        <span style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.09em", fontWeight: 500 }}>LIVE</span>
        <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(200,225,255,0.55)", letterSpacing: "0.09em" }}>MARKET OVERVIEW</span>
      </div>
      <div style={{ position: "relative", zIndex: 4, textAlign: "center", maxWidth: 540, padding: "0 24px", width: "100%", pointerEvents: "none" }}>
        <div className="anim-1" style={{ padding: "44px 54px", pointerEvents: "none" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: "#00d4ff", letterSpacing: "0.18em", marginBottom: 20, opacity: 0.75 }}>MARKET INTELLIGENCE PLATFORM</div>
          <h1 style={{ fontFamily: serif, fontSize: 54, lineHeight: 1.06, color: "#e8f4ff", marginBottom: 18, letterSpacing: "-0.01em" }}>
            The market,<br /><em style={{ color: "#00d4ff", fontStyle: "italic" }}>visible.</em>
          </h1>
          <p className="anim-2" style={{ fontFamily: sans, fontSize: 16, color: "rgba(180,210,255,0.65)", lineHeight: 1.7, fontWeight: 300, maxWidth: 420, margin: "0 auto 34px" }}>
            Institutional-grade options analytics, AI filing intelligence, and strategy simulation — from the first search to the last trade.
          </p>
          <div className="anim-3" style={{ display: "flex", gap: 12, justifyContent: "center", pointerEvents: "auto" }}>
            <button onClick={onExploreClick} style={{ padding: "12px 28px", borderRadius: 10, background: "rgba(0,180,255,0.18)", border: "1px solid rgba(0,180,255,0.40)", color: "#00d4ff", fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "background 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.30)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.18)")}>Explore free ↓</button>
            <button onClick={() => navigate("/register")} style={{ padding: "12px 28px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(200,225,255,0.70)", fontFamily: sans, fontSize: 14, cursor: "pointer", transition: "background 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}>See what's locked</button>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 34, left: "50%", transform: "translateX(-50%)", zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.35 }}>
        <div style={{ width: 1, height: 38, background: "linear-gradient(to bottom, transparent, rgba(0,180,255,0.9))" }} />
        <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(0,180,255,0.9)", letterSpacing: "0.15em" }}>SCROLL</span>
      </div>
    </section>
  );
}

export function HeroSection({ onExploreClick }: HeroSectionProps) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <LoggedInHero />;
  return <LoggedOutHero onExploreClick={onExploreClick} />;
}