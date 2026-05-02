/**
 * DateRangePicker
 *
 * Minimal header showing the two range dates as clickable text. Clicking a
 * date opens a 3-layer popover panel (year / month / day). Cursor Y picks
 * the active layer, cursor X picks the cell. Click outside (or Esc / Enter)
 * commits and closes; Esc cancels.
 *
 * The bar + knobs that used to live here have moved into BacktestRibbons
 * (where they're rendered as draggable marker lines on the graph itself).
 */

import { forwardRef, useEffect, useReducer, useRef, useState } from "react";
// Read inside component bodies only (never at module scope) — BacktestRibbons
// imports this file and we import a const from there, so module-scope access
// would hit the temporal dead zone during the circular load.
import { YELLOW_LABEL_CSS } from "./BacktestRibbons";

interface Props {
  value:    { start: Date; end: Date };
  onChange: (next: { start: Date; end: Date }) => void;
  min?:     Date;
  max?:     Date;
  /** Refs into the start/end date <span>s. Lets the canvas tick loop
   *  imperatively rewrite their textContent on every frame so the dates
   *  stay locked to the dragged markers, bypassing React batching. */
  startTextRef?: React.Ref<HTMLSpanElement>;
  endTextRef?:   React.Ref<HTMLSpanElement>;
}

type Layer  = "year" | "month" | "day";

interface PendingDate { year: number; month: number; day: number }
interface EditorMutable { pending: PendingDate; activeLayer: Layer }

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MS_DAY = 86_400_000;

// Yellow palette — default text uses `YELLOW_LABEL_CSS` directly inside
// component bodies (NOT at module scope; see import comment above). The
// active / background / glow shades stay distinct so the editor pops.
const YELLOW_ACTIVE = "#ffd700";                  // active text / selected cell
const YELLOW_BG_LO  = "rgba(255, 215, 0, 0.10)"; // hover background
const YELLOW_BG_MID = "rgba(255, 215, 0, 0.18)"; // active layer background
const YELLOW_DIM    = "rgba(255, 215, 0, 0.50)"; // selected-but-inactive cell
const YELLOW_GLOW   = "rgba(255, 215, 0, 0.80)"; // box-shadow glow

export function DateRangePicker({ value, onChange, min, max, startTextRef, endTextRef }: Props) {
  const minDate = min ?? new Date(2010, 0, 1);
  const maxDate = max ?? new Date();
  const minMs = minDate.getTime();
  const maxMs = maxDate.getTime();

  const [editorKnob, setEditorKnob] = useState<"start" | "end" | null>(null);
  const editorRef = useRef<EditorMutable>({
    pending: { year: 0, month: 0, day: 1 },
    activeLayer: "year",
  });
  const [, forceRender] = useReducer((x: number) => x + 1, 0);

  const panelRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!editorKnob) return;

    function onMove(ev: PointerEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const layerH = rect.height / 3;
      const relX = ev.clientX - rect.left;
      const relY = ev.clientY - rect.top;
      let layer: Layer = "year";
      if      (relY >= 2 * layerH) layer = "day";
      else if (relY >= layerH)     layer = "month";
      const xPct = clamp01(relX / rect.width);
      const cur  = editorRef.current.pending;
      const next: PendingDate = { ...cur };

      if (layer === "year") {
        const ys = enabledYears(next, minDate, maxDate);
        if (ys.length) next.year = ys[clamp(Math.floor(xPct * ys.length), 0, ys.length - 1)];
      } else if (layer === "month") {
        const ms = enabledMonths(next, minDate, maxDate);
        if (ms.length) next.month = ms[clamp(Math.floor(xPct * ms.length), 0, ms.length - 1)];
      } else {
        const dayY = relY - 2 * layerH;
        const row = dayY < layerH / 2 ? 0 : 1;
        const col = clamp(Math.floor(xPct * 16), 0, 15);
        const target = row * 16 + col + 1;
        const dim = daysIn(next.year, next.month);
        let day = Math.min(target, dim);
        const ms = new Date(next.year, next.month, day).getTime();
        if      (ms < minMs && next.year === minDate.getFullYear() && next.month === minDate.getMonth()) day = minDate.getDate();
        else if (ms > maxMs && next.year === maxDate.getFullYear() && next.month === maxDate.getMonth()) day = maxDate.getDate();
        next.day = day;
      }
      const dim = daysIn(next.year, next.month);
      if (next.day > dim) next.day = dim;

      const candidateMs = makeDate(next).getTime();
      if      (candidateMs < minMs) Object.assign(next, dateToPending(minDate));
      else if (candidateMs > maxMs) Object.assign(next, dateToPending(maxDate));

      editorRef.current.pending = next;
      editorRef.current.activeLayer = layer;
      forceRender();
    }

    function commit() {
      const p = editorRef.current.pending;
      const newDate = makeDate(p);
      const v = valueRef.current;
      let s = v.start.getTime();
      let e = v.end.getTime();
      if (editorKnob === "start") s = newDate.getTime();
      else                         e = newDate.getTime();
      if (s > e) [s, e] = [e, s];
      s = clampMs(s, minMs, maxMs);
      e = clampMs(e, minMs, maxMs);
      if (e - s < MS_DAY) e = s + MS_DAY;
      onChange({ start: new Date(s), end: new Date(e) });
    }

    function onUp() { commit(); setEditorKnob(null); }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setEditorKnob(null);
    }

    window.addEventListener("pointermove",   onMove);
    window.addEventListener("pointerup",     onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown",       onKey);
    return () => {
      window.removeEventListener("pointermove",   onMove);
      window.removeEventListener("pointerup",     onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown",       onKey);
    };
  }, [editorKnob, onChange, minDate, maxDate, minMs, maxMs]);

  function openEditor(knob: "start" | "end") {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      const d = knob === "start" ? value.start : value.end;
      editorRef.current = { pending: dateToPending(d), activeLayer: "year" };
      setEditorKnob(knob);
    };
  }

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "10px 14px 6px",
      fontFamily: "JetBrains Mono, monospace", fontSize: 11,
      color: YELLOW_LABEL_CSS,
    }}>
      <DateText value={value.start} active={editorKnob === "start"} onMouseDown={openEditor("start")} textRef={startTextRef}>
        {editorKnob === "start" && (
          <KnobPanel ref={panelRef} editorRef={editorRef} minDate={minDate} maxDate={maxDate} />
        )}
      </DateText>
      <DateText value={value.end} active={editorKnob === "end"} onMouseDown={openEditor("end")} textRef={endTextRef}>
        {editorKnob === "end" && (
          <KnobPanel ref={panelRef} editorRef={editorRef} minDate={minDate} maxDate={maxDate} />
        )}
      </DateText>
    </div>
  );
}

