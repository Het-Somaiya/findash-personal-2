import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Surface3D() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth;
    const H = el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 0, 0);

    const SEGS = 60;
    const geo = new THREE.PlaneGeometry(16, 12, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i <= SEGS; i++) {
      for (let j = 0; j <= SEGS; j++) {
        const idx = i * (SEGS + 1) + j;
        const x = posAttr.getX(idx);
        const z = posAttr.getZ(idx);
        const nx = x / 8;
        const nz = z / 6;

        const c1 = Math.exp(-((nx - 0.3) ** 2 + (nz + 0.2) ** 2) * 4) * 2.2;
        const c2 = Math.exp(-((nx - 0.6) ** 2 + (nz - 0.3) ** 2) * 6) * 1.4;
        const p1 = -Math.exp(-((nx + 0.4) ** 2 + (nz - 0.1) ** 2) * 5) * 1.8;
        const p2 = -Math.exp(-((nx + 0.1) ** 2 + (nz + 0.4) ** 2) * 7) * 1.2;
        const wave = Math.sin(nx * 3.2) * Math.cos(nz * 2.8) * 0.3;
        const y = c1 + c2 + p1 + p2 + wave;

        posAttr.setY(idx, y);

        const t = (y + 2) / 4;
        if (y > 0) {
          color.setHSL(0.52 + t * 0.08, 0.9, 0.45 + t * 0.2);
        } else {
          color.setHSL(0.62 + Math.abs(t) * 0.05, 0.7, 0.35 + Math.abs(t) * 0.15);
        }
        colors.push(color.r, color.g, color.b);
      }
    }

    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 60,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.05,
    });
    scene.add(new THREE.Mesh(geo, wireMat));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const d1 = new THREE.DirectionalLight(0x88ddff, 1.2);
    d1.position.set(5, 10, 5);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffa0c0, 0.6);
    d2.position.set(-5, 3, -5);
    scene.add(d2);

    // Grid
    const grid = new THREE.GridHelper(20, 30, 0x1a3a5c, 0x0d2035);
    grid.position.y = -2.2;
    scene.add(grid);

    let frame;
    let t = 0;

    const animate = () => {
      frame = requestAnimationFrame(animate);
      t += 0.003;
      mesh.rotation.y = Math.sin(t * 0.4) * 0.15;
      camera.position.x = Math.sin(t * 0.3) * 1.5;
      camera.position.y = 5.5 + Math.sin(t * 0.5) * 0.5;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const W2 = el.clientWidth;
      const H2 = el.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) {
        el.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
    />
  );
}
