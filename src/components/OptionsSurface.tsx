import { useEffect, useRef } from "react";
import * as THREE from "three";

export function OptionsSurface() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth || window.innerWidth;
    const H = el.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x030d1a, 28, 60);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 0, 0);

    // Options surface geometry — Gaussian gamma/put concentration peaks
    const SEGS = 60;
    const geo = new THREE.PlaneGeometry(16, 12, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colorArr: number[] = [];
    const color = new THREE.Color();

    for (let i = 0; i <= SEGS; i++) {
      for (let j = 0; j <= SEGS; j++) {
        const idx = i * (SEGS + 1) + j;
        const x  = posAttr.getX(idx);
        const z  = posAttr.getZ(idx);
        const nx = x / 8;
        const nz = z / 6;

        // Positive GEX / gamma concentration peaks
        const c1   = Math.exp(-((nx - 0.3) ** 2 + (nz + 0.2) ** 2) * 4) * 2.2;
        const c2   = Math.exp(-((nx - 0.6) ** 2 + (nz - 0.3) ** 2) * 6) * 1.4;
        // Negative GEX / put dominance valleys
        const p1   = -Math.exp(-((nx + 0.4) ** 2 + (nz - 0.1) ** 2) * 5) * 1.8;
        const p2   = -Math.exp(-((nx + 0.1) ** 2 + (nz + 0.4) ** 2) * 7) * 1.2;
        // Volatility wave structure
        const wave = Math.sin(nx * 3.2) * Math.cos(nz * 2.8) * 0.3;
        const y    = c1 + c2 + p1 + p2 + wave;

        posAttr.setY(idx, y);

        // Color: peaks = bright cyan/teal, valleys = deep indigo-blue
        const t = (y + 2) / 4;
        if (y > 0) {
          color.setHSL(0.52 + t * 0.08, 0.9, 0.45 + t * 0.2);
        } else {
          color.setHSL(0.62 + Math.abs(t) * 0.05, 0.7, 0.35 + Math.abs(t) * 0.15);
        }
        colorArr.push(color.r, color.g, color.b);
      }
    }

    geo.setAttribute("color", new THREE.Float32BufferAttribute(colorArr, 3));
    geo.computeVertexNormals();

    // Surface mesh
    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 60,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Cyan wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    });
    const wire = new THREE.Mesh(geo, wireMat);
    scene.add(wire);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const d1 = new THREE.DirectionalLight(0x88ddff, 1.2);
    d1.position.set(5, 10, 5);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffa0c0, 0.6);
    d2.position.set(-5, 3, -5);
    scene.add(d2);

    // Floor grid
    const grid = new THREE.GridHelper(20, 30, 0x1a3a5c, 0x0d2035);
    grid.position.y = -2.2;
    scene.add(grid);

    let frameId: number;
    let t = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      t += 0.003;
      mesh.rotation.y = Math.sin(t * 0.4) * 0.15;
      wire.rotation.y = mesh.rotation.y;
      camera.position.x = Math.sin(t * 0.3) * 1.5;
      camera.position.y = 5.5 + Math.sin(t * 0.5) * 0.5;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nW = el.clientWidth;
      const nH = el.clientHeight;
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
      renderer.setSize(nW, nH);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    />
  );
}