// ── DateText (header click target) ──────────────────────────────────────────

function DateText({ value, active, onMouseDown, children, textRef }: {
  value: Date;
  active: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  textRef?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <span
      onMouseDown={onMouseDown}
      style={{
        position: "relative",
        color: active ? YELLOW_ACTIVE : YELLOW_LABEL_CSS,
        cursor: "pointer",
        userSelect: "none",
        padding: "2px 4px",
        borderRadius: 3,
        background: active ? YELLOW_BG_LO : "transparent",
        transition: "background 0.12s ease, color 0.12s ease",
      }}
    >
      <span ref={textRef}>{formatDate(value)}</span>
      {children}
    </span>
  );
}

// ── Popover panel (year / month / day layers) ───────────────────────────────

interface KnobPanelProps {
  editorRef: React.MutableRefObject<EditorMutable>;
  minDate:   Date;
  maxDate:   Date;
}

const KnobPanel = forwardRef<HTMLDivElement, KnobPanelProps>(
  function KnobPanel({ editorRef, minDate, maxDate }, ref) {
    const { pending, activeLayer } = editorRef.current;
    const ys = enabledYears(pending, minDate, maxDate);
    const ms = enabledMonths(pending, minDate, maxDate);

    return (
      <div ref={ref} style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 64, height: 64,
        background: "rgba(10, 12, 20, 0.32)",
        borderRadius: 6,
        backdropFilter: "blur(22px) saturate(1.3)",
        WebkitBackdropFilter: "blur(22px) saturate(1.3)",
        boxShadow: [
          "0 12px 32px rgba(0,0,0,0.55)",
          "inset 0 1px 0 rgba(255,255,255,0.08)",
          "inset 0 -1px 0 rgba(255,255,255,0.02)",
        ].join(", "),
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
      }}>
        <PanelLayer values={ys} selectedValue={pending.year}  active={activeLayer === "year"}  valueText={String(pending.year)} />
        <PanelLayer values={ms} selectedValue={pending.month} active={activeLayer === "month"} valueText={MONTH_NAMES[pending.month]} />
        <DayLayer pending={pending} minDate={minDate} maxDate={maxDate} active={activeLayer === "day"} valueText={String(pending.day)} />
      </div>
    );
  },
);

