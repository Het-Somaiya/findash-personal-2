/**
 * BacktestRibbons — 3D ribbons visualizing a Position and its Legs.
 *
 * Layout:
 *   X = time (left → right)
 *   Y = leg / position equity value
 *   Z = depth — when expanded, legs stack along Z
 *
 * Modes:
 *   collapsed → one Position ribbon centered at z=0
 *   expanded  → N leg ribbons spread along Z; Position ribbon faded out
 *
 * Animation: click ribbon to expand; click bg / Esc to collapse.
 *   During expansion, legs ease out from z=0 to spread positions (current ribbon
 *   "expands outward" — its siblings would fade out, but in v1 the Position has
 *   no siblings, so only its own fade-out + leg fade-in plays).
 */

import { Fragment, forwardRef, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { BacktestResult, BacktestLeg, BacktestPoint, TickerSuggestion } from "../lib/api";
import { searchTickers } from "../lib/api";
import { DateRangePicker } from "./DateRangePicker";

interface Props {
  data:   BacktestResult | null;
  /** Show absolute (un-weighted) ROI instead of dollar value when true */
  absolute?: boolean;
  /** Bar's currently-displayed window (ms). Drives ribbon X transform. */
  display?:  { start: number; end: number };
  /** The selected range — highlighted within the ribbon when display ≠ selected. */
  selected?: { start: Date; end: Date };
  /** Which knob is currently being dragged (if any). Used for visual emphasis. */
  dragKnob?: "start" | "end" | null;
  /** Available date bounds (used to clamp drag scrub) */
  minDate?:  Date;
  maxDate?:  Date;
  /** Range update callback — fired during marker drag */
  onRangeChange?:    (next: { start: Date; end: Date }) => void;
  /** Drag-state callback — informs parent which knob is held */
  onDragKnobChange?: (knob: "start" | "end" | null) => void;
  /** Display window target during drag — computed on gear-shift, fixed for
   *  the rest of the stride. `null` when not dragging. */
  onDragDisplayTargetChange?: (target: { start: number; end: number } | null) => void;
  /** Currently-selected asset (drives the title). May differ briefly from
   *  `data.asset` while a new backtest is in flight. */
  asset?: string;
  /** User picked a new asset from the inline title search. */
  onAssetChange?: (asset: string) => void;
}

// Per-stride zoom-out range (added beyond the dragged knob's current date).
// `year` is special-cased to full history. Values in ms.
const STRIDE_EXTRA_RANGE_MS: Record<Exclude<Stride, "year">, number> = {
  quarter: 5 * 365 * 86_400_000,  // 5 years
  month:   2 * 365 * 86_400_000,  // 2 years
  week:    6 *  30 * 86_400_000,  // 6 months
  day:     1 *  30 * 86_400_000,  // 1 month
};

function computeDragDisplayTarget(
  stride: Stride,
  range: { start: Date; end: Date },
  minMs: number,
  maxMs: number,
): { start: number; end: number } {
  // Both sides get the same per-stride headroom on gear-shift.
  if (stride === "year") return { start: minMs, end: maxMs };
  const extra = STRIDE_EXTRA_RANGE_MS[stride];
  return {
    start: Math.max(minMs, range.start.getTime() - extra),
    end:   Math.min(maxMs, range.end.getTime() + extra),
  };
}

type Stride = "year" | "quarter" | "month" | "week" | "day";

const MS_DAY   = 86_400_000;
const MS_MONTH = 30  * MS_DAY;
const MS_YEAR  = 365 * MS_DAY;

// Pixel-to-date scrub scale per stride (range covered by one canvas-width of cursor travel)
const STRIDE_SCRUB_RANGE_MS: Record<Stride, number> = {
  year:    8 * MS_YEAR,
  quarter: 4 * MS_YEAR,
  month:   2 * MS_YEAR,
  week:    6 * MS_MONTH,
  day:     2 * MS_MONTH,
};

const KNOB_SENSITIVITY = 4;        // global scrub multiplier
const MARKER_WIDTH = 0.07;         // scene-X width of the visible marker line
const MARKER_PICK_HALF_WIDTH = 0.20; // scene-X half-width of the marker's clickable strip

function snapToStride(ms: number, stride: Stride): number {
  const d = new Date(ms);
  if (stride === "year")    return new Date(d.getFullYear(), 0, 1).getTime();
  if (stride === "quarter") return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime();
  if (stride === "month")   return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (stride === "week") {
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + offset);
    return d.getTime();
  }
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const STRIDE_LABELS: Record<Stride, string> = { year: "Y", quarter: "Q", month: "M", week: "W", day: "D" };
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function strideValueText(stride: Stride, d: Date | null): string {
  if (!d) return "";
  if (stride === "year")  return String(d.getFullYear());
  if (stride === "month") return MONTH_NAMES[d.getMonth()];
  if (stride === "day")   return String(d.getDate());
  return ""; // Q and W intentionally blank per UX spec
}

// Diverging palette matching MarketGlobe — gain is green, loss is pink.
// Per-vertex on the ribbon mesh, lerped by each point's PnL.
const COLOR_GAIN    = new THREE.Color("#6DFFC4");
const COLOR_LOSS    = new THREE.Color("#F3A0F4");
const COLOR_NEUTRAL = new THREE.Color("#a0b8cc");
// CSS strings of the same gain/loss palette — used wherever PnL/ROI text or
// borders need to colour-code by sign. Kept in sync with COLOR_GAIN/LOSS so
// every "positive vs negative" hint across the backtest UI reads the same.
export const PNL_POS_CSS = "#6DFFC4";
export const PNL_NEG_CSS = "#F3A0F4";
// Single tinker variable for the yellow label colour shared by the asset
// title, the DateRangePicker date text, and the bottom date ticks. Edit
// the alpha and all three surfaces shift in lockstep.
// IMPORTANT: DateRangePicker imports this and BacktestRibbons imports
// DateRangePicker — a circular dep. Safe as long as DateRangePicker only
// reads YELLOW_LABEL_CSS inside component bodies (render time), never at
// module scope.
export const YELLOW_LABEL_CSS = "rgba(255, 215, 0, 0.4)";

// Trend color over [startMs, endMs] for a position curve. Lerps the diverging
// palette (LOSS ← NEUTRAL → GAIN) normalized to ±30% return as the saturation
// cap so a typical sub-year window still lights up clearly. Writes into `out`
// and returns it. Falls back to `fallback` (default NEUTRAL) when the window
// has no usable data.
// HSL of the GAIN/LOSS endpoints — captured once so the trend lookup can
// snap to one or the other instead of lerping through a bluish NEUTRAL.
const _gainHsl = (() => { const h = { h: 0, s: 0, l: 0 }; COLOR_GAIN.getHSL(h); return h; })();
const _lossHsl = (() => { const h = { h: 0, s: 0, l: 0 }; COLOR_LOSS.getHSL(h); return h; })();
function computeTrendColor(
  curve: BacktestPoint[],
  startMs: number,
  endMs: number,
  out: THREE.Color,
  fallback: THREE.Color = COLOR_NEUTRAL,
): THREE.Color {
  let firstVal: number | null = null;
  let lastVal: number | null = null;
  for (const pt of curve) {
    const ms = new Date(pt.date).getTime();
    if (ms < startMs) continue;
    if (ms > endMs) break;
    if (firstVal === null) firstVal = pt.value;
    lastVal = pt.value;
  }
  if (firstVal === null || lastVal === null || firstVal <= 0) return out.copy(fallback);
  const ret = (lastVal - firstVal) / firstVal;
  const norm = Math.max(-1, Math.min(1, ret / 0.30));
  // Hue stays locked on the green/pink axis (sign of norm picks which);
  // only the SATURATION responds to ROI magnitude, sqrt-curved so even
  // small shifts read as a clear tint instead of going through a bluish
  // mid-point. Floor keeps the colour faintly green/pink at norm == 0.
  const baseHsl = norm >= 0 ? _gainHsl : _lossHsl;
  const sat = Math.max(0.18, Math.sqrt(Math.abs(norm))) * baseHsl.s;
  out.setHSL(baseHsl.h, sat, baseHsl.l);
  return out;
}
// Outline / hover-emphasis (kept for picking + visual distinctness)
const COLOR_POSITION  = new THREE.Color("#e8f4ff"); // near-white outline for the position
const COLOR_LEG_BASES = [
  new THREE.Color("#7eb8ff"), // sky
  new THREE.Color("#b89cff"), // lavender
  new THREE.Color("#ffd28a"), // warm
];

const SCENE_W = 8;        // ribbon X span
const SCENE_H = 3;        // max ribbon height
// Pixel padding reserved at the top of the canvas for the asset title.
// Ribbons (mesh height) are capped so their peak stays below this band;
// vertical-spanning meshes (markers / highlight / tile bands / crosshair
// V-line) still stretch through it because they're sized off the full
// camera Y, not the effective top.
const TOP_PADDING_PX = 50;
// ─── Scene Z positions (back ← → front) ─────────────────────────────────────
const Z_TILE   = -2.5;    // background tile bands
const Z_GLOW   = -2;   // hover glow overlay (just in front of tile band)
const Z_LIGHT  =  5;    // cursor PointLight (in between tile and ribbon)
const Z_RIBBON =  0;      // ribbons + selected-range highlight
const Z_MARKER_GLOW = 0.005; // additive halo behind the marker (only on drag)
const Z_MARKER =  0.01;   // visible marker line
const Z_PICK   =  0.02;   // invisible hit-test strip (slightly in front of marker)
const Z_CAMERA =  5;      // orthographic camera position
const EXPANDED_Y_SCALE = 0.30;  // each leg shrinks vertically when stacked
const LEG_VISUAL_GAP   = 0.35;  // *visual* whitespace between adjacent legs (after Y scaling)
const ANIM_SPEED       = 4.0;   // higher → faster ease

interface RibbonHandle {
  mesh:     THREE.Mesh;
  outline:  THREE.Line;
  curve:    BacktestPoint[];
  yMode:    "value" | "roi";
  baseColor: THREE.Color;
  /** Targets that the animation loop eases the current values toward */
  targetZ:        number;
  targetOpacity:  number;
  /** Eased values applied to the mesh each frame */
  currentOpacity: number;
  /** Y baseline this leg ribbon settles at when expanded (0 for position) */
  expandedY:      number;
  /** Peak Y of this ribbon's curve in geometry units (before scale.y) */
  sceneMaxRaw:    number;
  /** index in the leg array, or -1 for the Position */
  index:    number;
}

function buildRibbonGeometry(
  curve: BacktestPoint[],
  yMode: "value" | "roi",
  yMin: number,
  yMax: number,
): THREE.BufferGeometry {
  const N = Math.max(curve.length, 2);
  const positions = new Float32Array(N * 2 * 3);
  const colors    = new Float32Array(N * 2 * 3);
  const indices: number[] = [];
  const range = yMax - yMin || 1;

  // Per-sign normalization: positive PnLs map onto the GREEN spectrum,
  // negative onto the PINK spectrum. Each gets a floor intensity (0.3) so
  // even pnl=0 still shows a clear tint instead of looking neutral / white.
  let maxPos = 0, maxNeg = 0;
  for (const pt of curve) {
    if (pt.pnl > maxPos) maxPos = pt.pnl;
    if (-pt.pnl > maxNeg) maxNeg = -pt.pnl;
  }
  if (maxPos < 1e-6) maxPos = 1;
  if (maxNeg < 1e-6) maxNeg = 1;

  for (let i = 0; i < N; i++) {
    const pt = curve[Math.min(i, curve.length - 1)];
    const x = (i / (N - 1)) * SCENE_W - SCENE_W / 2;
    const yVal = yMode === "roi" ? pt.roi : pt.value;
    const yNorm = ((yVal - yMin) / range) * SCENE_H;
    positions.set([x, yNorm, 0], i * 6);
    positions.set([x, 0, 0], i * 6 + 3);

    const target = pt.pnl >= 0 ? COLOR_GAIN : COLOR_LOSS;
    const tNorm  = pt.pnl >= 0 ? pt.pnl / maxPos : -pt.pnl / maxNeg;
    const intensity = 0.3 + 0.7 * Math.max(0, Math.min(1, tNorm));
    const r = target.r * intensity;
    const g = target.g * intensity;
    const b = target.b * intensity;
    colors.set([r, g, b], i * 6);
    colors.set([r, g, b], i * 6 + 3);
  }
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  // Avoid an unused-variable lint on COLOR_NEUTRAL — referenced for palette docs
  void COLOR_NEUTRAL;
  return geom;
}

function buildOutlineGeometry(
  curve: BacktestPoint[],
  yMode: "value" | "roi",
  yMin: number,
  yMax: number,
): THREE.BufferGeometry {
  const N = Math.max(curve.length, 2);
  const positions = new Float32Array(N * 3);
  const range = yMax - yMin || 1;
  for (let i = 0; i < N; i++) {
    const pt = curve[Math.min(i, curve.length - 1)];
    const x = (i / (N - 1)) * SCENE_W - SCENE_W / 2;
    const yVal = yMode === "roi" ? pt.roi : pt.value;
    const yNorm = ((yVal - yMin) / range) * SCENE_H;
    positions.set([x, yNorm, 0.001], i * 3);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geom;
}

function computeYBounds(curves: BacktestPoint[][], yMode: "value" | "roi"): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const curve of curves) {
    for (const pt of curve) {
      const v = yMode === "roi" ? pt.roi : pt.value;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  // Always include 0 baseline
  if (min > 0) min = 0;
  return [min, max];
}

export function BacktestRibbons({
  data, absolute = false, display, selected, dragKnob, minDate, maxDate,
  onRangeChange, onDragKnobChange, onDragDisplayTargetChange,
  asset, onAssetChange,
}: Props) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  // Live overlay state for the YQMWD column shown over the dragged marker.
  // - `knob` follows the currently-dragged knob (changes if the user drags
  //   one knob past the other and they flip identities).
  // - `side` is fixed for the duration of the drag — set at pointer-down
  //   based on which knob was originally grabbed. Stays the same after a
  //   flip, so the column doesn't jump from one side of the marker to the
  //   other mid-drag.
  const [overlay, setOverlay] = useState<{
    knob: "start" | "end";
    side: "right" | "left";
    stride: Stride;
    heldDate: Date;
  } | null>(null);
  const overlayDivRef  = useRef<HTMLDivElement>(null);
  const overlayInfoRef = useRef<typeof overlay>(null);
  overlayInfoRef.current = overlay;
  // Crosshair + per-ribbon labels — positions written imperatively each
  // frame from the canvas effect's pointer + handle state.
  const crosshairVRef         = useRef<HTMLDivElement>(null);
  // One horizontal crosshair line per handle — shows the cursor's curve Y
  // for each visible ribbon (so legs view gets one H line per leg).
  const crosshairHRefs        = useRef<(HTMLDivElement | null)[]>([]);
  const crosshairDateRef      = useRef<HTMLDivElement>(null);
  // Per-handle PnL/ROI labels — each H line has its own pair, sign-coloured
  // by its own selection PnL.
  const crosshairLeftRefs     = useRef<(HTMLDivElement | null)[]>([]);
  const crosshairRightRefs    = useRef<(HTMLDivElement | null)[]>([]);
  // Per-ribbon labels: name + (pnl,roi) row (in trend color, glow on hover),
  // plus start/end value labels (gray, anchored to the curve endpoints).
  // Indexed in handle order — handles[0] = Position, handles[1..N] = legs.
  const ribbonNameLabelsRef   = useRef<(HTMLDivElement | null)[]>([]);
  // Refs into the DateRangePicker date <span>s — let the canvas tick loop
  // imperatively rewrite their textContent so the dates stay locked to the
  // dragged markers (bypasses React batching during fast drags).
  const dateStartTextRef      = useRef<HTMLSpanElement>(null);
  const dateEndTextRef        = useRef<HTMLSpanElement>(null);

  // Inline asset editor in the title — same search recipe as the navbar
  // search box (debounced searchTickers + suggestion dropdown), restyled
  // for the backtest yellow / dark-glass theme.
  const [assetEditing,    setAssetEditing]    = useState(false);
  const [assetHover,      setAssetHover]      = useState(false);
  const [assetQuery,      setAssetQuery]      = useState("");
  const [assetResults,    setAssetResults]    = useState<TickerSuggestion[]>([]);
  // Currently-hovered suggestion row — drives the YQMWD-style active vs
  // inactive text colours per row (only the hovered row goes bright).
  const [assetHoverIdx,   setAssetHoverIdx]   = useState<number | null>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const assetBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!assetEditing || !assetQuery.trim()) { setAssetResults([]); return; }
    let cancelled = false;
    searchTickers(assetQuery).then(r => { if (!cancelled) setAssetResults(r); });
    return () => { cancelled = true; };
  }, [assetQuery, assetEditing]);
  function openAssetEditor() {
    if (assetBlurTimer.current) clearTimeout(assetBlurTimer.current);
    setAssetQuery(asset ?? data?.asset ?? "");
    setAssetEditing(true);
    requestAnimationFrame(() => {
      assetInputRef.current?.focus();
      assetInputRef.current?.select();
    });
  }
  function commitAsset(symbol: string) {
    const v = symbol.toUpperCase().trim();
    if (v && v !== (asset ?? data?.asset ?? "")) onAssetChange?.(v);
    setAssetEditing(false);
  }
  const ribbonStartLabelsRef  = useRef<(HTMLDivElement | null)[]>([]);
  const ribbonEndLabelsRef    = useRef<(HTMLDivElement | null)[]>([]);

  // Stash latest mode + handles for the animation loop to consume
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const hoveredRef  = useRef(hoveredIdx);
  hoveredRef.current = hoveredIdx;

  // Live display / selection / drag info for the animation loop
  const displayRef  = useRef<{ start: number; end: number } | undefined>(display);
  displayRef.current  = display;
  const selectedRef = useRef<{ start: Date; end: Date } | undefined>(selected);
  selectedRef.current = selected;
  const dragKnobRef = useRef<"start" | "end" | null | undefined>(dragKnob);
  dragKnobRef.current = dragKnob;
  const onRangeChangeRef = useRef(onRangeChange);
  onRangeChangeRef.current = onRangeChange;
  const onDragKnobChangeRef = useRef(onDragKnobChange);
  onDragKnobChangeRef.current = onDragKnobChange;
  const onDragDisplayTargetChangeRef = useRef(onDragDisplayTargetChange);
  onDragDisplayTargetChangeRef.current = onDragDisplayTargetChange;
  const minMsRef = useRef((minDate ?? new Date(2010, 0, 1)).getTime());
  const maxMsRef = useRef((maxDate ?? new Date()).getTime());
  minMsRef.current = (minDate ?? new Date(2010, 0, 1)).getTime();
  maxMsRef.current = (maxDate ?? new Date()).getTime();

  const yMode = absolute ? "roi" : "value";

  // Normalize the data into a list of "renderable" entries: Position + each Leg
  const ribbons = useMemo(() => {
    if (!data) return null;
    const allCurves = [data.position.curve, ...data.legs.map(l => l.curve)];
    const [yMin, yMax] = computeYBounds(allCurves, yMode);
    const legCount = data.legs.length;
    const range = (yMax - yMin) || 1;
    function curveSceneMax(curve: BacktestPoint[]): number {
      let m = 0;
      for (const pt of curve) {
        const v = yMode === "roi" ? pt.roi : pt.value;
        const yNorm = ((v - yMin) / range) * SCENE_H;
        if (yNorm > m) m = yNorm;
      }
      return m;
    }
    const positionEntry = {
      curve: data.position.curve,
      label: "Position",
      sublabel: `${data.legs.length} legs`,
      color: COLOR_POSITION,
      isPosition: true,
      legIndex: -1,
      sceneMaxRaw: curveSceneMax(data.position.curve),
    };
    // Per-leg max Y (in geometry units). Baseline stacking is computed in the
    // useEffect below — it depends on the canvas-derived `baseRibbonYScale`,
    // which isn't known until the camera is built.
    const legEntries = data.legs.map((leg, i) => ({
      curve: leg.curve,
      label: leg.name,
      sublabel: legSubtitle(leg),
      color: COLOR_LEG_BASES[i % COLOR_LEG_BASES.length],
      isPosition: false,
      legIndex: i,
      sceneMaxRaw: curveSceneMax(leg.curve),
    }));
    // Time range covered by the data — used for X transform vs the bar's display
    const firstPt = data.position.curve[0];
    const lastPt  = data.position.curve[data.position.curve.length - 1];
    const dataStartMs = firstPt ? new Date(firstPt.date).getTime() : 0;
    const dataEndMs   = lastPt  ? new Date(lastPt.date).getTime()  : 0;
    // Single dominant color applied to all auxiliary visual elements
    // (markers, highlight, YQMWD overlay) — matches the ribbon's overall tint.
    const lastPnl = lastPt?.pnl ?? 0;
    const dominantHex   = lastPnl >= 0 ? "#6DFFC4" : "#F3A0F4";
    const dominantThree = new THREE.Color(dominantHex);
    return { positionEntry, legEntries, yMin, yMax, legCount, dataStartMs, dataEndMs, dominantHex, dominantThree };
  }, [data, yMode]);

  // Hex of the trend color over the current marker selection — drives the
  // YQMWD gear-shift highlight tint. Recomputed only when the selection or
  // the underlying curve changes (cheap; bounded scan).
  const overlayThemeHex = useMemo(() => {
    const fallback = ribbons?.dominantHex ?? "#00d4ff";
    if (!ribbons || !selected) return fallback;
    const c = new THREE.Color();
    computeTrendColor(
      ribbons.positionEntry.curve,
      selected.start.getTime(),
      selected.end.getTime(),
      c,
      new THREE.Color(fallback),
    );
    return `#${c.getHexString()}`;
  }, [ribbons, selected]);

  useEffect(() => {
    if (!mountRef.current || !ribbons) return;

    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // Tick-label DOM pool — HTML elements positioned at each tile's left
    // boundary, updated imperatively in the tick loop.
    const labelContainer = document.createElement("div");
    labelContainer.style.position = "absolute";
    labelContainer.style.left = "0";
    labelContainer.style.right = "0";
    labelContainer.style.bottom = "0";
    labelContainer.style.height = "18px";
    labelContainer.style.pointerEvents = "none";
    mount.appendChild(labelContainer);
    const labelPool: HTMLDivElement[] = [];
    function getLabel(idx: number): HTMLDivElement {
      let el = labelPool[idx];
      if (!el) {
        el = document.createElement("div");
        el.style.position = "absolute";
        el.style.bottom = "2px";
        el.style.fontSize = "10px";
        el.style.fontFamily = "JetBrains Mono, monospace";
        el.style.color = "rgba(180, 210, 255, 0.55)";
        el.style.pointerEvents = "none";
        el.style.whiteSpace = "nowrap";
        el.style.transform = "translateX(-50%)";
        el.style.padding = "0 4px";
        el.style.textShadow = "0 1px 2px rgba(0,0,0,0.7)";
        labelContainer.appendChild(el);
        labelPool[idx] = el;
      }
      return el;
    }
    function hideUnusedLabels(used: number) {
      for (let i = used; i < labelPool.length; i++) labelPool[i].style.display = "none";
    }

    const scene = new THREE.Scene();
    scene.background = null;

    // Orthographic so canvas X = scene X exactly. With X bounds = SCENE_W,
    // the visible canvas width corresponds to the selected range when the
    // ribbon's X transform is applied. Bottom is pinned at y=0 (PnL baseline)
    // so the ribbon sits flush with the bottom edge of the canvas.
    const aspect0 = width / height;
    const visY0 = SCENE_W / aspect0;
    const camera = new THREE.OrthographicCamera(
      -SCENE_W / 2, +SCENE_W / 2,
      visY0, 0,
      0.1, 100,
    );
    camera.position.set(0, 0, Z_CAMERA);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // No ambient — the constant baseline is carried by per-material emissive,
    // and the cursor PointLight adds the hover highlight on top.
    // Cursor light — sits ~0.30 units in front of the background (mirrors
    // MarketGlobe's bubble-to-dome distance), decay 2 like the bubble glow.
    // Intensity is dialed down to compensate for the shorter distance.
    const cursorLight = new THREE.PointLight(0xffffff, 0, 10, 1); // (color, intensity, range, decay)
    cursorLight.color.copy(ribbons!.dominantThree);
    cursorLight.position.set(0, 0, Z_LIGHT);
    scene.add(cursorLight);
    let cursorLightTarget = 0;
    const planeRibbon = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const lightWorldPos = new THREE.Vector3();

    // Effective ribbon-usable scene Y top — the actual camera.top minus
    // the scene-units equivalent of TOP_PADDING_PX, so the ribbon never
    // peaks into the asset-title padding zone.
    function effectiveCameraTop() {
      const hgt = mount.clientHeight || 1;
      const padScene = camera.top * (TOP_PADDING_PX / hgt);
      return Math.max(0.1, camera.top - padScene);
    }
    // Y-fit scale: stretch the ribbon's natural SCENE_H so its peak fills
    // the visible Y minus the top padding band. Recomputed on resize.
    let baseRibbonYScale = 1;
    function computeBaseRibbonYScale() {
      baseRibbonYScale = Math.max(0.05, effectiveCameraTop() / SCENE_H);
    }
    computeBaseRibbonYScale();

    // Per-leg shrink factor when expanded — sized so that the full leg stack
    // (sum of leg heights + uniform gaps) exactly fills the visible Y.
    let expandedYScale = EXPANDED_Y_SCALE;
    function computeExpandedYScale(out: RibbonHandle[]) {
      const legHandles = out.filter(h => h.index >= 0);
      const n = legHandles.length;
      if (n === 0) return;
      const totalSceneMax = legHandles.reduce((s, h) => s + h.sceneMaxRaw, 0);
      const totalGap = (n - 1) * LEG_VISUAL_GAP;
      const denom = totalSceneMax * baseRibbonYScale;
      if (denom > 0) {
        const availableY = effectiveCameraTop() - 0.1; // tiny margin below the cap
        expandedYScale = Math.max(0.05, (availableY - totalGap) / denom);
      }
    }

    // Per-leg expandedY (stack baselines) — depends on baseRibbonYScale and
    // expandedYScale. Recomputed on resize.
    function computeStackBaselines(out: RibbonHandle[]) {
      let yCursor = 0;
      for (const h of out) {
        if (h.index < 0) continue;
        h.expandedY = yCursor;
        yCursor += h.sceneMaxRaw * baseRibbonYScale * expandedYScale + LEG_VISUAL_GAP;
      }
    }

    // Build all ribbons
    const handles: RibbonHandle[] = [];

    function makeRibbon(
      curve: BacktestPoint[],
      baseColor: THREE.Color,
      index: number,
      expandedY: number,
      sceneMaxRaw: number,
    ): RibbonHandle {
      const geom = buildRibbonGeometry(curve, yMode, ribbons!.yMin, ribbons!.yMax);
      // Same MeshStandardMaterial recipe as MarketGlobe bubbles: dark base
      // diffuse + bright emissive carrying the ribbon's dominant color.
      // Vertex colors still carry the per-point PnL gradient on the diffuse
      // channel — visible when the cursor PointLight is nearby.
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,           // pass through vertex colors
        vertexColors: true,
        emissive: ribbons!.dominantThree.clone(),
        emissiveIntensity: 0.2,
        roughness: 0.5,
        metalness: 0.8,            // bubble: 0.8
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);

      const outlineGeom = buildOutlineGeometry(curve, yMode, ribbons!.yMin, ribbons!.yMax);
      const outlineMat = new THREE.LineBasicMaterial({
        color: baseColor.clone().multiplyScalar(1.4),
        transparent: true,
        opacity: 0.95,
      });
      const outline = new THREE.Line(outlineGeom, outlineMat);

      mesh.add(outline);
      scene.add(mesh);
      // Initialize to match the CURRENT expanded state — so when the scene
      // rebuilds (data refetch), it picks up the user's view rather than
      // replaying the expand animation from scratch.
      const isExpandedNow = expandedRef.current;
      let initialOpacity = 0;
      let initialY = 0;
      let initialYScale = baseRibbonYScale;
      if (index === -1) {
        initialOpacity = isExpandedNow ? 0 : 1;
      } else {
        initialOpacity = isExpandedNow ? 1 : 0;
        initialY      = isExpandedNow ? expandedY                              : 0;
        initialYScale = isExpandedNow ? baseRibbonYScale * expandedYScale       : baseRibbonYScale;
      }
      mesh.position.y = initialY;
      mesh.scale.y    = initialYScale;
      return {
        mesh, outline, curve,
        yMode,
        baseColor: baseColor.clone(),
        targetZ:        0,
        targetOpacity:  initialOpacity,
        currentOpacity: initialOpacity,
        expandedY,
        sceneMaxRaw,
        index,
      };
    }

    const positionH = makeRibbon(ribbons.positionEntry.curve, ribbons.positionEntry.color, -1, 0, ribbons.positionEntry.sceneMaxRaw);
    handles.push(positionH);
    ribbons.legEntries.forEach((l, i) => {
      handles.push(makeRibbon(l.curve, l.color, i, 0, l.sceneMaxRaw));
    });
    // Compute stack baselines now that handles + scales are known.
    computeExpandedYScale(handles);
    computeStackBaselines(handles);
    // Per-handle pre-parsed date timestamps — used by the per-frame label
    // updates for binary-search lookups of curve points at sel.start/end.
    const handleMs: number[][] = handles.map(h => h.curve.map(pt => new Date(pt.date).getTime()));
    function handleIdxAtOrAfter(arr: number[], ms: number): number {
      if (arr.length === 0) return -1;
      if (ms <= arr[0]) return 0;
      if (ms > arr[arr.length - 1]) return arr.length - 1;
      let lo = 0, hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < ms) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }
    function handleIdxAtOrBefore(arr: number[], ms: number): number {
      if (arr.length === 0) return -1;
      if (ms < arr[0]) return 0;
      if (ms >= arr[arr.length - 1]) return arr.length - 1;
      let lo = 0, hi = arr.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= ms) lo = mid;
        else hi = mid;
      }
      return lo;
    }

    // ── Tick-segment background planes ─────────────────────────────────────
    // Subtle alternating shaded planes that act as the graph's time-axis
    // background. They live behind everything else (negative z).
    const TICK_BG_BAND_HEIGHT = 100; // tall enough to cover the visible Y of any aspect
    const tickPool: THREE.Mesh[] = [];
    // Alternating bright yellow / deep yellow — both same hue, different
    // lightness. Past-themed palette matching MarketGlobe's past bands.
    // StandardMaterial so the cursor light spills onto the background.
    // Each tile has its OWN material so we can color them as a gradient
    // (leftmost visible = light, rightmost = dark). Same single dome
    // past-band color (#ffd700) for every tile; only opacity changes,
    // matching the dome's alpha range (steps 0..4 → 0.08..0.36).
    const TICK_COLOR = new THREE.Color(0xffd700);
    const TICK_ALPHA_LIGHT = 0.36; // dome step 4 alpha (most opaque)
    const TICK_ALPHA_DARK  = 0.08; // dome step 0 alpha (most faded)
    // Tick LABEL colour — shared with the asset title + DateRangePicker
    // date text via the file-scope `YELLOW_LABEL_CSS`.
    const TICK_LABEL_COLOR_CSS = YELLOW_LABEL_CSS;
    const tickGeom = new THREE.PlaneGeometry(1, TICK_BG_BAND_HEIGHT);
    function getTickMesh(idx: number): THREE.Mesh {
      let m = tickPool[idx];
      if (!m) {
        const mat = new THREE.MeshStandardMaterial({
          color: TICK_COLOR.clone(), emissive: TICK_COLOR.clone(),
          emissiveIntensity: 0.1,
          roughness: 0.5, metalness: 0.8,
          transparent: true, opacity: TICK_ALPHA_LIGHT,
          side: THREE.DoubleSide, depthWrite: false,
        });
        m = new THREE.Mesh(tickGeom, mat);
        m.position.z = Z_TILE; // decisively behind ribbons
        scene.add(m);
        tickPool[idx] = m;
      }
      m.visible = true;
      return m;
    }
    function setTickGradient(mesh: THREE.Mesh, t: number) {
      // t = 0 (leftmost / lightest) … 1 (rightmost / darkest).
      // Single color, opacity lerps across dome's alpha range.
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(TICK_COLOR);
      mat.emissive.copy(TICK_COLOR);
      mat.emissiveIntensity = 0.15;
      mat.opacity = TICK_ALPHA_LIGHT - (TICK_ALPHA_LIGHT - TICK_ALPHA_DARK) * t;
    }

    // Hover glow — additive, feather-edged. Mirrors MarketGlobe's sector
    // wedge recipe (smoothstep falloff + AdditiveBlending) so the highlight
    // softly fades into the surrounding tiles instead of using a hard
    // rectangular edge. Positioned per-frame over the hovered tile.
    const hoverGlowMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(1, 1, 1) },
        uOpacity: { value: 0.28 },
        uFeather: { value: 0.4 }, // fraction of half-extent fading to 0
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3  uColor;
        uniform float uOpacity;
        uniform float uFeather;
        varying vec2  vUv;
        void main() {
          float dx = abs(vUv.x - 0.5) * 2.0;
          float dy = abs(vUv.y - 0.5) * 2.0;
          float ax = 1.0 - smoothstep(1.0 - uFeather, 1.0, dx);
          float ay = 1.0 - smoothstep(1.0 - uFeather, 1.0, dy);
          float a  = ax * ay * uOpacity;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hoverGlowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, TICK_BG_BAND_HEIGHT),
      hoverGlowMat,
    );
    hoverGlowMesh.position.z = Z_GLOW;
    hoverGlowMesh.visible = false;
    scene.add(hoverGlowMesh);
    // Sized so the solid (alpha=1) zone exactly covers the tile and the
    // feathered falloff sits entirely *outside* the tile boundary. Derived
    // from the shader: solid_half = (1 − uFeather) · glow_half ⇒
    // glow_width = tile_width / (1 − uFeather).
    const hoverGlowWidthMul = 1 / (1 - (hoverGlowMat.uniforms.uFeather.value as number));

    // Trend color over [startMs, endMs] — shared scratch buffer; copy the
    // result into a persistent slot if it must outlive the next call.
    const trendColorOut = new THREE.Color();
    function trendColorAt(startMs: number, endMs: number): THREE.Color {
      return computeTrendColor(ribbons!.positionEntry.curve, startMs, endMs, trendColorOut);
    }
    function hideUnusedTicks(used: number) {
      for (let i = used; i < tickPool.length; i++) tickPool[i].visible = false;
    }

    // Persistent scratch colors for per-frame trend-color application.
    // `trendColorAt` shares one buffer (`trendColorOut`), so any caller that
    // wants to keep the value across another `trendColorAt` call must copy.
    const hoveredTrendBuf   = new THREE.Color().copy(ribbons!.dominantThree);
    const selectionTrendBuf = new THREE.Color().copy(ribbons!.dominantThree);

    // Per-handle ms arrays + the at-or-before/at-or-after binary searches
    // are defined further down (after `handles` is built); the crosshair
    // and per-ribbon labels share them.
    const monthAbbrev = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    function fmtCursorDate(ms: number): string {
      const d = new Date(ms);
      return `${monthAbbrev[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }

    // ── Selected-range highlight (translucent cyan plane) ──────────────────
    // All vertical-spanning meshes (highlight, markers, pick strips) are built
    // tall enough (TICK_BG_BAND_HEIGHT) to fully cover the visible Y at any
    // canvas aspect — otherwise they'd cap at SCENE_H and leave gaps when
    // the camera's `top` exceeds SCENE_H.
    const TALL = TICK_BG_BAND_HEIGHT;
    const highlightGeom = new THREE.PlaneGeometry(1, TALL);
    // Additive flat band — hard rectangular edges (no smoothstep falloff).
    const highlightMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color().copy(ribbons!.dominantThree) },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3  uColor;
        uniform float uOpacity;
        void main() {
          gl_FragColor = vec4(uColor * uOpacity, uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const highlightMesh = new THREE.Mesh(highlightGeom, highlightMat);
    highlightMesh.position.set(0, TALL / 2, Z_RIBBON);
    scene.add(highlightMesh);

    // ── Two thick marker lines (always visible — these ARE the knobs) ──────
    function makeMarker(): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; geom: THREE.PlaneGeometry } {
      const g = new THREE.PlaneGeometry(MARKER_WIDTH, TALL);
      const m = new THREE.MeshBasicMaterial({
        color: ribbons!.dominantThree.clone(),
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(0, TALL / 2, Z_MARKER);
      scene.add(mesh);
      return { mesh, mat: m, geom: g };
    }
    const markerStart = makeMarker();
    const markerEnd   = makeMarker();

    // Marker glow halo — additive feathered band that lights up around the
    // dragged knob. One shared mesh, repositioned per frame to whichever
    // knob is held; opacity eases to 0 when no knob is held.
    const MARKER_GLOW_WIDTH = MARKER_WIDTH * 6;
    const markerGlowMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color().copy(ribbons!.dominantThree) },
        uOpacity: { value: 0 },
        uFeather: { value: 0.9 }, // very soft — most of the halo is falloff
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3  uColor;
        uniform float uOpacity;
        uniform float uFeather;
        varying vec2  vUv;
        void main() {
          float dx = abs(vUv.x - 0.5) * 2.0;
          float ax = 1.0 - smoothstep(1.0 - uFeather, 1.0, dx);
          float a  = ax * uOpacity;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const markerGlowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(MARKER_GLOW_WIDTH, TALL),
      markerGlowMat,
    );
    markerGlowMesh.position.set(0, TALL / 2, Z_MARKER_GLOW);
    markerGlowMesh.visible = false;
    scene.add(markerGlowMesh);

    // Tracks which knob's marker the glow follows. Stays set after release
    // so the halo keeps tracking the marker through the post-release fade
    // (the marker itself drifts as the display window eases back to the
    // selected range). Cleared once the halo has fully faded out.
    let markerGlowKnob: "start" | "end" | null = null;
    const _hslTmp = { h: 0, s: 0, l: 0 };
    const markerGlowColor = new THREE.Color();
    // Dim shade of the trend colour — used as the default ribbon-name colour.
    const _dimNameColor = new THREE.Color();
    // Hidden hit-testing strips (wider, transparent) for easier picking
    function makePickStrip(): THREE.Mesh {
      const g = new THREE.PlaneGeometry(MARKER_PICK_HALF_WIDTH * 2, TALL);
      const m = new THREE.MeshBasicMaterial({ visible: false });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(0, TALL / 2, Z_PICK);
      scene.add(mesh);
      return mesh;
    }
    const pickStart = makePickStrip();
    const pickEnd   = makePickStrip();

    // ── Pointer / raycaster setup ──────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function setPointerFromEvent(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickMarkerKnob(): "start" | "end" | null {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([pickStart, pickEnd], false);
      if (!hits.length) return null;
      return hits[0].object === pickStart ? "start" : "end";
    }

    function pickRibbon(): RibbonHandle | null {
      raycaster.setFromCamera(pointer, camera);
      const meshes = handles
        .filter(h => (h.mesh.material as THREE.Material).opacity > 0.05)
        .map(h => h.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (!hits.length) return null;
      const hit = hits[0].object;
      return handles.find(h => h.mesh === hit) || null;
    }

    // ── Drag state (held marker → date scrubbing) ──────────────────────────
    let activeDrag: {
      knob: "start" | "end";
      stride: Stride;
      refClientX: number;
      refHeldMs: number;
      side: "right" | "left"; // fixed at drag start; doesn't change on flip
    } | null = null;
    // Set true on any pointer-down that starts a marker drag; consumed by the
    // following click handler so a click on a marker never propagates to the
    // ribbon (which would toggle expand/collapse).
    let suppressNextClick = false;

    // Live cursor state (client coords + canvas-active flag) consumed by the
    // per-frame loop to position the cursor-following tooltip and crosshair.
    let cursorClientX = -1;
    let cursorClientY = -1;
    let cursorActive  = false;
    // Marker hovered (separate from drag) — drives the marker glow on hover.
    let hoveredKnobMarker: "start" | "end" | null = null;

    function strideFromCursorY(clientY: number): Stride {
      const rect = renderer.domElement.getBoundingClientRect();
      const relY = clientY - rect.top;
      const tier = Math.floor((relY / rect.height) * 5);
      if (tier <= 0) return "year";
      if (tier === 1) return "quarter";
      if (tier === 2) return "month";
      if (tier === 3) return "week";
      return "day";
    }

    function projectKnobScreenX(knob: "start" | "end"): number {
      const sel = selectedRef.current;
      const disp = displayRef.current;
      if (!sel || !disp) return 0;
      const sceneX = ((knob === "start" ? sel.start.getTime() : sel.end.getTime())
                      - (disp.start + disp.end) / 2) / ((disp.end - disp.start) || 1) * SCENE_W;
      const ndcX = (sceneX - (camera.left + camera.right) / 2) / ((camera.right - camera.left) / 2);
      const rect = renderer.domElement.getBoundingClientRect();
      return rect.left + (ndcX * 0.5 + 0.5) * rect.width;
    }

    function updateCursorLightPos() {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(planeRibbon, lightWorldPos)) {
        cursorLight.position.set(lightWorldPos.x, lightWorldPos.y, Z_LIGHT);
      }
    }

    function onPointerMove(e: PointerEvent) {
      setPointerFromEvent(e);
      cursorClientX = e.clientX;
      cursorClientY = e.clientY;
      cursorActive  = true;
      updateCursorLightPos();
      // If dragging, scrub the held knob
      if (activeDrag) {
        const stride = strideFromCursorY(e.clientY);
        if (stride !== activeDrag.stride) {
          // Re-snapshot reference so scrubbing remains continuous across stride switches
          const sel = selectedRef.current;
          activeDrag.refClientX = e.clientX;
          activeDrag.refHeldMs = sel
            ? (activeDrag.knob === "start" ? sel.start.getTime() : sel.end.getTime())
            : activeDrag.refHeldMs;
          activeDrag.stride = stride;
          // Re-compute the display target for the new gear (zoom only here).
          if (sel) {
            const target = computeDragDisplayTarget(stride, sel, minMsRef.current, maxMsRef.current);
            onDragDisplayTargetChangeRef.current?.(target);
          }
        }
        const sel = selectedRef.current;
        if (!sel) return;
        const rect = renderer.domElement.getBoundingClientRect();
        const pixelDelta = e.clientX - activeDrag.refClientX;
        const scrubRange = STRIDE_SCRUB_RANGE_MS[activeDrag.stride];
        const msDelta = pixelDelta * scrubRange / rect.width * KNOB_SENSITIVITY;
        const rawMs = activeDrag.refHeldMs + msDelta;
        const snapped = snapToStride(rawMs, activeDrag.stride);
        const minMs = minMsRef.current, maxMs = maxMsRef.current;
        let nextStart = sel.start.getTime();
        let nextEnd   = sel.end.getTime();
        if (activeDrag.knob === "start") nextStart = snapped;
        else                              nextEnd = snapped;
        // Allow the dragged knob to cross the other — swap and flip identity
        // so [start, end] stays ordered. Also flip the YQMWD side so the
        // column stays on the OUTER side of the (newly-identified) marker.
        // Notify the parent so dragKnobRef updates → the marker glow halo
        // (which keys off dragK) follows the knob through the cross.
        if (nextStart > nextEnd) {
          const tmp = nextStart; nextStart = nextEnd; nextEnd = tmp;
          activeDrag.knob = activeDrag.knob === "start" ? "end" : "start";
          activeDrag.side = activeDrag.side === "left" ? "right" : "left";
          onDragKnobChangeRef.current?.(activeDrag.knob);
        }
        nextStart = Math.max(minMs, Math.min(maxMs, nextStart));
        nextEnd   = Math.max(minMs, Math.min(maxMs, nextEnd));
        if (nextStart !== sel.start.getTime() || nextEnd !== sel.end.getTime()) {
          onRangeChangeRef.current?.({ start: new Date(nextStart), end: new Date(nextEnd) });
        }
        // Update overlay (for YQMWD column visual). Position handled by tick().
        const heldDate = new Date(activeDrag.knob === "start" ? nextStart : nextEnd);
        setOverlay({ knob: activeDrag.knob, side: activeDrag.side, stride: activeDrag.stride, heldDate });
        return;
      }
      // Otherwise, do hover detection on ribbons (also check markers for cursor change)
      const knob = pickMarkerKnob();
      hoveredKnobMarker = knob;
      if (knob !== null) {
        renderer.domElement.style.cursor = "grab";
        cursorLightTarget = 0;  // markers don't trigger the glow
        if (hoveredRef.current !== null) setHoveredIdx(null);
        return;
      }
      renderer.domElement.style.cursor = "";
      const picked = pickRibbon();
      const newHover = picked ? picked.index : null;
      cursorLightTarget = picked ? 10 : 0;
      if (newHover !== hoveredRef.current) setHoveredIdx(newHover);
    }

    function onPointerLeave() {
      cursorLightTarget = 0;
      cursorActive = false;
      hoveredKnobMarker = null;
    }

    function onPointerDown(e: PointerEvent) {
      setPointerFromEvent(e);
      const knob = pickMarkerKnob();
      if (knob) {
        e.preventDefault();
        const sel = selectedRef.current;
        const heldMs = sel ? (knob === "start" ? sel.start.getTime() : sel.end.getTime()) : 0;
        // Outer side of the marker:
        //   start knob → column extends LEFT (outside the selection)
        //   end knob   → column extends RIGHT (outside the selection)
        const side: "right" | "left" = knob === "start" ? "left" : "right";
        activeDrag = {
          knob,
          stride: strideFromCursorY(e.clientY),
          refClientX: e.clientX,
          refHeldMs: heldMs,
          side,
        };
        suppressNextClick = true;
        renderer.domElement.style.cursor = "grabbing";
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        onDragKnobChangeRef.current?.(knob);
        // Compute the gear-shift display target for the initial stride.
        if (sel) {
          const target = computeDragDisplayTarget(activeDrag.stride, sel, minMsRef.current, maxMsRef.current);
          onDragDisplayTargetChangeRef.current?.(target);
        }
        setOverlay({ knob, side, stride: activeDrag.stride, heldDate: new Date(heldMs) });
      }
    }

    function onPointerUp() {
      if (activeDrag) {
        activeDrag = null;
        renderer.domElement.style.cursor = "";
        onDragKnobChangeRef.current?.(null);
        onDragDisplayTargetChangeRef.current?.(null);
        setOverlay(null);
      }
    }

    function onClick(e: PointerEvent) {
      // Any click that started on a marker is consumed — don't toggle expand.
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (activeDrag) return;
      setPointerFromEvent(e);
      const picked = pickRibbon();
      if (picked && picked.index === -1 && !expandedRef.current) {
        setExpanded(true);
      } else if (!picked && expandedRef.current) {
        setExpanded(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && expandedRef.current) {
        setExpanded(false);
      }
    }

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerup",     onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("click", onClick as unknown as EventListener);
    window.addEventListener("keydown", onKey);

    // Animation loop
    let raf = 0;
    const clock = new THREE.Clock();

    function applyHoverColors() {
      // Ribbon fill stays at uniform opacity — the cursor PointLight is
      // what conveys hover emphasis. Outline (top curve/edge) shares the
      // dim trend hue with the ribbon name + start/end labels; on hover
      // it brightens to the full trend hue.
      const hovIdx = hoveredRef.current;
      for (const h of handles) {
        const mat = h.mesh.material as THREE.MeshStandardMaterial;
        const outlineMat = h.outline.material as THREE.LineBasicMaterial;
        mat.color.set(0xffffff);
        mat.emissive.copy(selectionTrendBuf);
        mat.opacity = h.currentOpacity * 0.20;
        const isHovered = hovIdx === h.index;
        outlineMat.color.copy(isHovered ? selectionTrendBuf : _dimNameColor);
        outlineMat.opacity = h.currentOpacity * 0.7;
      }
    }

    function tick() {
      const dt = clock.getDelta();
      const ease = 1 - Math.exp(-ANIM_SPEED * dt);

      const isExpanded = expandedRef.current;
      const legCount = ribbons!.legCount;

      // ── Compute X transform (data → display) ────────────────────────────
      // Data spans data.start..data.end; we mapped its X to [-SCENE_W/2, +SCENE_W/2]
      // in the geometry. To re-express as a display window, scale + translate.
      const dataStartMs = ribbons!.dataStartMs;
      const dataEndMs   = ribbons!.dataEndMs;
      const dataMid     = (dataStartMs + dataEndMs) / 2;
      const dataRange   = dataEndMs - dataStartMs || 1;
      const disp = displayRef.current;
      const dispStart = disp ? disp.start : dataStartMs;
      const dispEnd   = disp ? disp.end   : dataEndMs;
      const dispMid   = (dispStart + dispEnd) / 2;
      const dispRange = (dispEnd - dispStart) || 1;
      const ratio   = dataRange / dispRange;
      const offsetX = ((dataMid - dispMid) / dispRange) * SCENE_W;

      // ── Ribbon target y / yScale / opacity + apply X transform ──
      // baseRibbonYScale fits the ribbon's Y inside the visible canvas Y.
      // EXPANDED_Y_SCALE further shrinks each leg when expanded.
      for (const h of handles) {
        let targetY = 0;
        let targetYScale = baseRibbonYScale;
        if (h.index === -1) {
          h.targetZ = 0;
          h.targetOpacity = isExpanded ? 0 : 1;
        } else {
          h.targetZ = 0;
          h.targetOpacity = isExpanded ? 1 : 0;
          targetY      = isExpanded ? h.expandedY                          : 0;
          targetYScale = isExpanded ? baseRibbonYScale * expandedYScale    : baseRibbonYScale;
        }
        h.mesh.position.z  += (h.targetZ - h.mesh.position.z) * ease;
        h.mesh.position.y  += (targetY      - h.mesh.position.y) * ease;
        h.mesh.scale.y     += (targetYScale - h.mesh.scale.y)    * ease;
        h.currentOpacity   += (h.targetOpacity - h.currentOpacity) * ease;
        h.mesh.position.x   = offsetX;
        h.mesh.scale.x      = ratio;
      }

      // ── Tick segment background ─────────────────────────────────────────
      // Compute tick boundaries based on the current display window, then
      // place alternating shaded planes between them. Recycles a pool.
      const tickStride = pickTickStride(dispRange);
      const tickList = buildTickPositions(dispStart, dispEnd, tickStride);
      const visW = camera.right - camera.left;
      const halfVisW = visW / 2;

      // First pass: count how many tiles are visible (for gradient denominator).
      let visibleCount = 0;
      for (let i = 0; i < tickList.length - 1; i++) {
        const aSceneX = ((tickList[i]     - dispMid) / dispRange) * SCENE_W;
        const bSceneX = ((tickList[i + 1] - dispMid) / dispRange) * SCENE_W;
        if (bSceneX < -halfVisW - 0.1 || aSceneX > halfVisW + 0.1) continue;
        visibleCount++;
      }

      // Cursor scene X (used to detect which tile is hovered)
      const cursorSceneX = cursorLight.position.x;
      const tileHoverActive = cursorLightTarget > 0;

      // Second pass: position + apply gradient color (leftmost visible = light).
      // The tile containing the cursor X gets a glow tinted by its time-window trend.
      let tickIdx = 0;
      let labelIdx = 0;
      let didHoverTile = false;
      // Hide glow by default; positioned + revealed below if a tile is hovered.
      hoverGlowMesh.visible = false;
      const canvasWForLabels = renderer.domElement.clientWidth;
      const halfBoundsW = (camera.right - camera.left) / 2;
      for (let i = 0; i < tickList.length - 1; i++) {
        const aMs = tickList[i];
        const bMs = tickList[i + 1];
        const aSceneX = ((aMs - dispMid) / dispRange) * SCENE_W;
        const bSceneX = ((bMs - dispMid) / dispRange) * SCENE_W;
        if (bSceneX < -halfVisW - 0.1 || aSceneX > halfVisW + 0.1) continue;
        const segW = bSceneX - aSceneX;
        const segMid = (aSceneX + bSceneX) / 2;
        const m = getTickMesh(tickIdx);
        m.position.set(segMid, 0, Z_TILE);
        m.scale.x = segW;
        const t = visibleCount > 1 ? tickIdx / (visibleCount - 1) : 0;
        setTickGradient(m, t);
        const isHovered = tileHoverActive
          && cursorSceneX >= aSceneX && cursorSceneX <= bSceneX;
        if (isHovered) {
          const trend = trendColorAt(aMs, bMs);
          // Snapshot before any other trendColorAt call clobbers the shared buffer.
          hoveredTrendBuf.copy(trend);
          didHoverTile = true;
          // Solid zone exactly covers the tile; feather sits entirely outside
          // (see hoverGlowWidthMul derivation). Underlying tile is untouched.
          hoverGlowMesh.visible = true;
          hoverGlowMesh.position.x = segMid;
          hoverGlowMesh.scale.x = segW * hoverGlowWidthMul;
          (hoverGlowMat.uniforms.uColor.value as THREE.Color).copy(trend);
        }
        // Tick label at the tile's LEFT boundary. Hide a label only when
        // its rendered text would visibly overflow the canvas — i.e. its
        // half-width crosses the canvas edge. The label's centred via
        // translateX(-50%), so the test is `labelCanvasX < halfW` (left
        // overflow) or `labelCanvasX > canvasW − halfW` (right overflow).
        // halfW is read from the pool slot's previous-frame width — close
        // enough since label text widths only vary by a few px.
        const labelNdcX = aSceneX / halfBoundsW;
        const labelCanvasX = (labelNdcX * 0.5 + 0.5) * canvasWForLabels;
        const halfW = (labelPool[labelIdx]?.offsetWidth ?? 30) / 2;
        const overflowsCanvas = labelCanvasX < halfW || labelCanvasX > canvasWForLabels - halfW;
        if (!overflowsCanvas) {
          const label = getLabel(labelIdx);
          label.style.left = `${labelCanvasX}px`;
          label.style.display = "block";
          label.style.color = TICK_LABEL_COLOR_CSS;
          label.textContent = formatTickLabel(aMs, tickStride);
          labelIdx++;
        }
        tickIdx++;
      }
      hideUnusedTicks(tickIdx);
      hideUnusedLabels(labelIdx);

      // ── Selection trend color ──────────────────────────────────────────
      // Drives ribbon emissive (via applyHoverColors), highlight fill, and
      // marker lines — so the whole selection-related UI reflects the ROI
      // of the currently-selected window.
      const selRef = selectedRef.current;
      if (selRef) {
        selectionTrendBuf.copy(trendColorAt(selRef.start.getTime(), selRef.end.getTime()));
      }
      // Dim shade of the trend hue — shared by ribbon outline + name + pnl/roi
      // + start/end labels. Hover swaps to the full-brightness trend.
      _dimNameColor.copy(selectionTrendBuf).multiplyScalar(0.55);
      (highlightMat.uniforms.uColor.value as THREE.Color).copy(selectionTrendBuf);
      markerStart.mat.color.copy(selectionTrendBuf);
      markerEnd.mat.color.copy(selectionTrendBuf);

      // Cursor light follows the hovered tile's color so the glow visually
      // ties to whichever tile band the pointer is over. When no tile is
      // hovered, fall back to the selection trend so the fade-out doesn't
      // shift hue mid-fade.
      cursorLight.color.copy(didHoverTile ? hoveredTrendBuf : selectionTrendBuf);

      // ── Selected-range highlight ────────────────────────────────────────
      const sel = selectedRef.current;
      if (sel) {
        const selMid   = (sel.start.getTime() + sel.end.getTime()) / 2;
        const selWidth = (sel.end.getTime() - sel.start.getTime()) / dispRange * SCENE_W;
        highlightMesh.position.x = ((selMid - dispMid) / dispRange) * SCENE_W;
        highlightMesh.scale.x    = selWidth;
      }
      // Highlight is gated by drag state, not by display vs selected range.
      // That way release immediately switches the target to 0 so the fade-out
      // starts right away, instead of trailing the (slow) display ease-back.
      const showHighlight = !!sel && !!dragKnobRef.current;
      const highlightTarget = showHighlight ? 0.30 : 0;
      const uOpacity = highlightMat.uniforms.uOpacity;
      uOpacity.value += (highlightTarget - uOpacity.value) * ease;

      // ── Two thick marker lines (always visible — they ARE the knobs) ──
      if (sel) {
        const startX = ((sel.start.getTime() - dispMid) / dispRange) * SCENE_W;
        const endX   = ((sel.end.getTime()   - dispMid) / dispRange) * SCENE_W;
        markerStart.mesh.position.x = startX;
        markerEnd.mesh.position.x   = endX;
        pickStart.position.x = startX;
        pickEnd.position.x   = endX;
      }
      // Markers stay fully visible always — the held one gets a slight
      // boost in brightness for emphasis; the other stays at base opacity.
      const dragK = dragKnobRef.current;
      const startTarget = dragK === "start" ? 1.0 : 0.9;
      const endTarget   = dragK === "end"   ? 1.0 : 0.9;
      markerStart.mat.opacity += (startTarget - markerStart.mat.opacity) * ease;
      markerEnd.mat.opacity   += (endTarget   - markerEnd.mat.opacity)   * ease;

      // ── Marker glow halo (hover OR drag, follows marker through fade) ─
      // Latch the active knob from drag first, then hover. Stays set while
      // the halo fades so it keeps tracking the marker during the fade-out.
      const activeKnob = dragK ?? hoveredKnobMarker;
      if (activeKnob) markerGlowKnob = activeKnob;
      if (markerGlowKnob === "start")    markerGlowMesh.position.x = markerStart.mesh.position.x;
      else if (markerGlowKnob === "end") markerGlowMesh.position.x = markerEnd.mesh.position.x;
      // Drag glows brighter than hover; both use the same shape.
      const markerGlowTarget = dragK ? 0.55 : (hoveredKnobMarker ? 0.30 : 0);
      const mgUOpacity = markerGlowMat.uniforms.uOpacity;
      mgUOpacity.value += (markerGlowTarget - mgUOpacity.value) * ease;
      markerGlowMesh.visible = mgUOpacity.value > 0.005;
      if (!markerGlowMesh.visible) markerGlowKnob = null;
      // Hover-only widens the halo (the marker bar is half-occluded under
      // the cursor on hover, so a wider glow makes the effect more obvious).
      // Drag and idle both scale to 1.
      const markerGlowScaleTarget = (!dragK && hoveredKnobMarker) ? 2 : 1;
      markerGlowMesh.scale.x += (markerGlowScaleTarget - markerGlowMesh.scale.x) * ease;
      // More saturated than the marker bar — bump HSL saturation so the
      // halo reads as a brighter, more vivid version of the same hue.
      selectionTrendBuf.getHSL(_hslTmp);
      markerGlowColor.setHSL(_hslTmp.h, Math.min(1, _hslTmp.s * 1.8), _hslTmp.l);
      (markerGlowMat.uniforms.uColor.value as THREE.Color).copy(markerGlowColor);

      // ── YQMWD overlay positioning ───────────────────────────────────────
      // Start knob → column extends to the RIGHT of the marker (marker's
      // right edge = column's left edge). End knob → column extends to the
      // LEFT (marker's left edge = column's right edge), so the column
      // never spills past the right edge of the canvas.
      const ov = overlayInfoRef.current;
      const ovDiv = overlayDivRef.current;
      if (ov && ovDiv) {
        // Marker tracks the CURRENT (post-flip) knob; column side stays fixed.
        const knobMs = ov.knob === "start" ? sel?.start.getTime() ?? 0 : sel?.end.getTime() ?? 0;
        const sceneX = ((knobMs - dispMid) / dispRange) * SCENE_W;
        const ndcX = sceneX / ((camera.right - camera.left) / 2);
        const canvasW = renderer.domElement.clientWidth;
        const relX = (ndcX * 0.5 + 0.5) * canvasW;
        const halfMarkerPx = (MARKER_WIDTH / 2) / (camera.right - camera.left) * canvasW;
        const overlayWidth = ovDiv.offsetWidth || 64;
        const leftPx = ov.side === "right"
          ? relX + halfMarkerPx
          : relX - halfMarkerPx - overlayWidth;
        ovDiv.style.left = `${leftPx}px`;
      }

      applyHoverColors();

      // ── Per-ribbon labels (name + pnl/roi + start/end values) ─────────
      // One trio per handle; visibility tied to the handle's currentOpacity
      // so collapsed/expanded state hides the irrelevant ribbons' labels.
      const ribbonRect    = renderer.domElement.getBoundingClientRect();
      const ribbonCanvasW = ribbonRect.width;
      const ribbonCanvasH = ribbonRect.height;
      const halfBoundsX   = (camera.right - camera.left) / 2;
      const yRangeAll     = (ribbons!.yMax - ribbons!.yMin) || 1;
      const trendHexCss = `#${selectionTrendBuf.getHexString()}`;
      // _dimNameColor was already filled above (right after selectionTrendBuf
      // is computed) so the outline pass and this label pass agree on shade.
      const trendDimCss = `#${_dimNameColor.getHexString()}`;
      // Pixel margin between start/end labels and the marker bars at the
      // edges of the selection (markers ≈ 10px wide; this keeps the label
      // safely outside the bar).
      const EDGE_LABEL_MARGIN = 12;
      // Marker pixel distance — used to fade out the ribbon name + pnl/roi
      // when the gap between the two markers is too small to fit the text.
      let markerPxDist = Infinity;
      if (sel) {
        const sSceneX = ((sel.start.getTime() - dispMid) / dispRange) * SCENE_W;
        const eSceneX = ((sel.end.getTime()   - dispMid) / dispRange) * SCENE_W;
        markerPxDist = Math.abs(eSceneX - sSceneX) / (camera.right - camera.left) * ribbonCanvasW;
      }
      for (let hi = 0; hi < handles.length; hi++) {
        const h = handles[hi];
        const nameLabel  = ribbonNameLabelsRef.current[hi];
        const startLabel = ribbonStartLabelsRef.current[hi];
        const endLabel   = ribbonEndLabelsRef.current[hi];
        if (!nameLabel || !startLabel || !endLabel) continue;
        const visible = h.currentOpacity > 0.05;
        nameLabel.style.display  = visible ? "block" : "none";
        startLabel.style.display = visible ? "block" : "none";
        endLabel.style.display   = visible ? "block" : "none";
        if (!visible) continue;
        const arr = handleMs[hi];
        if (arr.length === 0) continue;
        const startMs = sel?.start.getTime() ?? arr[0];
        const endMs   = sel?.end.getTime()   ?? arr[arr.length - 1];
        const startIdx = handleIdxAtOrAfter(arr, startMs);
        const endIdx   = handleIdxAtOrBefore(arr, endMs);
        if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) continue;
        const startPt = h.curve[startIdx];
        const endPt   = h.curve[endIdx];
        // Project ms→canvasX, value→canvasY using the handle's current
        // mesh transform (so labels track expand/collapse animations).
        const scaleY  = h.mesh.scale.y;
        const offsetY = h.mesh.position.y;
        const msToCanvasX = (ms: number) => {
          const sceneX = ((ms - dispMid) / dispRange) * SCENE_W;
          const ndcX = sceneX / halfBoundsX;
          return (ndcX * 0.5 + 0.5) * ribbonCanvasW;
        };
        const ptToY = (pt: BacktestPoint): number => h.yMode === "roi" ? pt.roi : pt.value;
        const valToCanvasY = (v: number) => {
          const sceneY = ((v - ribbons!.yMin) / yRangeAll) * SCENE_H * scaleY + offsetY;
          return ribbonCanvasH * (1 - sceneY / camera.top);
        };
        const startPxX = msToCanvasX(arr[startIdx]);
        const startPxY = valToCanvasY(ptToY(startPt));
        const endPxX   = msToCanvasX(arr[endIdx]);
        const endPxY   = valToCanvasY(ptToY(endPt));
        // Default colour for outline + start + end + name = dim trend hue.
        // Hover brightens all four to the full trend hue.
        const isHovered = hoveredRef.current === h.index;
        const labelColor = isHovered ? trendHexCss : trendDimCss;
        // Hide start/end if the gap between markers can't fit both labels
        // + their outer margins (drag-zoom-out / pinched markers case).
        const startW0 = startLabel.offsetWidth || 0;
        const endW0   = endLabel.offsetWidth || 0;
        const startEndEnoughRoom = markerPxDist > startW0 + endW0 + 2 * EDGE_LABEL_MARGIN + 8;
        const startEndOpacity = String(h.currentOpacity * (startEndEnoughRoom ? 1 : 0));
        // Start label — to the right of the start curve point.
        {
          const w = startW0;
          const lh = startLabel.offsetHeight || 0;
          startLabel.textContent = `$${Math.round(startPt.value).toLocaleString()}`;
          startLabel.style.opacity = startEndOpacity;
          startLabel.style.color = labelColor;
          let left = startPxX + EDGE_LABEL_MARGIN;
          if (left + w > ribbonCanvasW) left = startPxX - EDGE_LABEL_MARGIN - w;
          left = Math.max(0, Math.min(ribbonCanvasW - w, left));
          let top = startPxY - lh / 2;
          top = Math.max(0, Math.min(ribbonCanvasH - lh, top));
          startLabel.style.left = `${left}px`;
          startLabel.style.top  = `${top}px`;
        }
        // End label — to the left of the end curve point.
        {
          const w = endW0;
          const lh = endLabel.offsetHeight || 0;
          endLabel.textContent = `$${Math.round(endPt.value).toLocaleString()}`;
          endLabel.style.opacity = startEndOpacity;
          endLabel.style.color = labelColor;
          let left = endPxX - EDGE_LABEL_MARGIN - w;
          if (left < 0) left = endPxX + EDGE_LABEL_MARGIN;
          left = Math.max(0, Math.min(ribbonCanvasW - w, left));
          let top = endPxY - lh / 2;
          top = Math.max(0, Math.min(ribbonCanvasH - lh, top));
          endLabel.style.left = `${left}px`;
          endLabel.style.top  = `${top}px`;
        }
        // Single-line label: "[name]  [pnl]  [roi]". Selection-baselined.
        const pnlVal = endPt.value - startPt.value;
        const roiVal = startPt.value !== 0 ? pnlVal / startPt.value : 0;
        const labelName = nameLabel.dataset.ribbonName ?? "";
        nameLabel.textContent = `${labelName}    ${pnlVal >= 0 ? "+" : ""}$${Math.round(pnlVal).toLocaleString()}    ${roiVal >= 0 ? "+" : ""}${(roiVal * 100).toFixed(2)}%`;
        nameLabel.style.color = labelColor;
        nameLabel.style.textShadow = "none";
        // Hide when the markers pinch closer together than the label width
        // (drag-zoom-out case). 12px slack each side.
        const enoughRoom = markerPxDist > (nameLabel.offsetWidth || 0) + 24;
        nameLabel.style.opacity = String(h.currentOpacity * (enoughRoom ? 1 : 0));
        // Anchor at the CENTER of the selection horizontally, JUST ABOVE
        // the ribbon's curve top at that X. Flips below the curve if there
        // isn't room above (e.g., when the curve peaks against the top
        // padding zone reserved for the asset title).
        const w = nameLabel.offsetWidth || 0;
        const lh = nameLabel.offsetHeight || 0;
        const midMs = (arr[startIdx] + arr[endIdx]) / 2;
        const midIdx = handleIdxAtOrAfter(arr, midMs);
        const midPt  = h.curve[Math.max(startIdx, Math.min(endIdx, midIdx))];
        const midPxX = msToCanvasX(arr[Math.max(startIdx, Math.min(endIdx, midIdx))]);
        const midPxY = valToCanvasY(ptToY(midPt));
        let left = midPxX - w / 2;
        left = Math.max(0, Math.min(ribbonCanvasW - w, left));
        let top = midPxY - lh - 6;
        if (top < TOP_PADDING_PX) top = midPxY + 6;
        top = Math.max(TOP_PADDING_PX, Math.min(ribbonCanvasH - lh, top));
        nameLabel.style.left = `${left}px`;
        nameLabel.style.top  = `${top}px`;
      }

      // ── Crosshair + cursor-following tooltip ───────────────────────────
      // Hide while dragging (the YQMWD overlay handles indication then) or
      // when the cursor isn't over the canvas.
      const showCrosshair = cursorActive && !dragK;
      const rect = renderer.domElement.getBoundingClientRect();
      const canvasW = rect.width;
      const canvasH = rect.height;
      const cursorPxX = cursorClientX - rect.left;
      const cursorPxY = cursorClientY - rect.top;
      // Cursor's date in ms (cursor light's scene X already tracks the pointer).
      const cursorMs = dispMid + (cursorLight.position.x / SCENE_W) * dispRange;
      const setVis = (el: HTMLDivElement | null, on: boolean) => {
        if (el) el.style.display = on ? "block" : "none";
      };
      setVis(crosshairVRef.current,    showCrosshair);
      setVis(crosshairDateRef.current, showCrosshair);
      if (!showCrosshair) {
        // Hide all per-handle crosshair pools.
        for (let hi = 0; hi < handles.length; hi++) {
          const hl = crosshairHRefs.current[hi];
          const ll = crosshairLeftRefs.current[hi];
          const rl = crosshairRightRefs.current[hi];
          if (hl) hl.style.display = "none";
          if (ll) ll.style.display = "none";
          if (rl) rl.style.display = "none";
        }
      }
      if (showCrosshair) {
        // V crosshair + date label colour: sign of the COMBINED POSITION's
        // PnL between sel.start (baseline) and the cursor's date (current).
        // Cursor-tracking, per-handle PnL/ROI computation happens below for
        // the H lines + per-leg labels.
        const positionArr = handleMs[0];
        const baselinePosIdx = (sel && positionArr.length)
          ? handleIdxAtOrAfter(positionArr, sel.start.getTime())
          : 0;
        const cursorPosIdx   = handleIdxAtOrBefore(positionArr, cursorMs);
        let combinedIsPos = true;
        if (baselinePosIdx >= 0 && cursorPosIdx >= 0) {
          const baseV = handles[0].curve[baselinePosIdx].value;
          const cursV = handles[0].curve[cursorPosIdx].value;
          combinedIsPos = (cursV - baseV) >= 0;
        }
        const vSignColor = combinedIsPos ? PNL_POS_CSS : PNL_NEG_CSS;
        const vLineCss   = combinedIsPos
          ? "rgba(109, 255, 196, 0.55)"
          : "rgba(243, 160, 244, 0.55)";
        const GAP = 4;
        if (crosshairVRef.current) {
          crosshairVRef.current.style.left = `${cursorPxX}px`;
          crosshairVRef.current.style.background = vLineCss;
        }
        if (crosshairDateRef.current) {
          crosshairDateRef.current.textContent = fmtCursorDate(cursorMs);
          crosshairDateRef.current.style.color = vSignColor;
          const labelW = crosshairDateRef.current.offsetWidth || 0;
          let left = cursorPxX + GAP;
          if (left + labelW > canvasW) left = cursorPxX - GAP - labelW;
          left = Math.max(0, Math.min(canvasW - labelW, left));
          crosshairDateRef.current.style.left = `${left}px`;
        }
        // ── Per-handle: H line + sign-coloured PnL + ROI labels ─────────
        // Each visible ribbon gets its own H line at its curve's Y for
        // cursorMs. PnL/ROI are CURSOR-DYNAMIC: baseline = curve at
        // sel.start, current = curve at cursorMs. Sign of (current −
        // baseline) drives this handle's H line colour + label colours.
        const yRangeAll2 = (ribbons!.yMax - ribbons!.yMin) || 1;
        for (let hi = 0; hi < handles.length; hi++) {
          const hh = handles[hi];
          const hLine     = crosshairHRefs.current[hi];
          const leftLabel = crosshairLeftRefs.current[hi];
          const rightLbl  = crosshairRightRefs.current[hi];
          const hVis = hh.currentOpacity > 0.05;
          if (!hVis) {
            if (hLine)     hLine.style.display = "none";
            if (leftLabel) leftLabel.style.display = "none";
            if (rightLbl)  rightLbl.style.display = "none";
            continue;
          }
          const arr = handleMs[hi];
          const cursorIdx = handleIdxAtOrBefore(arr, cursorMs);
          if (cursorIdx < 0) {
            if (hLine)     hLine.style.display = "none";
            if (leftLabel) leftLabel.style.display = "none";
            if (rightLbl)  rightLbl.style.display = "none";
            continue;
          }
          const cursorPt = hh.curve[cursorIdx];
          const cursorY  = hh.yMode === "roi" ? cursorPt.roi : cursorPt.value;
          const sceneY = ((cursorY - ribbons!.yMin) / yRangeAll2) * SCENE_H * hh.mesh.scale.y + hh.mesh.position.y;
          const hPxY = canvasH * (1 - sceneY / camera.top);
          // Cursor-dynamic PnL/ROI: re-baselined to sel.start, endpoint at cursor.
          const baselineIdx = handleIdxAtOrAfter(arr, sel?.start.getTime() ?? arr[0]);
          const baselineV   = baselineIdx >= 0 ? hh.curve[baselineIdx].value : cursorPt.value;
          const pnlVal = cursorPt.value - baselineV;
          const roiVal = baselineV !== 0 ? pnlVal / baselineV : 0;
          const isPos  = pnlVal >= 0;
          const handleSignColor = isPos ? PNL_POS_CSS : PNL_NEG_CSS;
          const handleLineCss   = isPos
            ? "rgba(109, 255, 196, 0.55)"
            : "rgba(243, 160, 244, 0.55)";
          if (hLine) {
            hLine.style.display = "block";
            hLine.style.top = `${hPxY}px`;
            hLine.style.background = handleLineCss;
            hLine.style.opacity = String(hh.currentOpacity);
          }
          // PnL/ROI labels sit just above the H line (flip below if too high).
          const labelH = leftLabel?.offsetHeight || rightLbl?.offsetHeight || 14;
          let labelTop = hPxY - labelH - GAP;
          if (labelTop < 0) labelTop = hPxY + GAP;
          labelTop = Math.max(0, Math.min(canvasH - labelH, labelTop));
          if (leftLabel) {
            leftLabel.style.display = "block";
            leftLabel.style.top = `${labelTop}px`;
            leftLabel.textContent = `${isPos ? "+" : ""}$${Math.round(pnlVal).toLocaleString()}`;
            leftLabel.style.color = handleSignColor;
            leftLabel.style.opacity = String(hh.currentOpacity);
          }
          if (rightLbl) {
            rightLbl.style.display = "block";
            rightLbl.style.top = `${labelTop}px`;
            rightLbl.textContent = `${roiVal >= 0 ? "+" : ""}${(roiVal * 100).toFixed(2)}%`;
            rightLbl.style.color = handleSignColor;
            rightLbl.style.opacity = String(hh.currentOpacity);
          }
        }
      }

      // ── Hide start/end labels that overlap any visible crosshair label ─
      // (Crosshair labels stay simple text — no glass panel — so we
      // physically hide the start/end behind them instead of relying on
      // backdrop-filter to mask them.)
      const crossEls: HTMLElement[] = [];
      const dateEl = crosshairDateRef.current;
      if (dateEl && dateEl.style.display !== "none") crossEls.push(dateEl);
      for (let hi = 0; hi < handles.length; hi++) {
        const ll = crosshairLeftRefs.current[hi];
        const rl = crosshairRightRefs.current[hi];
        if (ll && ll.style.display !== "none") crossEls.push(ll);
        if (rl && rl.style.display !== "none") crossEls.push(rl);
      }
      const overlaps = (a: HTMLElement, b: HTMLElement): boolean => {
        const aL = a.offsetLeft, aT = a.offsetTop;
        const aW = a.offsetWidth, aH = a.offsetHeight;
        const bL = b.offsetLeft, bT = b.offsetTop;
        const bW = b.offsetWidth, bH = b.offsetHeight;
        return aL < bL + bW && aL + aW > bL && aT < bT + bH && aT + aH > bT;
      };
      for (let hi = 0; hi < handles.length; hi++) {
        for (const lbl of [ribbonStartLabelsRef.current[hi], ribbonEndLabelsRef.current[hi]]) {
          if (!lbl || lbl.style.display === "none") continue;
          for (const cross of crossEls) {
            if (overlaps(lbl, cross)) { lbl.style.display = "none"; break; }
          }
        }
      }

      // Sync the top-left/right date labels to the (possibly cross-flipped)
      // selection. Imperative textContent write bypasses React batching so
      // the dates stay locked to the markers during rapid drag scrubs.
      const sel2 = selectedRef.current;
      if (sel2) {
        if (dateStartTextRef.current) dateStartTextRef.current.textContent = sel2.start.toISOString().slice(0, 10);
        if (dateEndTextRef.current)   dateEndTextRef.current.textContent   = sel2.end.toISOString().slice(0, 10);
      }

      // Cursor light fades faster than the rest of the animation system
      // so it feels snappy on hover-in / hover-out.
      const lightEase = 1 - Math.exp(-14 * dt);
      cursorLight.intensity += (cursorLightTarget - cursorLight.intensity) * lightEase;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // Resize handling
    function onResize() {
      const w = mount.clientWidth;
      const hgt = mount.clientHeight;
      renderer.setSize(w, hgt);
      const aspect = w / hgt;
      const visY = SCENE_W / aspect;
      camera.left = -SCENE_W / 2;
      camera.right = +SCENE_W / 2;
      camera.top = visY;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
      computeBaseRibbonYScale();
      computeExpandedYScale(handles);
      computeStackBaselines(handles);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerup",     onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("click", onClick as unknown as EventListener);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      handles.forEach(h => {
        (h.mesh.material as THREE.Material).dispose();
        h.mesh.geometry.dispose();
        (h.outline.material as THREE.Material).dispose();
        h.outline.geometry.dispose();
      });
      highlightGeom.dispose();
      highlightMat.dispose();
      markerStart.geom.dispose();
      markerStart.mat.dispose();
      markerEnd.geom.dispose();
      markerEnd.mat.dispose();
      markerGlowMesh.geometry.dispose();
      markerGlowMat.dispose();
      tickGeom.dispose();
      tickPool.forEach(m => (m.material as THREE.Material).dispose());
      hoverGlowMesh.geometry.dispose();
      hoverGlowMat.dispose();
      if (labelContainer.parentElement === mount) {
        mount.removeChild(labelContainer);
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [ribbons, yMode]);


  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* YQMWD column shown over the dragged marker — position written
          imperatively via overlayDivRef each frame so it tracks the marker
          smoothly through the zoom-out animation. */}
      {overlay && (
        <YQMWDOverlay
          ref={overlayDivRef}
          stride={overlay.stride}
          heldDate={overlay.heldDate}
          themeHex={overlayThemeHex}
          side={overlay.side}
        />
      )}

      {/* Title bar — "Backtest: [asset]" centered, plus the date range
          picker mounted as overlays at top-left / top-right. All sit
          inside the TOP_PADDING_PX band. Yellow matches the date ticks
          (slightly lighter / more opaque so the title pops). */}
      {(asset || data?.asset) && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          fontFamily: "JetBrains Mono, monospace", fontSize: 20, fontWeight: 600,
          color: YELLOW_LABEL_CSS,
          letterSpacing: 1.5,
          zIndex: 7,
          display: "flex", alignItems: "baseline", gap: 6,
          whiteSpace: "nowrap",
        }}>
          <span style={{ pointerEvents: "none" }}>Backtest:</span>
          {/* Fixed-width wrapper sized for the longest US ticker (5 chars).
              The input and the display span both fill 100% of it, so the
              title doesn't shift between modes. The underline is always
              there (transparent → solid on hover/edit) to keep the height
              identical and avoid a 1px jump. */}
          <span style={{
            position: "relative",
            display: "inline-block",
            width: 80,
            textAlign: "center",
          }}>
            {assetEditing ? (
              <input
                ref={assetInputRef}
                value={assetQuery}
                onChange={e => setAssetQuery(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === "Enter")  commitAsset(assetQuery);
                  if (e.key === "Escape") setAssetEditing(false);
                }}
                onBlur={() => {
                  // Slight delay so onMouseDown on a dropdown item gets to
                  // commit before the editor closes (same trick as navbar).
                  assetBlurTimer.current = setTimeout(() => setAssetEditing(false), 160);
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${YELLOW_LABEL_CSS}`,
                  color: "#ffd700",
                  font: "inherit",
                  letterSpacing: "inherit",
                  textAlign: "center",
                  padding: 0,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            ) : (
              <span
                onClick={openAssetEditor}
                onMouseEnter={() => setAssetHover(true)}
                onMouseLeave={() => setAssetHover(false)}
                style={{
                  display: "inline-block",
                  width: "100%",
                  cursor: "pointer",
                  borderBottom: `1px solid ${assetHover ? YELLOW_LABEL_CSS : "transparent"}`,
                  boxSizing: "border-box",
                  transition: "border-color 0.12s ease",
                }}
              >
                {asset ?? data?.asset}
              </span>
            )}
            {assetEditing && assetResults.length > 0 && (
              // Same chrome recipe as the YQMWD gear-shift overlay (each row
              // is its own backdrop-filtered tile, gap:1 between tiles, no
              // outer container background) — just retinted to yellow.
              // overflow:hidden clips the hovered row's outer glow at the
              // dropdown's edges so the bleed doesn't spill past the box.
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: "50%",
                transform: "translateX(-50%)",
                minWidth: 280,
                display: "flex", flexDirection: "column", gap: 1,
                overflow: "hidden",
                zIndex: 100,
                fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 500,
                letterSpacing: 0.5,
                textAlign: "left",
                animation: "overlayFadeIn 0.18s ease both",
              }}>
                {assetResults.map((r, idx) => {
                  const active = idx === assetHoverIdx;
                  // Same active vs inactive colour LOGIC as YQMWD: active =
                  // full bright yellow, inactive = same hue at low alpha.
                  // Symbol is the primary so it gets the strongest contrast;
                  // name + exchange follow with progressively dimmer alphas.
                  const symbolColor = active ? "#ffd700" : "rgba(255, 215, 0, 0.45)";
                  const nameColor   = active ? "rgba(255, 215, 0, 0.70)" : "rgba(255, 215, 0, 0.30)";
                  const exColor     = active ? "rgba(255, 215, 0, 0.50)" : "rgba(255, 215, 0, 0.20)";
                  return (
                    <button
                      key={r.symbol}
                      onMouseDown={() => commitAsset(r.symbol)}
                      onMouseEnter={() => setAssetHoverIdx(idx)}
                      onMouseLeave={() => setAssetHoverIdx(c => c === idx ? null : c)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        width: "100%", padding: "9px 14px",
                        border: "none", cursor: "pointer",
                        textAlign: "left",
                        background: active
                          ? "rgba(255, 215, 0, 0.22)"
                          : "rgba(255, 215, 0, 0.08)",
                        backdropFilter: "blur(10px) saturate(1.2)",
                        WebkitBackdropFilter: "blur(10px) saturate(1.2)",
                        boxShadow: active
                          ? "0 0 14px rgba(255, 215, 0, 0.55), inset 0 1px 0 rgba(255,255,255,0.1)"
                          : "inset 0 1px 0 rgba(255,255,255,0.04)",
                        transition: "background 0.12s ease, box-shadow 0.12s ease, color 0.12s ease",
                      }}
                    >
                      <span style={{ color: symbolColor, fontWeight: 600, minWidth: 56, transition: "color 0.12s ease" }}>
                        {r.symbol}
                      </span>
                      <span style={{ color: nameColor, fontSize: 11, fontWeight: 400, flex: 1, transition: "color 0.12s ease" }}>
                        {r.name}
                      </span>
                      <span style={{ color: exColor, fontSize: 10, fontWeight: 400, transition: "color 0.12s ease" }}>
                        {r.exchange}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </span>
        </div>
      )}
      {selected && onRangeChange && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          zIndex: 6,
        }}>
          <DateRangePicker
            value={selected}
            onChange={onRangeChange}
            min={minDate}
            max={maxDate}
            startTextRef={dateStartTextRef}
            endTextRef={dateEndTextRef}
          />
        </div>
      )}

      {/* Crosshair lines + axis projections — positioned imperatively each
          frame from the canvas effect's cursor state. */}
      <div ref={crosshairVRef} style={{
        position: "absolute", top: 0, bottom: 0, width: 1,
        background: "rgba(180, 210, 255, 0.35)",
        pointerEvents: "none",
        display: "none",
        zIndex: 4,
      }} />
      <div ref={crosshairDateRef} style={{
        position: "absolute", bottom: 4, left: 0,
        fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 600,
        textShadow: "0 1px 3px rgba(0,0,0,0.85)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        display: "none",
        zIndex: 5,
      }} />

      {/* Per-ribbon labels: name + pnl/roi (trend-coloured, glow on hover)
          and start/end value markers (gray, sit at the curve endpoints).
          All positions written imperatively each frame. */}
      {ribbons && Array.from({ length: ribbons.legCount + 1 }).map((_, i) => {
        // Asset moves to its own top title; per-ribbon label is just the
        // strategy/leg name (Position uses default "strategy").
        const _name = i === 0 ? "strategy" : (data?.legs[i - 1]?.name ?? "");
        return (
          <Fragment key={i}>
            <div
              ref={el => { crosshairHRefs.current[i] = el; }}
              style={{
                position: "absolute", left: 0, right: 0, height: 1,
                pointerEvents: "none",
                display: "none",
                zIndex: 4,
              }}
            />
            <div
              ref={el => { crosshairLeftRefs.current[i] = el; }}
              style={{
                position: "absolute", left: 4, top: 0,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 600,
                textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                display: "none",
                zIndex: 5,
              }}
            />
            <div
              ref={el => { crosshairRightRefs.current[i] = el; }}
              style={{
                position: "absolute", right: 4, top: 0,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 600,
                textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                display: "none",
                zIndex: 5,
              }}
            />
            <div
              ref={el => { ribbonNameLabelsRef.current[i] = el; }}
              data-ribbon-name={_name}
              style={{
                position: "absolute", left: 0, top: 0,
                fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600,
                textAlign: "center",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                display: "none",
                zIndex: 5,
                letterSpacing: 0.3,
                // Smooth fade when the markers pinch close enough that the
                // label can't fit between them (drag-zoom-out case).
                transition: "opacity 0.18s ease",
              }}
            />
            <div
              ref={el => { ribbonStartLabelsRef.current[i] = el; }}
              style={{
                position: "absolute", left: 0, top: 0,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500,
                textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                display: "none",
                zIndex: 5,
                transition: "opacity 0.18s ease",
              }}
            />
            <div
              ref={el => { ribbonEndLabelsRef.current[i] = el; }}
              style={{
                position: "absolute", left: 0, top: 0,
                fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500,
                textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                display: "none",
                zIndex: 5,
                transition: "opacity 0.18s ease",
              }}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Tick helpers ────────────────────────────────────────────────────────────
// Aim for 5–10 visible tiles. The pattern is picked dynamically from the
// candidate set based on the visible span:
//   year-5    every 5 years (years divisible by 5)
//   year-2    every 2 years
//   year-1    every year
//   quarter   Jan/Apr/Jul/Oct 1st
//   month     1st of every month
//   week  Mondays only
//   day       every day

type TickStride =
  | "year-5" | "year-2" | "year-1"
  | "quarter" | "month"
  | "week"
  | "day";

const TICK_STRIDE_ORDER: TickStride[] = [
  "year-5", "year-2", "year-1",
  "quarter", "month",
  "week",
  "day",
];

const TICK_STRIDE_APPROX_MS: Record<TickStride, number> = {
  "year-5":   5 * MS_YEAR,
  "year-2":   2 * MS_YEAR,
  "year-1":       MS_YEAR,
  "quarter":  3 * MS_MONTH,
  "month":        MS_MONTH,
  "week": 7 * MS_DAY,
  "day":          MS_DAY,
};

function pickTickStride(span: number): TickStride {
  // Prefer a stride that gives 5–10 tiles, picking the one closest to ~8.
  const TARGET = 8, MIN = 5, MAX = 10;
  let inRange: TickStride | null = null;
  let inRangeDiff = Infinity;
  let fallback: TickStride = "year-1";
  let fallbackDiff = Infinity;
  for (const s of TICK_STRIDE_ORDER) {
    const count = span / TICK_STRIDE_APPROX_MS[s];
    const diff = Math.abs(count - TARGET);
    if (count >= MIN && count <= MAX && diff < inRangeDiff) {
      inRangeDiff = diff;
      inRange = s;
    }
    if (diff < fallbackDiff) {
      fallbackDiff = diff;
      fallback = s;
    }
  }
  return inRange ?? fallback;
}

function buildTickPositions(start: number, end: number, stride: TickStride): number[] {
  // Walk from the period boundary AT OR BEFORE `start` up to the first
  // boundary AFTER `end`. Every tile is a full period (1st of month, Q1
  // start, Monday, etc.). Partial first/last tiles are still rendered so
  // they remain hoverable; the off-canvas LABELS for them are hidden by
  // the canvas-bounds check in the render loop.
  const out: number[] = [];
  let t = boundaryAtOrBefore(stride, start);
  let safety = 0;
  while (t <= end && safety++ < 800) {
    out.push(t);
    t = nextTickAfter(stride, t);
  }
  out.push(t); // first boundary > end so the trailing tile spans past `end`
  return out;
}

function boundaryAtOrBefore(stride: TickStride, ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (stride === "year-1" || stride === "year-2" || stride === "year-5") {
    const step = stride === "year-5" ? 5 : stride === "year-2" ? 2 : 1;
    let y = d.getFullYear();
    while (y % step !== 0) y--;
    return new Date(y, 0, 1).getTime();
  }
  if (stride === "quarter") {
    const m = Math.floor(d.getMonth() / 3) * 3;
    return new Date(d.getFullYear(), m, 1).getTime();
  }
  if (stride === "month") {
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  if (stride === "week") {
    const dow = d.getDay();          // 0=Sun .. 6=Sat
    const offset = dow === 0 ? -6 : 1 - dow; // step back to most recent Mon
    d.setDate(d.getDate() + offset);
    return d.getTime();
  }
  return d.getTime();
}

function firstTickAtOrAfter(stride: TickStride, ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (stride === "year-1" || stride === "year-2" || stride === "year-5") {
    const step = stride === "year-5" ? 5 : stride === "year-2" ? 2 : 1;
    let y = d.getFullYear();
    const onYearStart = d.getMonth() === 0 && d.getDate() === 1;
    const aligned = y % step === 0;
    if (!onYearStart || !aligned || d.getTime() < ms) {
      if (!onYearStart) y++;
      while (y % step !== 0) y++;
    }
    return new Date(y, 0, 1).getTime();
  }
  if (stride === "quarter") {
    let y = d.getFullYear(), m = d.getMonth();
    const onQStart = m % 3 === 0 && d.getDate() === 1 && d.getTime() >= ms;
    if (!onQStart) {
      m = Math.floor(m / 3) * 3 + 3;
      while (m >= 12) { m -= 12; y++; }
    }
    return new Date(y, m, 1).getTime();
  }
  if (stride === "month") {
    const onMStart = d.getDate() === 1 && d.getTime() >= ms;
    if (!onMStart) {
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
    }
    return d.getTime();
  }
  if (stride === "week") {
    const dow = d.getDay();
    let offset = (1 - dow + 7) % 7;
    if (offset === 0 && d.getTime() < ms) offset = 7;
    d.setDate(d.getDate() + offset);
    return d.getTime();
  }
  // day
  if (d.getTime() < ms) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function nextTickAfter(stride: TickStride, t: number): number {
  const d = new Date(t);
  if (stride === "year-1" || stride === "year-2" || stride === "year-5") {
    const step = stride === "year-5" ? 5 : stride === "year-2" ? 2 : 1;
    d.setFullYear(d.getFullYear() + step);
    return d.getTime();
  }
  if (stride === "quarter") { d.setMonth(d.getMonth() + 3); return d.getTime(); }
  if (stride === "month")   { d.setMonth(d.getMonth() + 1); return d.getTime(); }
  if (stride === "week") { d.setDate(d.getDate() + 7); return d.getTime(); }
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

function formatTickLabel(ms: number, stride: TickStride): string {
  const d = new Date(ms);
  if (stride === "year-1" || stride === "year-2" || stride === "year-5") {
    return String(d.getFullYear());
  }
  // Always "Mon D" so the day is unambiguous (e.g., "Jan 1" — not "Jan 25"
  // which read like "Jan 25th" but used to mean Jan 2025).
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

// ── YQMWD HTML overlay (shown over the dragged marker line) ────────────────
// The marker line itself sits at the LEFT edge of this overlay; the column
// extends rightward from the marker. Position is updated per-frame via ref
// (set in BacktestRibbons' tick loop) so it tracks the marker through the
// zoom-out animation. Opacity fades in via CSS keyframe with a small delay
// so the user doesn't see the overlay flash at a stale position.

const STRIDES_TOP_TO_BOTTOM: Stride[] = ["year", "quarter", "month", "week", "day"];

const YQMWDOverlay = forwardRef<HTMLDivElement, { stride: Stride; heldDate: Date; themeHex: string; side: "left" | "right" }>(
  function YQMWDOverlay({ stride, heldDate, themeHex, side }, ref) {
    // Active tile: brighter trend tint. Inactive: same hue, lower alpha so
    // it reads as a darker shade of green/pink (not gray).
    const themeBgActive     = hexToRgba(themeHex, 0.22);
    const themeBgInactive   = hexToRgba(themeHex, 0.08);
    const themeTextActive   = themeHex;
    const themeTextInactive = hexToRgba(themeHex, 0.45);
    const themeGlow         = hexToRgba(themeHex, 0.55);
    // Title (Y/Q/M/W/D) sits on the side closer to the marker bar:
    //   side="left"  → column extends left of marker → marker on RIGHT  → title on RIGHT
    //   side="right" → column extends right of marker → marker on LEFT → title on LEFT
    const titleAnchor: { left?: number; right?: number } = side === "left" ? { right: 6 } : { left: 6 };
    return (
      <div ref={ref} style={{
        position: "absolute",
        left: 0,            // imperatively updated each frame
        top: 0, bottom: 0,
        width: 64,
        pointerEvents: "none",
        display: "flex", flexDirection: "column",
        gap: 1,
        // Float on top of chart elements so it stays visible even when
        // pushed past the canvas edge by the outer-side positioning.
        zIndex: 8,
        opacity: 0,
        animation: "overlayFadeIn 0.25s 0.18s both",
      }}>
        {STRIDES_TOP_TO_BOTTOM.map(s => {
          const active = s === stride;
          return (
            <div key={s} style={{
              flex: 1,
              position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: active ? themeBgActive : themeBgInactive,
              backdropFilter: "blur(10px) saturate(1.2)",
              WebkitBackdropFilter: "blur(10px) saturate(1.2)",
              boxShadow: active
                ? `0 0 14px ${themeGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`
                : "inset 0 1px 0 rgba(255,255,255,0.04)",
              transition: "background 0.12s ease, box-shadow 0.12s ease",
            }}>
              <span style={{
                position: "absolute", ...titleAnchor, top: "50%", transform: "translateY(-50%)",
                fontSize: 11, fontWeight: 700,
                fontFamily: "JetBrains Mono, monospace",
                color: active ? themeTextActive : themeTextInactive,
                letterSpacing: 0.5,
              }}>{STRIDE_LABELS[s]}</span>
              <span style={{
                fontSize: 12, fontWeight: 600,
                fontFamily: "JetBrains Mono, monospace",
                color: active ? themeTextActive : themeTextInactive,
                textShadow: "0 1px 3px rgba(0,0,0,0.85)",
              }}>{strideValueText(s, heldDate)}</span>
            </div>
          );
        })}
      </div>
    );
  },
);

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function legSubtitle(leg: BacktestLeg): string {
  const last = leg.curve[leg.curve.length - 1];
  if (!last) return "";
  const sign = last.pnl >= 0 ? "+" : "";
  return `${sign}${(last.roi * 100).toFixed(1)}%`;
}
