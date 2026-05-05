/**
 * MarketGlobe — Three.js 3-D market bubble graph
 *
 * Layout:
 *   θ   = sector angle (polar, XZ plane)
 *   r   = cylindrical radius — used purely for non-overlap spread (2.0–5.5)
 *   Y   = daysToEarnings (−120 bottom → +120 top; null → hash-spread across range)
 *
 * Visuals:
 *   bubble size   = sqrt(log(marketCap)) — d3.scaleSqrt reference
 *   bubble colour = changePct diverging: #F3A0F4 ↔ neutral ↔ #6DFFC4
 *   glow          = sentimentScore (always bright, sentiment boosts further)
 *   edges         = glowing white co-mention lines
 *
 * Time wall (left of scene, x = WALL_X):
 *   Vertical plane with horizontal gradient bands:
 *     past  (bottom) = yellow  (#ffd700)
 *     today (middle) = white
 *     future(top)    = cyan    (#00d4ff)
 *   On hover: SpotLight from right casts that bubble's shadow onto the wall.
 *
 * Camera:
 *   Auto-rotate, click to pause.
 *
 * Tooltip:
 *   Direct DOM mutation — never triggers React re-render / scene reset.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BubbleAsset {
  ticker: string;
  sector: string;
  price: number;
  changePct: number;
  marketCap: number;   // millions USD
  beta: number;
  sentimentScore: number;
  daysToEarnings: number | null;
}

export interface CoMentionEdge {
  a: string;
  b: string;
  strength: number;
  sameDirection: boolean;
}

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

interface MarketGlobeProps {
  assets: BubbleAsset[];
  edges?: CoMentionEdge[];
  onTickerClick?: (asset: import("./SearchPanel").AssetData | null) => void;
}

// ─── Ticker name lookup ─────────────────────────────────────────────────────

const TICKER_NAMES: Record<string, string> = {
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", GOOGL: "Alphabet",
  META: "Meta Platforms", AMZN: "Amazon", TSLA: "Tesla",
  AVGO: "Broadcom", ORCL: "Oracle", AMD: "AMD", INTC: "Intel",
  QCOM: "Qualcomm", TXN: "Texas Instruments", AMAT: "Applied Materials",
  MU: "Micron Technology", ADBE: "Adobe", CRM: "Salesforce", NOW: "ServiceNow",
  "BRK-B": "Berkshire Hathaway", HD: "Home Depot", SBUX: "Starbucks",
  NKE: "Nike", MCD: "McDonald's", BKNG: "Booking Holdings",
  JNJ: "Johnson & Johnson", UNH: "UnitedHealth", LLY: "Eli Lilly",
  ABBV: "AbbVie", PFE: "Pfizer", MRK: "Merck", TMO: "Thermo Fisher",
  JPM: "JPMorgan Chase", GS: "Goldman Sachs", V: "Visa", MA: "Mastercard",
  BAC: "Bank of America", WFC: "Wells Fargo", MS: "Morgan Stanley",
  NFLX: "Netflix", DIS: "Walt Disney", T: "AT&T", VZ: "Verizon",
  XOM: "ExxonMobil", CVX: "Chevron", COP: "ConocoPhillips", SLB: "SLB",
  CAT: "Caterpillar", RTX: "RTX Corp", BA: "Boeing", GE: "GE Aerospace", HON: "Honeywell",
  WMT: "Walmart", KO: "Coca-Cola", PG: "Procter & Gamble", COST: "Costco", PM: "Philip Morris",
  NEE: "NextEra Energy", DUK: "Duke Energy",
  AMT: "American Tower", PLD: "Prologis",
  SPY: "S&P 500 ETF", QQQ: "Nasdaq 100 ETF", GLD: "Gold ETF", IWM: "Russell 2000 ETF",
  SPX: "S&P 500 Index", NDX: "Nasdaq 100 Index", VIX: "Volatility Index",
  DXY: "US Dollar Index", "10Y": "10-Year Treasury",
  BTC: "Bitcoin", ETH: "Ethereum",
};

// ─── Constants ──────────────────────────────────────────────────────────────

const SECTORS = [
  "Technology", "Consumer Disc.", "Healthcare", "Financials",
  "Communication", "Energy", "Industrials", "Consumer Staples",
  "Utilities", "Real Estate", "ETF", "Index", "Crypto",
];

const MIN_CYL_R    = 2.0;
const Y_DAYS_MAX   = 120;        // ± display range in days
const Y_SCALE      = 0.032;      // days → scene units  (120 days → 3.84 units) — drives dome ticks
const BUBBLE_Y_SCALE = 0.044;    // bubble-only vertical spread; increase to push bubbles further apart
const THETA_SPREAD = 0.10;       // initial angular jitter within sector

const MIN_BUBBLE_R = 0.10;
const MAX_BUBBLE_R = 0.30;
const BUBBLE_GAP   = 0.08;       // minimum clearance between bubble surfaces

const DRIFT_AMP    = 0.035;

// N/A zone cutoff: bubbles without earnings data are placed in [-NA_DAYS_MAX, -NA_DAYS_MIN]
const NA_DAYS_MIN = 47;   // just below the meaningful -45 day boundary
const NA_DAYS_MAX = 70;

// Diverging palette (from bubble.js reference)
const COLOR_GAIN    = new THREE.Color(0x6DFFC4);
const COLOR_LOSS    = new THREE.Color(0xF3A0F4);
const COLOR_NEUTRAL = new THREE.Color(0xa0b8cc);

// ─── Helpers ────────────────────────────────────────────────────────────────

function lerp3(a: THREE.Color, b: THREE.Color, t: number) {
  return new THREE.Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

function changePctColor(pct: number): THREE.Color {
  const c = Math.max(-1, Math.min(1, pct));
  const t = Math.sqrt(Math.abs(c));
  return c >= 0 ? lerp3(COLOR_NEUTRAL, COLOR_GAIN, t) : lerp3(COLOR_NEUTRAL, COLOR_LOSS, t);
}

function bubbleRadius(marketCapM: number): number {
  if (!marketCapM || marketCapM <= 0) return MIN_BUBBLE_R;
  const log = Math.log10(Math.max(1, marketCapM));
  const t   = Math.min(1, Math.sqrt(Math.max(0, (log - 3) / 6)));
  return MIN_BUBBLE_R + t * (MAX_BUBBLE_R - MIN_BUBBLE_R);
}

function sectorAngle(sector: string, hash: number): number {
  const idx  = SECTORS.indexOf(sector);
  const base = ((idx < 0 ? SECTORS.length - 1 : idx) / SECTORS.length) * Math.PI * 2;
  return base + ((hash % 1000) / 1000 * THETA_SPREAD * 2 - THETA_SPREAD);
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function fmtMarketCap(m: number): string {
  if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(2)}T`;
  if (m >= 1_000)     return `$${(m / 1_000).toFixed(1)}B`;
  return `$${m.toFixed(0)}M`;
}

function earningsLabel(d: number | null): string {
  if (d === null) return "N/A";
  if (d > 0)  return `in ${d}d`;
  if (d === 0) return "TODAY";
  return `${Math.abs(d)}d ago`;
}

// ─── Non-overlapping layout ──────────────────────────────────────────────────

interface BubblePos { x: number; y: number; z: number }

function layoutBubbles(
  assets: BubbleAsset[],
  radii: number[],
  sectorAngles: number[],
  yPositions: number[],
  maxCylR: number,
): BubblePos[] {
  const initR = (MIN_CYL_R + maxCylR) / 2;
  const pos: BubblePos[] = assets.map((_, i) => ({
    x: Math.cos(sectorAngles[i]) * initR,
    y: yPositions[i],
    z: Math.sin(sectorAngles[i]) * initR,
  }));

  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx   = pos[i].x - pos[j].x;
        const dy   = pos[i].y - pos[j].y;
        const dz   = pos[i].z - pos[j].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minD = radii[i] + radii[j] + BUBBLE_GAP;

        if (dist < minD && dist > 1e-6) {
          const push = (minD - dist) / dist * 0.5;
          pos[i].x += dx * push * 0.75;
          pos[i].z += dz * push * 0.75;
          pos[j].x -= dx * push * 0.75;
          pos[j].z -= dz * push * 0.75;
          pos[i].y += dy * push * 0.25;
          pos[j].y -= dy * push * 0.25;
        }
      }
    }
    for (let i = 0; i < pos.length; i++) {
      const cylR = Math.sqrt(pos[i].x * pos[i].x + pos[i].z * pos[i].z);
      if (cylR < MIN_CYL_R && cylR > 1e-6) {
        pos[i].x *= MIN_CYL_R / cylR;
        pos[i].z *= MIN_CYL_R / cylR;
      } else if (cylR > maxCylR) {
        pos[i].x *= maxCylR / cylR;
        pos[i].z *= maxCylR / cylR;
      }
    }
  }
  return pos;
}

// ─── Dome canvas texture ─────────────────────────────────────────────────────

const DOME_R = 7.0;

function makeDomeTexture(): THREE.CanvasTexture {
  const W = 2048, H = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const cy = (d: number) => H * (0.5 - d * Y_SCALE / (2 * DOME_R));

  ctx.fillStyle = "#04080f";
  ctx.fillRect(0, 0, W, H);

  const topAlpha = 0.08 + (Y_DAYS_MAX / 10 - 1) * 0.055;
  ctx.fillStyle = `rgba(0,212,255,${topAlpha.toFixed(2)})`;
  ctx.fillRect(0, 0, W, cy(Y_DAYS_MAX));

  ctx.fillStyle = "rgba(50,50,60,0.70)";
  ctx.fillRect(0, cy(-Y_DAYS_MAX), W, H - cy(-Y_DAYS_MAX));

  for (let step = 0; step < Y_DAYS_MAX / 10; step++) {
    const alpha = 0.08 + step * 0.055;
    ctx.fillStyle = `rgba(0,212,255,${alpha.toFixed(2)})`;
    const top = cy((step + 1) * 10), bot = cy(step * 10);
    ctx.fillRect(0, top, W, bot - top);
  }

  for (let step = 0; step < 5; step++) {
    const alpha = 0.08 + step * 0.07;
    ctx.fillStyle = `rgba(255,215,0,${alpha.toFixed(2)})`;
    const top = cy(-step * 10), bot = cy(-(step + 1) * 10);
    ctx.fillRect(0, top, W, bot - top);
  }

  const naTop = cy(-45), naBot = cy(-Y_DAYS_MAX);
  ctx.fillStyle = "rgba(50,50,60,0.70)";
  ctx.fillRect(0, naTop, W, naBot - naTop);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let hx = -H; hx < W + H; hx += 24) {
    ctx.beginPath(); ctx.moveTo(hx, naTop); ctx.lineTo(hx + (naBot - naTop), naBot); ctx.stroke();
  }

  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const col = W * 0.02;

  ctx.font = "bold 44px 'JetBrains Mono', monospace";

  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.fillText("EARNINGS", col, cy(80));
  ctx.fillText("DATE", col, cy(70));

  ctx.fillStyle = "rgba(0,212,255,0.90)";
  ctx.fillText("FUTURE", col, cy(60));

  for (let d = 10; d <= 50; d += 10) {
    const y = cy(d);
    ctx.strokeStyle = "rgba(0,212,255,0.20)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillStyle = "rgba(0,212,255,0.75)";
    ctx.fillText(`+${d}d`, col, y);
  }

  ctx.strokeStyle = "rgba(128,128,128,0.35)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, cy(0)); ctx.lineTo(W, cy(0)); ctx.stroke();
  ctx.fillStyle = "rgba(128,128,128,0.80)";
  ctx.fillText("TODAY", col, cy(0));

  for (let d = 10; d <= 50; d += 10) {
    const y = cy(-d);
    ctx.strokeStyle = "rgba(255,215,0,0.20)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillStyle = "rgba(255,215,0,0.75)";
    ctx.fillText(`-${d}d`, col, y);
  }

  ctx.fillStyle = "rgba(255,215,0,0.90)";
  ctx.fillText("PAST", col, cy(-60));

  ctx.fillStyle = "rgba(128,128,128,0.65)";
  ctx.fillText("N/A", col, cy(-70));

  ctx.restore();

  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;
  for (let px = 0; px < W; px++) {
    const sinFade = 1 - Math.sin(px / W * Math.PI * 2);
    const alpha = ss(0.05, 1.8, sinFade);
    for (let py = 0; py < H; py++) {
      const i = (py * W + px) * 4;
      data[i + 3] = Math.round(data[i + 3] * alpha);
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return new THREE.CanvasTexture(canvas);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MarketGlobe({ assets, edges = [], onTickerClick }: MarketGlobeProps) {
  const mountRef   = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rotating   = useRef(true);

  // ✅ FIX: Keep onTickerClick in a ref so the async fetch always uses the
  // latest version without needing to re-run the entire Three.js useEffect.
  const onTickerClickRef = useRef(onTickerClick);
  useEffect(() => { onTickerClickRef.current = onTickerClick; }, [onTickerClick]);

  useEffect(() => {
    if (!mountRef.current || assets.length === 0) return;

    const W = mountRef.current.clientWidth;
    const H = mountRef.current.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false;
    mountRef.current.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0, 0, 9);

    const camZ     = 9;
    const vHalfTan = Math.tan(THREE.MathUtils.degToRad(55 / 2));
    const maxCylR  = Math.max(MIN_CYL_R + 1, Math.min(5.5, camZ * vHalfTan * (W / H) * 0.8));
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    const hoverGlowLight = new THREE.PointLight(0xffffff, 0, 30);
    scene.add(hoverGlowLight);

    // ── Glass panel — dark clear tint + sharp clearcoat specular glare ──
    // No transmission (= no distortion/haziness). Glass feel comes from the
    // dark tint + the mirror-sharp specular spot produced by clearcoat:1/roughness:0.
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x060810),   // dark blue-black tint
      transparent: true,
      opacity: 0.10,                      // subtle dark veil — clear but present
      roughness: 0.0,                     // perfectly smooth → sharp specular highlight
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4.0), glassMat);
    glassMesh.position.set(0, 0, 6.5);
    scene.add(glassMesh);

    const glareLight = new THREE.PointLight(0xfff4ee, 5.0, 18);
    glareLight.position.set(-3.5, 5.5, 13);
    scene.add(glareLight);

    // ── Bubble group — only this rotates; wall/lights stay fixed ──
    const bubbleGroup = new THREE.Group();
    scene.add(bubbleGroup);

    const domeMat = new THREE.MeshStandardMaterial({
      map: makeDomeTexture(),
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.8,
      roughness: 0.5,
      metalness: 0.8,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 64, 32), domeMat);
    dome.renderOrder = -1;
    scene.add(dome);

    const OW = 512, OH = 2048;
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = OW; overlayCanvas.height = OH;
    const overlayCtx = overlayCanvas.getContext("2d")!;
    const overlayTex = new THREE.CanvasTexture(overlayCanvas);
    const overlayMat = new THREE.MeshBasicMaterial({
      map: overlayTex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const overlayDome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 64, 32), overlayMat);
    scene.add(overlayDome);
    let lastHighlightIdx = -2;

    const radii:        number[] = [];
    const sectorAngles: number[] = [];
    const yPositions:   number[] = [];

    assets.forEach(asset => {
      const h = simpleHash(asset.ticker);
      radii.push(bubbleRadius(asset.marketCap));
      sectorAngles.push(sectorAngle(asset.sector, h));

      if (asset.daysToEarnings !== null) {
        const clamped = Math.max(-Y_DAYS_MAX, Math.min(Y_DAYS_MAX, asset.daysToEarnings));
        yPositions.push(clamped * BUBBLE_Y_SCALE);
      } else {
        const frac = (h % 1000) / 1000;
        yPositions.push(-(NA_DAYS_MIN + frac * (NA_DAYS_MAX - NA_DAYS_MIN)) * BUBBLE_Y_SCALE);
      }
    });

    const positions = layoutBubbles(assets, radii, sectorAngles, yPositions, maxCylR);

    const meshes: {
      mesh: THREE.Mesh;
      glowHalo: THREE.Sprite;
      asset: BubbleAsset;
      basePos: THREE.Vector3;
      phase1: number;
      phase2: number;
      baseEmissive: THREE.Color;
      baseEmissiveIntensity: number;
    }[] = [];
    const posMap: Record<string, THREE.Vector3> = {};

    assets.forEach((asset, i) => {
      const h   = simpleHash(asset.ticker);
      const r   = radii[i];
      const pos = new THREE.Vector3(positions[i].x, positions[i].y, positions[i].z);
      posMap[asset.ticker] = pos.clone();

      const col      = changePctColor(asset.changePct);
      const sentAbs  = Math.min(1, Math.abs(asset.sentimentScore) / 10);
      const baseEmissive          = col.clone();
      const baseEmissiveIntensity = 0.85 + sentAbs * 0.5;

      const mat = new THREE.MeshStandardMaterial({
        color:            new THREE.Color(0x0a0a0a),
        emissive:         baseEmissive.clone(),
        emissiveIntensity: baseEmissiveIntensity,
        transparent:      true,
        opacity:          0.3,
        roughness:        0.5,
        metalness:        0.8,
      });

      const strokeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.025, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.2, side: THREE.BackSide }),
      );

      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = 64; glowCanvas.height = 64;
      const gctx = glowCanvas.getContext("2d")!;
      const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0,    "rgba(255,255,255,0.55)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.18)");
      grad.addColorStop(0.7,  "rgba(255,255,255,0.04)");
      grad.addColorStop(1,    "rgba(255,255,255,0)");
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, 64, 64);

      const glowHalo = new THREE.Sprite(new THREE.SpriteMaterial({
        map:      new THREE.CanvasTexture(glowCanvas),
        color:    col.clone(),
        transparent: true,
        opacity:  0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      glowHalo.scale.set(r * 5, r * 5, 1);

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 18), mat);
      mesh.add(strokeMesh);
      mesh.add(glowHalo);
      mesh.position.copy(pos);
      mesh.userData   = { asset, idx: i };
      bubbleGroup.add(mesh);

      meshes.push({
        mesh, glowHalo, asset,
        basePos: pos.clone(),
        phase1: (h % 1000) / 1000 * Math.PI * 2,
        phase2: ((h >> 12) % 1000) / 1000 * Math.PI * 2,
        baseEmissive,
        baseEmissiveIntensity,
      });
    });

    assets.forEach((asset, i) => {
      const r   = radii[i];

      // Ticker label — inside the bubble, scaled to fit
      const canvas = document.createElement("canvas");
      canvas.width = 96; canvas.height = 44;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "bold 26px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(asset.ticker, 48, 22);
      const tex = new THREE.CanvasTexture(canvas);
      const sp  = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.position.set(positions[i].x, positions[i].y, positions[i].z);
      sp.scale.set(r * 1.6, r * 0.7, 1);
      bubbleGroup.add(sp);

      // Percent change label — hidden for now
      // const pct    = asset.changePct;
      // const pctStr = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
      // const pctColor = `#${changePctColor(asset.changePct).getHexString()}`;
      // const pc = document.createElement("canvas");
      // pc.width = 96; pc.height = 36;
      // const pctx = pc.getContext("2d")!;
      // pctx.font = "bold 22px 'JetBrains Mono', monospace";
      // pctx.fillStyle = pctColor;
      // pctx.textAlign = "center";
      // pctx.textBaseline = "middle";
      // pctx.fillText(pctStr, 48, 18);
      // const pctTex = new THREE.CanvasTexture(pc);
      // const pctSp  = new THREE.Sprite(new THREE.SpriteMaterial({ map: pctTex, transparent: true, depthWrite: false }));
      // pctSp.position.set(positions[i].x, positions[i].y, positions[i].z);
      // pctSp.scale.set(r * 2.2, r * 0.8, 1);
      // bubbleGroup.add(pctSp);
    });

    const allEdges: CoMentionEdge[] = edges.length > 0 ? edges : [
      { a: "AAPL", b: "MSFT", strength: 0.82, sameDirection: true },
      { a: "NVDA", b: "AMD",  strength: 0.65, sameDirection: false },
    ];
    allEdges.forEach(edge => {
      const pa = posMap[edge.a]; const pb = posMap[edge.b];
      if (!pa || !pb) return;
      const pts = [pa, pb];
      [0.06 + edge.strength * 0.08, 0.28 + edge.strength * 0.40].forEach(opacity => {
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        bubbleGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity })));
      });
    });

    const sectorSprites: THREE.Mesh[] = [];
    SECTORS.forEach((sector, i) => {
      const phiC = Math.PI - (i / SECTORS.length) * Math.PI * 2;
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 56;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "bold 19px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(0,212,255,1)";
      ctx.textAlign = "center";
      ctx.fillText(sector.toUpperCase(), 128, 38);
      const tex = new THREE.CanvasTexture(canvas);
      const sp = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.40),
        new THREE.ShaderMaterial({
          uniforms: { map: { value: tex }, opacity: { value: 0.1 } },
          vertexShader: `
            varying vec2 vUv;
            void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform float opacity;
            varying vec2 vUv;
            void main() {
              vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
              vec4 c = texture2D(map, uv);
              gl_FragColor = vec4(c.rgb, c.a * opacity);
            }
          `,
          transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }),
      );
      sp.position.set(-Math.cos(phiC) * (DOME_R - 0.3), 0, Math.sin(phiC) * (DOME_R - 0.3));
      sp.lookAt(0, 0, 0);
      bubbleGroup.add(sp);
      sectorSprites.push(sp);
    });

    const sectorChangePct: Record<string, number> = {};
    SECTORS.forEach(s => {
      const sa = assets.filter(a => a.sector === s);
      const totalMCap = sa.reduce((sum, a) => sum + a.marketCap, 0);
      sectorChangePct[s] = totalMCap > 0
        ? sa.reduce((sum, a) => sum + a.changePct * a.marketCap, 0) / totalMCap
        : 0;
    });

    const N = SECTORS.length;
    const phiWidth = (2 * Math.PI) / N;
    const sectorWedgeMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:        { value: new THREE.Color(1, 1, 1) },
        uOpacity:      { value: 0 },
        uPhiCenter:    { value: 0 },
        uPhiHalfWidth: { value: phiWidth * 0.5 },
      },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3  uColor;
        uniform float uOpacity;
        uniform float uPhiCenter;
        uniform float uPhiHalfWidth;
        varying vec3  vLocalPos;
        void main() {
          float phi  = atan(vLocalPos.z, -vLocalPos.x);
          float diff = abs(mod(phi - uPhiCenter + 3.14159265, 6.28318530) - 3.14159265);
          float a    = (1.0 - smoothstep(uPhiHalfWidth * 0.6, uPhiHalfWidth, diff)) * uOpacity;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const sectorWedge = new THREE.Mesh(new THREE.SphereGeometry(DOME_R - 0.05, 64, 32), sectorWedgeMat);
    bubbleGroup.add(sectorWedge);
    let lastSectorIdx = -2;

    const raycaster  = new THREE.Raycaster();
    const mouse      = new THREE.Vector2(-99, -99);
    let   hoveredIdx = -1;
    let   lastTooltipIdx = -2;   // tracks which ticker the tooltip HTML was rendered for

    let isDragging    = false;
    let dragStartX    = 0;
    let dragLastX     = 0;
    let dragMoved     = 0;
    let dragVelocity  = 0;

    function onMouseDown(e: MouseEvent) {
      isDragging   = true;
      dragStartX   = e.clientX;
      dragLastX    = e.clientX;
      dragMoved    = 0;
      dragVelocity = 0;
    }

    function onMouseMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

      if (isDragging) {
        const dx = e.clientX - dragLastX;
        dragMoved  += Math.abs(e.clientX - dragStartX);
        dragVelocity = dx * 0.005;
        bubbleGroup.rotation.y += dragVelocity;
        dragLastX = e.clientX;
      }
    }

    function onMouseUp() {
      isDragging = false;
    }

    function onClick() {
      if (dragMoved < 4) {
        if (hoveredIdx >= 0 && onTickerClickRef.current) {
          const clickedAsset = meshes[hoveredIdx]?.asset;
          if (clickedAsset) {
            const placeholder = {
              ticker: clickedAsset.ticker,
              name: clickedAsset.ticker,
              type: "STOCK" as const,
              sector: clickedAsset.sector,
              price: clickedAsset.price,
              change: 0,
              changePct: clickedAsset.changePct,
              up: clickedAsset.changePct >= 0,
              volume: "—", avgVolume: "—", volRatio: 1,
              marketCap: "—", pe: null, forwardPe: null, peg: null,
              eps: null, revenueGrowth: null, revenueGrowthQoQ: null,
              week52High: 0, week52Low: 0, week52Pos: 50,
              nextEarnings: null, rsi: 50, beta: clickedAsset.beta,
              shortFloatPct: null, daysToCover: null,
              institutionalOwnership: 0, insiderActivity: "neutral" as const,
              insiderNet: 0, dividendYield: null, freeCashFlow: null,
              description: "", chartSeed: 0,
              chartTrend: clickedAsset.changePct >= 0 ? 1 : -1,
            };

            // Show tile immediately with placeholder data
            onTickerClickRef.current(placeholder);

            // ✅ FIX: Guard the async fetch so it NEVER clears the tile.
            // - Only call onTickerClick if we get valid data back (data.ticker exists)
            // - If the fetch fails (429, network error, etc.), the placeholder stays visible
            // - Uses onTickerClickRef so we always have the latest callback
            fetch(`${BACKEND_BASE}/api/asset/?symbol=${encodeURIComponent(clickedAsset.ticker)}`)
              .then(r => r.json())
              .then(data => {
                if (data && data.ticker && onTickerClickRef.current) {
                  onTickerClickRef.current(data);
                }
                // ✅ If data is bad/empty/error JSON, we do nothing — placeholder stays
              })
              .catch(() => {
                // ✅ Network error or 429 — silently keep the placeholder tile open
              });
          }
        } else {
          rotating.current = !rotating.current;
          // Auto-resume after 4 seconds if paused
          if (!rotating.current) {
            setTimeout(() => { rotating.current = true; }, 4000);
          }
        }
      }
    }

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mouseup",   onMouseUp);
    renderer.domElement.addEventListener("click",     onClick);

    let frameId = 0, t = 0;
    const meshList      = meshes.map(m => m.mesh);
    const _worldPos     = new THREE.Vector3();
    const hoverBoosts = new Float32Array(assets.length).fill(0);
    const bounceTimes = new Float32Array(assets.length).fill(1000);
    const bounceSigns = new Float32Array(assets.length).fill(0);
    const wasHovered  = new Uint8Array(assets.length).fill(0);

    function animate() {
      frameId = requestAnimationFrame(animate);
      t += 0.007;

      meshes.forEach(({ mesh, asset, basePos, phase1, phase2 }) => {
        const freq = Math.max(0.3, Math.min(2, asset.beta || 1));
        mesh.position.set(
          basePos.x + Math.sin(t * freq         + phase1) * DRIFT_AMP,
          basePos.y + Math.sin(t * freq * 1.3   + phase2) * DRIFT_AMP * 0.5,
          basePos.z + Math.cos(t * freq * 0.7   + phase1) * DRIFT_AMP,
        );
      });

      if (!isDragging) {
        dragVelocity *= 0.92;
        bubbleGroup.rotation.y += dragVelocity;
      }
      if (rotating.current && !isDragging && Math.abs(dragVelocity) < 0.0002) {
        bubbleGroup.rotation.y += 0.0008;
      }

      meshes.forEach(({ mesh, glowHalo, baseEmissive, baseEmissiveIntensity }, i) => {
        const hovered = i === hoveredIdx;
        hoverBoosts[i] += ((hovered ? 1 : 0) - hoverBoosts[i]) * 0.07;
        const b = hoverBoosts[i];

        if (hovered) {
          mesh.scale.setScalar(1 + b * 0.08);
        } else {
          if (wasHovered[i]) { bounceTimes[i] = 0; bounceSigns[i] = 0.5; }
          bounceTimes[i] += 1;
          const bt = bounceTimes[i];
          mesh.scale.setScalar(1 + b * 0.08 + bounceSigns[i] * 0.15 * Math.sin(0.38 * bt) * Math.exp(-0.13 * bt));
        }
        wasHovered[i] = hovered ? 1 : 0;

        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.copy(baseEmissive).multiplyScalar(1 + b * 1.2);
        mat.emissiveIntensity = baseEmissiveIntensity + b * 0.6;
        (glowHalo.material as THREE.SpriteMaterial).opacity = b * 0.72;
      });

      const maxBoost = hoveredIdx >= 0 ? hoverBoosts[hoveredIdx] : 0;

      if (hoveredIdx !== lastHighlightIdx) {
        lastHighlightIdx = hoveredIdx;
        overlayCtx.clearRect(0, 0, OW, OH);
        if (hoveredIdx >= 0) {
          const days = meshes[hoveredIdx].asset.daysToEarnings;
          const oCy = (d: number) => OH * (0.5 - d * Y_SCALE / (2 * DOME_R));
          const centerD = days !== null
            ? Math.max(-Y_DAYS_MAX, Math.min(Y_DAYS_MAX, days))
            : -70;
          const half = 7;
          const top = oCy(centerD + half), bot = oCy(centerD - half);
          const rgb = days === null ? "80,80,100"
            : days > 0   ? "0,212,255"
            : days > -45 ? "255,215,0"
            : "80,80,100";
          const grad = overlayCtx.createLinearGradient(0, top, 0, bot);
          grad.addColorStop(0,    `rgba(${rgb},0)`);
          grad.addColorStop(0.25, `rgba(${rgb},1)`);
          grad.addColorStop(0.75, `rgba(${rgb},1)`);
          grad.addColorStop(1,    `rgba(${rgb},0)`);
          overlayCtx.fillStyle = grad;
          overlayCtx.fillRect(0, top, OW, bot - top);
        }
        overlayTex.needsUpdate = true;
      }
      overlayMat.opacity += (maxBoost * 0.3 - overlayMat.opacity) * 0.07;

      const hoveredSectorIdx = hoveredIdx >= 0 ? SECTORS.indexOf(meshes[hoveredIdx].asset.sector) : -1;
      sectorSprites.forEach((sp, i) => {
        sp.lookAt(0, 0, 0);
        const targetOpacity = i === hoveredSectorIdx ? 1.0 : 0.1;
        const mat = sp.material as THREE.ShaderMaterial;
        mat.uniforms.opacity.value += (targetOpacity - mat.uniforms.opacity.value) * 0.07;
      });
      if (hoveredSectorIdx !== lastSectorIdx) {
        lastSectorIdx = hoveredSectorIdx;
        if (hoveredSectorIdx >= 0) {
          const phiCenter = Math.PI - (hoveredSectorIdx / N) * Math.PI * 2;
          sectorWedgeMat.uniforms.uPhiCenter.value = phiCenter;
          const chg = sectorChangePct[SECTORS[hoveredSectorIdx]] ?? 0;
          sectorWedgeMat.uniforms.uColor.value.copy(changePctColor(chg));
        }
      }
      sectorWedgeMat.uniforms.uOpacity.value += (maxBoost * 0.3 - sectorWedgeMat.uniforms.uOpacity.value) * 0.07;

      if (maxBoost > 0.01 && hoveredIdx >= 0) {
        meshes[hoveredIdx].mesh.getWorldPosition(_worldPos);
        hoverGlowLight.position.copy(_worldPos);
        hoverGlowLight.color.copy(meshes[hoveredIdx].baseEmissive);
      }
      hoverGlowLight.intensity += (maxBoost * 30 - hoverGlowLight.intensity) * 0.07;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshList, false);
      const tip  = tooltipRef.current;

      if (hits.length > 0) {
        const hit   = hits[0].object as THREE.Mesh;
        const asset = hit.userData.asset as BubbleAsset;
        const idx   = hit.userData.idx as number;
        hoveredIdx  = idx;

        hit.getWorldPosition(_worldPos);

        if (tip) {
          const rect = renderer.domElement.getBoundingClientRect();
          const sp   = _worldPos.clone().project(camera);
          tip.style.left    = `${(sp.x + 1) / 2 * rect.width + 14}px`;
          tip.style.top     = `${(1 - (sp.y + 1) / 2) * rect.height - 10}px`;
          tip.style.display = "block";
        }

        // Only rewrite tooltip HTML when the hovered bubble changes — otherwise
        // the CSS animation on the earnings <td> restarts every frame at 0%,
        // making the blink invisible. Position updates above still run per-frame.
        if (tip && hoveredIdx !== lastTooltipIdx) {
          lastTooltipIdx = hoveredIdx;
          const pct      = asset.changePct;
          const pctColor = `#${changePctColor(pct).getHexString()}`;
          const bc = changePctColor(pct);
          const br = Math.round(bc.r * 255), bg2 = Math.round(bc.g * 255), bb = Math.round(bc.b * 255);
          tip.style.background = `rgba(${br},${bg2},${bb},0.20)`;
          // Earnings colour: white=today, cyan=future, yellow=past
          const d = asset.daysToEarnings;
          let earningsColor: string;
          if (d === null)      earningsColor = "rgba(160,160,160,0.7)";
          else if (d === 0)    earningsColor = "#ffffff";
          else if (d > 0)      earningsColor = "#00d4ff";
          else                 earningsColor = "#ffd700";

          // Sector colour: same as the wedge (changePct-derived for the sector)
          const sectorChg = sectorChangePct[asset.sector] ?? 0;
          const sectorCol = `#${changePctColor(sectorChg).getHexString()}`;
          const sentColor = asset.sentimentScore > 0 ? "#6DFFC4" : asset.sentimentScore < 0 ? "#F3A0F4" : "#aabbcc";
          const fullName = TICKER_NAMES[asset.ticker] ?? asset.ticker;
          tip.innerHTML = `
            <div style="font-size:14px;font-weight:700;color:#e8f4ff;font-family:'JetBrains Mono',monospace;letter-spacing:0.05em">${asset.ticker}</div>
            <div style="font-size:11px;color:rgba(220,235,255,0.70);font-family:'DM Sans',sans-serif;margin-bottom:6px">${fullName}</div>
            <div style="color:${sectorCol};font-size:10px;font-family:'JetBrains Mono',monospace;margin-bottom:8px;letter-spacing:0.08em">${asset.sector.toUpperCase()}</div>
            <table style="width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;font-size:11px">
              <tr><td style="color:rgba(220,235,255,0.80);padding:1px 8px 1px 0">Price</td>
                  <td style="color:#e8f4ff;text-align:right">$${asset.price.toFixed(2)}</td></tr>
              <tr><td style="color:rgba(220,235,255,0.80);padding:1px 8px 1px 0">Change</td>
                  <td style="color:${pctColor};text-align:right;font-weight:600">${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%</td></tr>
              <tr><td style="color:rgba(220,235,255,0.80);padding:1px 8px 1px 0">Market Cap</td>
                  <td style="color:#e8f4ff;text-align:right">${fmtMarketCap(asset.marketCap)}</td></tr>
              <tr><td style="color:rgba(220,235,255,0.80);padding:1px 8px 1px 0">Beta</td>
                  <td style="color:#e8f4ff;text-align:right">${asset.beta.toFixed(2)}</td></tr>
              <tr><td style="color:rgba(220,235,255,0.80);padding:1px 8px 1px 0">Sentiment</td>
                  <td style="color:${sentColor};text-align:right">${asset.sentimentScore > 0 ? "+" : ""}${asset.sentimentScore.toFixed(1)}</td></tr>
              <tr><td style="color:rgba(220,235,255,0.80);padding:1px 8px 1px 0">Earnings</td>
                  <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:10px;color:${earningsColor}">${earningsLabel(asset.daysToEarnings)}</td></tr>
            </table>`;
        }
      } else {
        hoveredIdx = -1;
        lastTooltipIdx = -2;
        if (tip) { tip.style.display = "none"; tip.style.background = "rgba(6,16,30,0.92)"; }
      }

      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      const scale = Math.min(1, (w / h) / (W / H));
      bubbleGroup.scale.setScalar(scale);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mouseup",   onMouseUp);
      renderer.domElement.removeEventListener("click",     onClick);
      glassMesh.geometry.dispose(); glassMat.dispose(); scene.remove(glassMesh);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) mountRef.current.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, edges]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      <div ref={tooltipRef} style={{
        display: "none", position: "absolute",
        background: "rgba(6,16,30,0.92)",
        border: "1px solid rgba(180,180,180,0.15)",
        borderRadius: 9, padding: "10px 14px",
        pointerEvents: "none",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        zIndex: 10, minWidth: 160,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }} />
      <div style={{
        position: "absolute", bottom: 12, right: 16,
        fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        color: "rgba(0,180,255,0.25)", letterSpacing: "0.12em", pointerEvents: "none",
      }}>
        CLICK TO PAUSE ROTATION
      </div>
    </div>
  );
}

// ─── LandingMarketGlobe ──────────────────────────────────────────────────────

interface LandingMarketGlobeProps {
  onTickerClick?: (asset: import("./SearchPanel").AssetData | null) => void;
}

export function LandingMarketGlobe({ onTickerClick }: LandingMarketGlobeProps = {}) {
  const [assets, setAssets] = useState<BubbleAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch("/api/market-overview/")
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          if (d.assets?.length) {
            setAssets(d.assets);
            // ✅ FIX: Stop polling once assets are loaded — prevents assets state
            // from changing and re-running the Three.js useEffect mid-session
          } else if (d.loading) {
            setTimeout(poll, 4000);
          }
        })
        .catch(() => { if (!cancelled) setTimeout(poll, 4000); });
    };
    poll();
    return () => { cancelled = true; };
  }, []);

  if (assets.length === 0) return null;
  return <MarketGlobe assets={assets} onTickerClick={onTickerClick} />;
}
