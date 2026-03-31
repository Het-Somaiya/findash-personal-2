/**
 * MarketGlobe — Three.js 3-D market bubble graph
 *
 * Coordinate system (polar-cylindrical):
 *   θ  = sector  (evenly spaced around the cylinder)
 *   Y  = daysToEarnings  (−45 at bottom → +45 at top; stocks with no date at −45)
 *   r  = fixed cylinder radius (uniform; sector-proportional cluster spread handled by θ spread)
 *
 * Visuals:
 *   size  = log(marketCap)
 *   color = changePct gradient  (red ↔ grey ↔ green)
 *   glow  = sentimentScore magnitude
 *   edges = co-mention lines (placeholder: AAPL↔MSFT, NVDA↔AMD)
 *
 * Camera:
 *   auto-rotate when idle, click canvas to toggle pause
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BubbleAsset {
  ticker: string;
  sector: string;
  price: number;
  changePct: number;
  marketCap: number;  // millions USD
  beta: number;
  sentimentScore: number;
  daysToEarnings: number | null;
}

export interface CoMentionEdge {
  a: string;
  b: string;
  strength: number;   // 0–1
  sameDirection: boolean;
}

interface MarketGlobeProps {
  assets: BubbleAsset[];
  edges?: CoMentionEdge[];
  width?: number;
  height?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SECTORS = [
  "Technology",
  "Consumer Disc.",
  "Healthcare",
  "Financials",
  "Communication",
  "Energy",
  "Industrials",
  "Consumer Staples",
  "Utilities",
  "Real Estate",
  "Other",
];

const CYLINDER_RADIUS = 3.2;
const Y_SCALE = 0.04;         // multiply daysToEarnings to scene units
const Y_SPREAD = 0.18;        // small vertical jitter within sector
const THETA_SPREAD = 0.13;    // angular jitter within sector (radians)

const MIN_BUBBLE_R = 0.07;
const MAX_BUBBLE_R = 0.38;

const DRIFT_AMPLITUDE = 0.04;

// ─── Helpers ────────────────────────────────────────────────────────────────

function lerpColor(a: THREE.Color, b: THREE.Color, t: number) {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

const GREEN  = new THREE.Color(0x00d282);
const RED    = new THREE.Color(0xff4060);
const GREY   = new THREE.Color(0x4a6080);

function changePctColor(pct: number): THREE.Color {
  const clamped = Math.max(-5, Math.min(5, pct));
  if (clamped >= 0) return lerpColor(GREY, GREEN, clamped / 5);
  return lerpColor(GREY, RED, -clamped / 5);
}

function bubbleRadius(marketCapM: number): number {
  if (!marketCapM || marketCapM <= 0) return MIN_BUBBLE_R;
  const log = Math.log10(Math.max(1, marketCapM));
  const t = Math.min(1, (log - 3) / 6); // 3→9 log scale → 0→1
  return MIN_BUBBLE_R + t * (MAX_BUBBLE_R - MIN_BUBBLE_R);
}

function sectorAngle(sector: string, hash: number): number {
  const idx = SECTORS.indexOf(sector);
  const base = ((idx < 0 ? SECTORS.length - 1 : idx) / SECTORS.length) * Math.PI * 2;
  const jitter = (hash % 1000) / 1000 * THETA_SPREAD * 2 - THETA_SPREAD;
  return base + jitter;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MarketGlobe({ assets, edges = [], width = 800, height = 600 }: MarketGlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rotating = useRef(true);
  // tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number; asset: BubbleAsset } | null>(null);

  useEffect(() => {
    if (!mountRef.current || assets.length === 0) return;

    const W = mountRef.current.clientWidth  || width;
    const H = mountRef.current.clientHeight || height;

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    // ── Scene / Camera ──
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0, 1.2, 8.5);
    camera.lookAt(0, 0, 0);

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0x203050, 1.2));
    const pt = new THREE.PointLight(0x00d4ff, 1.8, 30);
    pt.position.set(4, 4, 6);
    scene.add(pt);

    // ── Build bubble positions ──
    const posMap: Record<string, THREE.Vector3> = {};
    const meshes: { mesh: THREE.Mesh; asset: BubbleAsset; basePos: THREE.Vector3; phase1: number; phase2: number }[] = [];

    assets.forEach(asset => {
      const h = simpleHash(asset.ticker);
      const theta = sectorAngle(asset.sector, h);
      const days = asset.daysToEarnings ?? -45;
      const clampedDays = Math.max(-45, Math.min(45, days));
      const yJitter = ((h >> 4) % 100) / 100 * Y_SPREAD * 2 - Y_SPREAD;
      const y = clampedDays * Y_SCALE + yJitter;

      const x = Math.cos(theta) * CYLINDER_RADIUS;
      const z = Math.sin(theta) * CYLINDER_RADIUS;

      const pos = new THREE.Vector3(x, y, z);
      posMap[asset.ticker] = pos.clone();

      const r = bubbleRadius(asset.marketCap);
      const geo = new THREE.SphereGeometry(r, 24, 16);
      const col = changePctColor(asset.changePct);

      // glow intensity from sentiment
      const sentAbs = Math.min(1, Math.abs(asset.sentimentScore) / 10);
      const emissiveIntensity = 0.2 + sentAbs * 0.8;
      const emissiveColor = asset.sentimentScore >= 0
        ? new THREE.Color(0x00d282).multiplyScalar(sentAbs)
        : new THREE.Color(0xff4060).multiplyScalar(sentAbs);

      const mat = new THREE.MeshPhongMaterial({
        color: col,
        emissive: emissiveColor,
        emissiveIntensity,
        transparent: true,
        opacity: 0.82,
        shininess: 60,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { asset };
      scene.add(mesh);

      meshes.push({
        mesh,
        asset,
        basePos: pos.clone(),
        phase1: (h % 1000) / 1000 * Math.PI * 2,
        phase2: ((h >> 12) % 1000) / 1000 * Math.PI * 2,
      });
    });

    // ── Co-mention edges ──
    const edgeLines: THREE.Line[] = [];
    const allEdges: CoMentionEdge[] = edges.length > 0 ? edges : [
      { a: "AAPL", b: "MSFT", strength: 0.82, sameDirection: true },
      { a: "NVDA", b: "AMD",  strength: 0.65, sameDirection: false },
    ];

    allEdges.forEach(edge => {
      const pa = posMap[edge.a];
      const pb = posMap[edge.b];
      if (!pa || !pb) return;

      const edgeColor = edge.sameDirection ? 0x00d4ff : 0xff9940;
      const pts = [pa, pb];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: 0.25 + edge.strength * 0.35,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);
      edgeLines.push(line);
    });

    // ── Sector ring labels (floating sprites via canvas textures) ──
    SECTORS.forEach((sector, i) => {
      const theta = (i / SECTORS.length) * Math.PI * 2;
      const x = Math.cos(theta) * (CYLINDER_RADIUS + 0.8);
      const z = Math.sin(theta) * (CYLINDER_RADIUS + 0.8);

      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 256, 64);
      ctx.font = "bold 22px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(0,180,255,0.55)";
      ctx.textAlign = "center";
      ctx.fillText(sector.toUpperCase(), 128, 40);

      const tex = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(x, 2.2, z);
      sprite.scale.set(1.6, 0.4, 1);
      scene.add(sprite);
    });

    // ── Y-axis tick labels (earnings timeline) ──
    [-45, -30, -15, 0, 15, 30, 45].forEach(d => {
      const canvas = document.createElement("canvas");
      canvas.width = 128; canvas.height = 48;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, 128, 48);
      ctx.font = "16px 'JetBrains Mono', monospace";
      ctx.fillStyle = d === 0 ? "rgba(255,255,255,0.6)" : "rgba(0,180,255,0.35)";
      ctx.textAlign = "left";
      ctx.fillText(d === 0 ? "TODAY" : `${d > 0 ? "+" : ""}${d}d`, 4, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.position.set(-CYLINDER_RADIUS - 1.0, d * Y_SCALE, 0);
      sp.scale.set(0.9, 0.32, 1);
      scene.add(sp);
    });

    // ── Axis line ──
    {
      const pts = [new THREE.Vector3(0, -45 * Y_SCALE - 0.3, 0), new THREE.Vector3(0, 45 * Y_SCALE + 0.3, 0)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x1a3050, transparent: true, opacity: 0.4 });
      scene.add(new THREE.Line(geo, mat));
    }

    // ── Raycaster for hover ──
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-99, -99);

    function onMouseMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }

    function onClick() {
      rotating.current = !rotating.current;
    }

    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onClick);

    // ── Animation loop ──
    let frameId = 0;
    let t = 0;
    let cameraTheta = 0;

    function animate() {
      frameId = requestAnimationFrame(animate);
      t += 0.008;

      // bubble drift
      meshes.forEach(({ mesh, asset, basePos, phase1, phase2 }) => {
        const freq = asset.beta || 1;
        mesh.position.set(
          basePos.x + Math.sin(t * freq + phase1) * DRIFT_AMPLITUDE,
          basePos.y + Math.sin(t * freq * 1.3 + phase2) * DRIFT_AMPLITUDE * 0.6,
          basePos.z + Math.cos(t * freq * 0.7 + phase1) * DRIFT_AMPLITUDE,
        );
      });

      // camera auto-rotate
      if (rotating.current) {
        cameraTheta += 0.003;
        camera.position.x = Math.sin(cameraTheta) * 8.5;
        camera.position.z = Math.cos(cameraTheta) * 8.5;
        camera.lookAt(0, 0, 0);
      }

      // hover detection
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshes.map(m => m.mesh));
      if (hits.length > 0) {
        const asset = hits[0].object.userData.asset as BubbleAsset;
        const rect = renderer.domElement.getBoundingClientRect();
        // project center to screen
        const screenPos = hits[0].object.position.clone().project(camera);
        setTooltip({
          x: (screenPos.x + 1) / 2 * rect.width,
          y: (1 - (screenPos.y + 1) / 2) * rect.height,
          asset,
        });
      } else {
        setTooltip(null);
      }

      renderer.render(scene, camera);
    }
    animate();

    // ── Resize ──
    function onResize() {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, edges]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute",
          left: tooltip.x + 12,
          top:  tooltip.y - 40,
          background: "rgba(8,20,36,0.90)",
          border: "1px solid rgba(0,180,255,0.25)",
          borderRadius: 8,
          padding: "8px 12px",
          pointerEvents: "none",
          backdropFilter: "blur(12px)",
          zIndex: 10,
          minWidth: 130,
        }}>
          <div style={{ color: "#e8f4ff", fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700 }}>
            {tooltip.asset.ticker}
          </div>
          <div style={{ color: "rgba(180,210,255,0.6)", fontFamily: "'DM Sans',sans-serif", fontSize: 11, marginTop: 2 }}>
            {tooltip.asset.sector}
          </div>
          <div style={{
            color: tooltip.asset.changePct >= 0 ? "#00d282" : "#ff4060",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 12, marginTop: 4,
          }}>
            {tooltip.asset.changePct >= 0 ? "+" : ""}{tooltip.asset.changePct.toFixed(2)}%
          </div>
          {tooltip.asset.daysToEarnings !== null && (
            <div style={{ color: "rgba(0,180,255,0.6)", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, marginTop: 3 }}>
              Earnings: {tooltip.asset.daysToEarnings > 0 ? `in ${tooltip.asset.daysToEarnings}d` : tooltip.asset.daysToEarnings === 0 ? "today" : `${Math.abs(tooltip.asset.daysToEarnings)}d ago`}
            </div>
          )}
        </div>
      )}

      {/* Click hint */}
      <div style={{
        position: "absolute", bottom: 12, right: 16,
        fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        color: "rgba(0,180,255,0.30)", letterSpacing: "0.12em",
        pointerEvents: "none",
      }}>
        CLICK TO PAUSE ROTATION
      </div>
    </div>
  );
}

// ─── LandingMarketGlobe — data-fetching wrapper ──────────────────────────────

export function LandingMarketGlobe() {
  const [assets, setAssets] = useState<BubbleAsset[]>([]);

  useEffect(() => {
    fetch("/api/market-overview/")
      .then(r => r.json())
      .then(d => { if (d.assets) setAssets(d.assets); })
      .catch(() => {});
  }, []);

  if (assets.length === 0) return null;

  return <MarketGlobe assets={assets} />;
}
