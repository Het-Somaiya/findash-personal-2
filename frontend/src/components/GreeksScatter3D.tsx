import { useState, useEffect, useRef } from "react";

// ── Build options-chain Greeks point cloud ───────────────────────────────────
function buildGreeksPoints() {
  let s = 0xdeadbeef;
  const rand = () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };

  const pts: Array<{ theta: number; delta: number; gamma: number; iv: number; ret: number }> = [];

  for (let i = 0; i < 1450; i++) {
    let delta: number;
    const du = rand();
    if      (du < 0.08) delta = -(0.92 + rand() * 0.08);
    else if (du < 0.22) delta = -(0.50 + rand() * 0.42);
    else if (du < 0.50) delta = -(0.02 + rand() * 0.48);
    else if (du < 0.78) delta =   0.02 + rand() * 0.48;
    else if (du < 0.92) delta =   0.50 + rand() * 0.42;
    else                delta =   0.92 + rand() * 0.08;

    const atmProx   = 1.0 - Math.abs(Math.abs(delta) - 0.5) * 2;
    const thetaBase = 0.005 + rand() * 0.055;
    const theta     = -(thetaBase * (0.4 + 0.6 * (atmProx + 0.2)));
    const gammaMax  = 0.06 * atmProx;
    const gamma     = Math.max(0.0005, rand() * gammaMax + 0.001);
    const iv        = 0.20 + rand() * 0.80;

    let ret: number;
    const rv = rand();
    if      (rv < 0.50) ret = -(rand() * 0.8 + 0.1);
    else if (rv < 0.70) ret = -(rand() * 3.0 + 0.8);
    else if (rv < 0.82) ret =   rand() * 0.8;
    else if (rv < 0.93) ret =   rand() * 4.0 + 1.0;
    else                ret =   rand() * 8.0 + 4.0;

    pts.push({ theta, delta, gamma, iv, ret });
  }

  // Outliers
  for (let i = 0; i < 30; i++) {
    const sign = rand() > 0.5 ? 1 : -1;
    pts.push({
      theta: -(rand() * 0.06 + 0.001),
      delta: sign * (0.2 + rand() * 0.8),
      gamma: rand() * 0.02,
      iv:    0.3 + rand() * 0.5,
      ret:   rand() > 0.5 ? rand() * 6 + 1 : -(rand() * 3 + 0.5),
    });
  }
  return pts;
}

const GREEKS_PTS  = buildGreeksPoints();
const THETA_MAX   = 0.065;
const GAMMA_MAX   = 0.065;
const DELTA_MAX   = 1.0;

