// Original starter skins drawn in code (no Mojang assets).
import { blank, setPx, faces, parts, normalizeSkin, OVERLAYS } from './skinmap.mjs';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const shade = (c, k) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), 255];

function paintBox(img, box, color, front) {
  const f = faces(box);
  const k = { top: 1.05, bottom: 0.7, right: 0.88, left: 0.88, back: 0.82, front: 1 };
  for (const [name, [x0, y0, w, h]] of Object.entries(f)) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const base = typeof color === 'function' ? color(name, x, y, w, h) : color;
      const c = name === 'front' && front ? (front(x, y, w, h) || base) : base;
      setPx(img, x0 + x, y0 + y, shade(c, Math.min(1, k[name] * (1 - ((x + y) % 5 === 0 ? 0.04 : 0)))));
    }
  }
}

const PRESETS = {
  astronaut: { name: 'Astronaut', variant: 'classic', skin: '#e0b48f', hair: '#3b2a1e', eyes: '#2f6fd6', shirt: '#eef2fb', trim: '#7aa8ff', pants: '#d8deea', boots: '#59607a', visor: '#7ad8ff' },
  explorer: { name: 'Explorer', variant: 'classic', skin: '#c68a62', hair: '#1f1a17', eyes: '#3b2a1e', shirt: '#5b8f5a', trim: '#e2c37a', pants: '#6b5136', boots: '#3a2a1c' },
  ranger: { name: 'Ranger', variant: 'slim', skin: '#f1c8a6', hair: '#b4572b', eyes: '#3f8a4b', shirt: '#2f4f73', trim: '#ffb36b', pants: '#2a2f45', boots: '#4a3424' },
  nova: { name: 'Nova', variant: 'slim', skin: '#8d5a3e', hair: '#f3e7ff', eyes: '#b28dff', shirt: '#4a3a9a', trim: '#ffd29b', pants: '#1c1a4f', boots: '#b28dff' },
};

export function starterSkin(id) {
  const p = PRESETS[id];
  const P = parts(p.variant);
  const img = blank();
  const C = Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'string' && v.startsWith('#')).map(([k, v]) => [k, hex(v)]));
  paintBox(img, P.head, (face, x, y) => (face === 'top' || (face !== 'bottom' && y < (face === 'back' ? 6 : 2)) ? C.hair : C.skin), (x, y) => {
    if (y < 2) return C.hair;
    if (y === 2 && (x === 0 || x === 7)) return C.hair;
    if (y === 4 && (x === 1 || x === 6)) return [255, 255, 255, 255];
    if (y === 4 && (x === 2 || x === 5)) return C.eyes;
    if (y === 6 && x >= 3 && x <= 4) return shade(C.skin, 0.75);
    return null;
  });
  paintBox(img, P.body, C.shirt, (x, y) => (y === 0 || x === 3 || x === 4 ? C.trim : y === 11 ? shade(C.pants, 0.8) : null));
  const arm = (face, x, y) => (y >= 9 ? C.skin : C.shirt);
  paintBox(img, P.rightArm, arm, (x, y) => (y === 8 ? C.trim : null));
  paintBox(img, P.leftArm, arm, (x, y) => (y === 8 ? C.trim : null));
  const leg = (face, x, y) => (y >= 9 ? C.boots : C.pants);
  paintBox(img, P.rightLeg, leg);
  paintBox(img, P.leftLeg, leg);
  if (C.visor) {
    // Helmet visor on the hat layer.
    const f = faces(OVERLAYS.head).front;
    for (let y = 3; y < 6; y++) for (let x = 1; x < 7; x++) setPx(img, f[0] + x, f[1] + y, y === 3 ? [255, 255, 255, 255] : C.visor);
  }
  return { ...p, id, image: normalizeSkin(img, { variant: p.variant }) };
}

export const STARTERS = Object.keys(PRESETS);
