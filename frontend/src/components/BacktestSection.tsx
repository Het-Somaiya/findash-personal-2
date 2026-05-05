/**
 * BacktestSection — orchestrates the asset input, date range picker,
 * backtest API call, and BacktestRibbons visualization.
 *
 * v1: hardcoded 3-leg Strategy (BnH 50% / Weekly DCA 30% / Monthly DCA 20%)
 *     applied to a single user-chosen Asset.
 */

import { useEffect, useRef, useState } from "react";
import { runBacktest, type BacktestResult } from "../lib/api";
import { BacktestRibbons, PNL_POS_CSS, PNL_NEG_CSS } from "./BacktestRibbons";

const DEFAULT_LEGS = [
  { name: "Buy & Hold",  type: "buy_and_hold" as const, weight: 0.50 },
  { name: "Weekly DCA",  type: "dca_weekly"   as const, weight: 0.30 },
  { name: "Monthly DCA", type: "dca_monthly"  as const, weight: 0.20 },
];

const oneYearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
};

const MIN_DATE = new Date(2010, 0, 1);
const MAX_DATE = new Date();

export function BacktestSection() {
  const [asset, setAsset] = useState("SPY");
  const [range, setRange] = useState<{ start: Date; end: Date }>({
    start: oneYearAgo(),
    end:   new Date(),
  });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lifted from DateRangePicker so BacktestRibbons can stay in sync
  const [display, setDisplay] = useState<{ start: number; end: number }>({
    start: oneYearAgo().getTime(),
    end:   new Date().getTime(),
  });
  const [dragKnob, setDragKnob] = useState<"start" | "end" | null>(null);
  // Display target during a drag — gets re-computed on each gear-shift by
  // BacktestRibbons (per-stride zoom-out range). Stays fixed while the
  // user scrubs horizontally within the same stride. `null` when idle.
  const [dragTarget, setDragTarget] = useState<{ start: number; end: number } | null>(null);

  // Display window eases between the drag target (per-stride zoom) and
  // the selected range (while idle). Single ease loop, restarts only when
  // the *target* changes — not on every cursor move.
  const targetStart = dragTarget ? dragTarget.start : range.start.getTime();
  const targetEnd   = dragTarget ? dragTarget.end   : range.end.getTime();
  useEffect(() => {
    let raf = 0;
    function step() {
      let done = false;
      setDisplay(prev => {
        const ds = prev.start + (targetStart - prev.start) * 0.15;
        const de = prev.end   + (targetEnd   - prev.end)   * 0.15;
        if (Math.abs(ds - targetStart) < 1000 && Math.abs(de - targetEnd) < 1000) {
          done = true;
          if (prev.start === targetStart && prev.end === targetEnd) return prev;
          return { start: targetStart, end: targetEnd };
        }
        return { start: ds, end: de };
      });
      if (!done) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetStart, targetEnd]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always backtest the FULL available history. The selected `range` is purely
  // a visual viewport / highlight — it doesn't gate the data. This means the
  // ribbon scene is built once per asset and never rebuilt during knob drags;
  // dragging only animates the bar's display window + the highlight + marker.
  useEffect(() => {
    if (!asset) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await runBacktest({
          asset,
          legs: DEFAULT_LEGS,
          start: MIN_DATE.toISOString().slice(0, 10),
          end:   MAX_DATE.toISOString().slice(0, 10),
          capital: 10000,
        });
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Backtest failed");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [asset]);

  return (
    <section style={{
      padding: "60px 32px",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h2 style={{
          fontFamily: "DM Serif Display, serif",
          fontSize: 32, fontWeight: 400, marginBottom: 8,
        }}>
          Backtest
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 24 }}>
          A 3-leg Strategy applied to one Asset. Click the Position ribbon to expand into Legs.
        </p>

        {/* Asset is now editable inline on the chart's "Backtest: <asset>"
            title (click the symbol to open the search dropdown). */}
        {error && (
          <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}
        {loading && (
          <div style={{
            color: "var(--text-muted)", fontSize: 11,
            fontFamily: "JetBrains Mono, monospace", marginBottom: 8,
            textAlign: "right",
          }}>loading…</div>
        )}

        {/* Unified graph: ribbons fill the entire card. Date range picker
            now lives INSIDE BacktestRibbons (overlaid at top-left/right).
            Knobs are draggable marker lines on the chart itself. */}
        <div style={{
          background: "linear-gradient(180deg, rgba(10,12,20,0.5), rgba(10,12,20,0.2))",
          border: "1px solid var(--glass-border)",
          borderRadius: 8,
          // Visible (not hidden) so the YQMWD column on the outer side of
          // a marker can float past the graph boundary instead of being
          // clipped at the card edge.
          overflow: "visible",
          height: 540,
        }}>
          <BacktestRibbons
            data={result}
            display={display}
            selected={range}
            dragKnob={dragKnob}
            minDate={MIN_DATE}
            maxDate={MAX_DATE}
            onRangeChange={setRange}
            onDragKnobChange={setDragKnob}
            onDragDisplayTargetChange={setDragTarget}
            asset={asset}
            onAssetChange={setAsset}
          />
        </div>

        {/* Leg summary */}
        {result && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12, marginTop: 16,
          }}>
            <LegCard label="Position" curve={result.position.curve} weight={1} accent />
            {result.legs.map(l => (
              <LegCard key={l.name} label={l.name} curve={l.curve} weight={l.weight} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LegCard({ label, curve, weight, accent = false }: {
  label: string;
  curve: { value: number; deployed: number; pnl: number; roi: number }[];
  weight: number;
  accent?: boolean;
}) {
  const last = curve[curve.length - 1];
  if (!last) return null;
  const pnlColor = last.pnl >= 0 ? PNL_POS_CSS : PNL_NEG_CSS;
  return (
    <div style={{
      background: "var(--glass-bg)",
      border: `1px solid ${accent ? "var(--accent-border)" : "var(--glass-border)"}`,
      borderRadius: 6, padding: "10px 14px",
      fontFamily: "JetBrains Mono, monospace", fontSize: 11,
      color: "var(--text-secondary)",
    }}>
      <div style={{
        color: accent ? "var(--accent)" : "var(--text-primary)",
        fontWeight: 600, fontSize: 12, marginBottom: 6,
      }}>{label}</div>
      <div>weight {(weight * 100).toFixed(0)}%</div>
      <div>value ${last.value.toLocaleString()}</div>
      <div>deployed ${last.deployed.toLocaleString()}</div>
      <div style={{ color: pnlColor }}>
        {last.pnl >= 0 ? "+" : ""}${last.pnl.toLocaleString()} ({(last.roi * 100).toFixed(2)}%)
      </div>
    </div>
  );
}