export function GreeksScatter3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef({
    yaw: 0.35, pitch: 0.18,
    autoSpin: true, dragging: false,
    lastX: 0, lastY: 0, dragDelta: 0,
    frame: 0,
  });
  const [, setSpinning] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const st  = stateRef.current;

    const PERSP_DIST = 3.2;

    const norm = GREEKS_PTS.map(d => ({
      x: d.theta / THETA_MAX,
      y: d.delta / DELTA_MAX,
      z: -(d.gamma / GAMMA_MAX),
      ret: d.ret,
    }));

    const project3D = (x0: number, y0: number, z0: number, yaw: number, pitch: number) => {
      const x1 = x0 * Math.cos(yaw) - z0 * Math.sin(yaw);
      const z1 = x0 * Math.sin(yaw) + z0 * Math.cos(yaw);
      const y2 = y0 * Math.cos(pitch) - z1 * Math.sin(pitch);
      const z2 = y0 * Math.sin(pitch) + z1 * Math.cos(pitch);
      const w  = PERSP_DIST + z2;
      if (w < 0.05) return null;
      const s = PERSP_DIST / w;
      return { sx: x1 * s, sy: -y2 * s, depth: w };
    };

    const drawAxis = (
      cx: number, cy: number, scale: number,
      from3: [number,number,number], to3: [number,number,number],
      color: string, label: string,
      ticks: Array<{ t: number; label: string }>
    ) => {
      const p1 = project3D(...from3, st.yaw, st.pitch);
      const p2 = project3D(...to3,   st.yaw, st.pitch);
      if (!p1 || !p2) return;
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(cx + p1.sx * scale, cy + p1.sy * scale);
      ctx.lineTo(cx + p2.sx * scale, cy + p2.sy * scale);
      ctx.stroke();
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.globalAlpha = 0.55;
      for (const { t, label: tl } of ticks) {
        const tp: [number,number,number] = [
          from3[0] + (to3[0] - from3[0]) * t,
          from3[1] + (to3[1] - from3[1]) * t,
          from3[2] + (to3[2] - from3[2]) * t,
        ];
        const pp = project3D(...tp, st.yaw, st.pitch);
        if (!pp) continue;
        const px = cx + pp.sx * scale, py = cy + pp.sy * scale;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(tl, px + 4, py - 4);
      }
      if (label) {
        ctx.globalAlpha = 0.85;
        ctx.font = "bold 12px 'JetBrains Mono', monospace";
        ctx.fillStyle = color;
        const lp = project3D(...to3, st.yaw, st.pitch);
        if (lp) ctx.fillText(label, cx + lp.sx * scale + 7, cy + lp.sy * scale + 4);
      }
      ctx.restore();
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (st.autoSpin && !st.dragging) st.yaw += 0.003;

      const cx    = W * 0.48;
      const cy    = H * 0.50;
      const scale = Math.min(W, H) * 0.38;

      drawAxis(cx, cy, scale, [-1.5,0,0], [1.5,0,0],
        "rgba(210,70,50,0.80)", "θ",
        [{ t:0.15,label:"-0.060" },{ t:0.28,label:"-0.040" },{ t:0.41,label:"-0.020" },{ t:0.50,label:"0.0" },{ t:0.73,label:"0.040" }]);

      drawAxis(cx, cy, scale, [0,0,0.4], [0,0,-1.5],
        "rgba(50,130,240,0.80)", "Γ",
        [{ t:0.33,label:"0.020" },{ t:0.56,label:"0.040" },{ t:0.80,label:"0.060" }]);

      drawAxis(cx, cy, scale, [0,-1.5,0], [0,1.5,0],
        "rgba(50,200,120,0.70)", "Δ",
        [{ t:0.13,label:"-1.0" },{ t:0.34,label:"-0.5" },{ t:0.66,label:"+0.5" },{ t:0.87,label:"+1.0" }]);

      const projected = norm.map(d => {
        const p = project3D(d.x, d.y, d.z, st.yaw, st.pitch);
        if (!p) return null;
        const absRet = Math.abs(d.ret);
        const r      = 1.2 + Math.sqrt(Math.min(absRet, 8) / 8) * 6.5;
        const color  = d.ret >= 0 ? "#6DFFC4" : "#F3A0F4";
        const alpha  = 0.30 + Math.min(0.45, absRet * 0.06);
        return { ...p, r, color, alpha };
      }).filter(Boolean).sort((a, b) => b!.depth - a!.depth) as Array<{sx:number;sy:number;depth:number;r:number;color:string;alpha:number}>;

      for (const pt of projected) {
        const px = cx + pt.sx * scale, py = cy + pt.sy * scale;
        if (pt.r > 3.5) {
          const grd = ctx.createRadialGradient(px, py, 0, px, py, pt.r * 2.2);
          grd.addColorStop(0, pt.color + "55");
          grd.addColorStop(1, pt.color + "00");
          ctx.beginPath(); ctx.arc(px, py, pt.r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = grd; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(px, py, pt.r, 0, Math.PI * 2);
        ctx.fillStyle = pt.color + Math.round(pt.alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();
      }

      // Legend
      ctx.globalAlpha = 0.65;
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#6DFFC4"; ctx.fillText("● Return ≥ 0 (gain)", W - 152, H - 36);
      ctx.fillStyle = "#F3A0F4"; ctx.fillText("● Return < 0 (loss)", W - 152, H - 20);

      ctx.globalAlpha = 0.38;
      ctx.fillStyle = "#00d4ff";
      ctx.fillText(st.autoSpin ? "⟳ AUTO · click to drag" : "drag to rotate · click to resume", 14, H - 14);
      ctx.globalAlpha = 1;

      st.frame = requestAnimationFrame(draw);
    };

    const resize = () => {
      const el = canvas.parentElement;
      if (!el) return;
      canvas.width  = el.clientWidth;
      canvas.height = el.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    draw();

    // Interaction
    const onDown = (e: MouseEvent | TouchEvent) => {
      st.dragging  = true;
      st.dragDelta = 0;
      const { clientX, clientY } = "touches" in e ? e.touches[0] : e;
      st.lastX = clientX; st.lastY = clientY;
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!st.dragging) return;
      const { clientX, clientY } = "touches" in e ? e.touches[0] : e;
      const dx = clientX - st.lastX, dy = clientY - st.lastY;
      st.dragDelta += Math.abs(dx) + Math.abs(dy);
      st.yaw   += dx * 0.008;
      st.pitch += dy * 0.005;
      st.pitch  = Math.max(-0.6, Math.min(0.6, st.pitch));
      st.lastX = clientX; st.lastY = clientY;
    };
    const onUp = () => {
      if (st.dragDelta < 4) {
        st.autoSpin = !st.autoSpin;
        setSpinning(s => !s);
      }
      st.dragging = false;
      canvas.style.cursor = "default";
    };
    const onLeave = () => { if (st.dragging) { st.dragging = false; canvas.style.cursor = "default"; } };

    canvas.addEventListener("mousedown", onDown as EventListener);
    window.addEventListener("mousemove", onMove as EventListener);
    window.addEventListener("mouseup",   onUp);
    window.addEventListener("blur",      onLeave);
    document.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("touchstart", onDown as EventListener, { passive: true });
    window.addEventListener("touchmove",  onMove as EventListener, { passive: true });
    window.addEventListener("touchend",   onUp);

    return () => {
      cancelAnimationFrame(st.frame);
      window.removeEventListener("resize",      resize);
      canvas.removeEventListener("mousedown",   onDown as EventListener);
      window.removeEventListener("mousemove",   onMove as EventListener);
      window.removeEventListener("mouseup",     onUp);
      window.removeEventListener("blur",        onLeave);
      document.removeEventListener("mouseleave",onLeave);
      canvas.removeEventListener("touchstart",  onDown as EventListener);
      window.removeEventListener("touchmove",   onMove as EventListener);
      window.removeEventListener("touchend",    onUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute", inset: 0, zIndex: 1,
        cursor: "default",
        opacity: 0.90,
        mixBlendMode: "screen",
      }}
    />
  );
}
