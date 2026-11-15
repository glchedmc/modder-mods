import { useEffect, useRef } from 'react';
import { SkinViewer as Viewer, IdleAnimation, WalkingAnimation, RunningAnimation, FlyingAnimation } from 'skinview3d';
import * as THREE from 'three';

const ANIMS = { idle: IdleAnimation, walk: WalkingAnimation, run: RunningAnimation, fly: FlyingAnimation };

// Launcher-only 3D cosmetics (hats and wings) built from simple glassy meshes.
function glassMat(color, opacity = 0.85, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.25, metalness: 0.15, emissive: color, emissiveIntensity: emissive });
}
function buildHat(id) {
  const g = new THREE.Group();
  if (id === 'halo') {
    const m = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.55, 12, 48), glassMat(0xffe7a8, 0.95, 0.9));
    m.rotation.x = Math.PI / 2; m.position.y = 11; g.add(m);
  } else if (id === 'crown') {
    const gold = glassMat(0xffcf5a, 1, 0.15);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 1.6, 8, 1, true), gold); band.position.y = 8.6; g.add(band);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 4), gold); s.position.set(Math.cos(a) * 4.5, 10.4, Math.sin(a) * 4.5); g.add(s);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), glassMat(i % 2 ? 0x7ad8ff : 0xff8fb1, 0.95, 0.4)); gem.position.set(Math.cos(a) * 4.75, 8.6, Math.sin(a) * 4.75); g.add(gem);
    }
  } else if (id === 'top-hat') {
    const dark = glassMat(0x1c1a2e, 1);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.6, 32), dark); brim.position.y = 8.3; g.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.9, 6, 32), dark); top.position.y = 11.6; g.add(top);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.95, 3.95, 1, 32), glassMat(0xb28dff, 1, 0.3)); band.position.y = 9.2; g.add(band);
  } else if (id === 'ring') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.35, 10, 64), glassMat(0xbfe9ff, 0.8, 0.6));
    ring.rotation.x = Math.PI / 2.3; ring.position.y = 5; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.18, 8, 64), glassMat(0xc7b6ff, 0.6, 0.5));
    ring2.rotation.x = Math.PI / 2.3; ring2.position.y = 5; g.add(ring2);
  }
  return g;
}
function buildWings(id) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.bezierCurveTo(4, 6, 12, 10, 16, 8); shape.bezierCurveTo(12, 4, 13, -2, 10, -8); shape.bezierCurveTo(7, -6, 3, -6, 0, -2);
  const mat = id === 'dragon-wings' ? glassMat(0x5a2a6a, 0.92, 0.1) : glassMat(0xbfe9ff, 0.55, 0.35);
  mat.side = THREE.DoubleSide;
  const geo = new THREE.ShapeGeometry(shape, 16);
  for (const side of [1, -1]) {
    const w = new THREE.Mesh(geo, mat);
    w.scale.set(side * 0.9, 0.9, 0.9);
    w.position.set(side * 1, 2, -2.6);
    w.rotation.y = side * -0.5;
    w.userData.side = side;
    g.add(w);
  }
  return g;
}

/** 3D skin preview with optional cape and launcher-only cosmetics. */
export default function SkinViewer({ skin, variant = 'classic', cape = null, elytra = false, hat = null, wings = null, animation = 'idle', width = 320, height = 440, rotate = true, zoom = 0.85 }) {
  const ref = useRef(null);
  const viewer = useRef(null);
  const extras = useRef({});

  useEffect(() => {
    const v = new Viewer({ canvas: ref.current, width, height, preserveDrawingBuffer: true, zoom, fov: 40 });
    v.background = null;
    v.autoRotate = rotate;
    v.autoRotateSpeed = 0.6;
    v.globalLight.intensity = 3;
    v.cameraLight.intensity = 0.8;
    v.playerObject.rotation.y = 0.5;
    viewer.current = v;
    let t = 0;
    const tick = () => {
      if (v.disposed) return;
      t += 0.04;
      const w = extras.current.wings;
      if (w) w.children.forEach((m) => { m.rotation.y = m.userData.side * (-0.5 - Math.sin(t) * 0.18); });
      requestAnimationFrame(tick);
    };
    tick();
    return () => v.dispose();
  }, []);

  useEffect(() => { if (viewer.current) { viewer.current.width = width; viewer.current.height = height; } }, [width, height]);
  useEffect(() => { if (viewer.current) viewer.current.autoRotate = rotate; }, [rotate]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (skin) v.loadSkin(skin, { model: variant === 'slim' ? 'slim' : 'default' }).catch(() => {});
    else v.loadSkin(null);
  }, [skin, variant]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (cape) v.loadCape(cape, { backEquipment: elytra ? 'elytra' : 'cape' }).catch(() => {});
    else v.loadCape(null);
  }, [cape, elytra]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const A = ANIMS[animation];
    v.animation = A ? new A() : null;
    if (v.animation && animation !== 'idle') v.animation.speed = animation === 'run' ? 0.8 : 0.7;
  }, [animation]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const head = v.playerObject.skin.head;
    if (extras.current.hat) head.remove(extras.current.hat);
    extras.current.hat = null;
    if (hat) { extras.current.hat = buildHat(hat); head.add(extras.current.hat); }
  }, [hat]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const body = v.playerObject.skin.body;
    if (extras.current.wings) body.remove(extras.current.wings);
    extras.current.wings = null;
    if (wings) { extras.current.wings = buildWings(wings); body.add(extras.current.wings); }
  }, [wings]);

  return <canvas ref={ref} className="skin-canvas" style={{ width, height }} />;
}