function PanelLayer({ values, selectedValue, active, valueText }: {
  values: number[];
  selectedValue: number;
  active: boolean;
  valueText: string;
}) {
  return (
    <div style={{
      position: "relative",
      flex: 1,
      borderRadius: 3,
      margin: 1,
      background: active ? YELLOW_BG_MID : "transparent",
      transition: "background 0.12s ease",
      overflow: "hidden",
    }}>
      {active && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
          <CellRow values={values} selectedValue={selectedValue} active={active} />
        </div>
      )}
      <ValueOverlay text={valueText} active={active} />
    </div>
  );
}

function DayLayer({ pending, minDate, maxDate, active, valueText }: {
  pending: PendingDate;
  minDate: Date;
  maxDate: Date;
  active: boolean;
  valueText: string;
}) {
  const dim = daysIn(pending.year, pending.month);
  const minMs = minDate.getTime();
  const maxMs = maxDate.getTime();
  const dayFor = (row: 0 | 1, col: number) => Math.min(row * 16 + col + 1, dim);
  const cellDisabled = (row: 0 | 1, col: number) => {
    const day = dayFor(row, col);
    const t = new Date(pending.year, pending.month, day).getTime();
    return t < minMs || t > maxMs;
  };
  return (
    <div style={{
      position: "relative",
      flex: 1,
      borderRadius: 3,
      margin: 1,
      background: active ? YELLOW_BG_MID : "transparent",
      transition: "background 0.12s ease",
      overflow: "hidden",
    }}>
      {active && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
          {([0, 1] as const).map(row => (
            <div key={row} style={{ flex: 1, display: "flex" }}>
              {Array.from({ length: 16 }, (_, col) => {
                const day = dayFor(row, col);
                const isSelected = day === pending.day;
                const disabled = cellDisabled(row, col);
                const bright = (row + col) % 2 === 1;
                return (
                  <div key={col} style={{
                    flex: 1,
                    background: isSelected
                      ? YELLOW_ACTIVE
                      : disabled
                        ? "rgba(180, 210, 255, 0.03)"
                        : (bright
                          ? "rgba(180, 210, 255, 0.16)"
                          : "rgba(180, 210, 255, 0.08)"),
                    boxShadow: isSelected ? `0 0 6px ${YELLOW_GLOW}` : "none",
                    transition: "background 0.08s ease",
                  }} />
                );
              })}
            </div>
          ))}
        </div>
      )}
      <ValueOverlay text={valueText} active={active} />
    </div>
  );
}

function CellRow({ values, selectedValue, active }: {
  values: number[];
  selectedValue: number;
  active: boolean;
}) {
  if (values.length === 0) return <div style={{ flex: 1 }} />;
  return (
    <div style={{ flex: 1, display: "flex" }}>
      {values.map((v, i) => {
        const isSelected = v === selectedValue;
        return (
          <div key={v} style={{
            flex: 1,
            background: isSelected
              ? (active ? YELLOW_ACTIVE : YELLOW_DIM)
              : (i % 2 === 0
                ? "rgba(180, 210, 255, 0.08)"
                : "rgba(180, 210, 255, 0.16)"),
            boxShadow: isSelected && active ? `0 0 6px ${YELLOW_GLOW}` : "none",
            transition: "background 0.08s ease, flex 0.15s ease",
          }} />
        );
      })}
    </div>
  );
}

function ValueOverlay({ text, active }: { text: string; active: boolean }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 11, fontWeight: 600,
      color: active ? YELLOW_ACTIVE : YELLOW_LABEL_CSS,
      textShadow: "0 1px 3px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.7)",
      pointerEvents: "none",
      letterSpacing: 0.3,
    }}>{text}</div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function clampMs(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

function daysIn(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function enabledYears(p: PendingDate, minDate: Date, maxDate: Date): number[] {
  const out: number[] = [];
  for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) {
    const dim = daysIn(y, p.month);
    const candidate = new Date(y, p.month, Math.min(p.day, dim));
    if (candidate.getTime() >= minDate.getTime() && candidate.getTime() <= maxDate.getTime()) {
      out.push(y);
    }
  }
  return out;
}

function enabledMonths(p: PendingDate, minDate: Date, maxDate: Date): number[] {
  const out: number[] = [];
  for (let m = 0; m < 12; m++) {
    const dim = daysIn(p.year, m);
    const candidate = new Date(p.year, m, Math.min(p.day, dim));
    if (candidate.getTime() >= minDate.getTime() && candidate.getTime() <= maxDate.getTime()) {
      out.push(m);
    }
  }
  return out;
}

function makeDate(p: PendingDate): Date {
  const dim = daysIn(p.year, p.month);
  return new Date(p.year, p.month, Math.min(p.day, dim));
}

function dateToPending(d: Date): PendingDate {
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
