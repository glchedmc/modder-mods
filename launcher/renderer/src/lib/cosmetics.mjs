// Saturn cosmetics catalog. Capes are drawn procedurally into the standard
// 64x32 cape texture (cape + elytra areas) so the companion mod can show them in game.
import { blank, setPx } from './skinmap.mjs';

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], Math.max(0, Math.min(1, t))))).concat(255);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967295; };

// Pattern functions get (u, v) in [0,1] over the visible back of the cape and return RGBA.
const PATTERNS = {
  saturn(u, v) {
    let c = mix(hex('#1c1a4f'), hex('#4a3a9a'), v);
    const dx = (u - 0.5) * 1.6; const dy = (v - 0.42) * 1.0;
    const r = Math.hypot(dx, dy);
    if (r < 0.22) c = mix(hex('#ffe3b8'), hex('#e6a86c'), (dy + 0.22) / 0.44);
    const ring = Math.abs(dy + dx * 0.25) < 0.03 && Math.abs(dx) < 0.48 && !(r < 0.22 && dy + dx * 0.25 < 0);
    if (ring) c = mix(hex('#bfe9ff'), hex('#ffffff'), 0.4);
    if (hash(Math.floor(u * 10), Math.floor(v * 16)) > 0.93) c = [255, 255, 255, 255];
    return c;
  },
  aurora(u, v) {
    const base = mix(hex('#0b1438'), hex('#16204f'), v);
    const w = Math.sin(u * 6.3 + v * 3) * 0.08;
    const band = Math.exp(-((v - 0.35 - w) ** 2) / 0.01);
    const band2 = Math.exp(-((v - 0.6 + w) ** 2) / 0.006);
    return mix(mix(base, hex('#5be4b0'), band * 0.9), hex('#b28dff'), band2 * 0.85);
  },
  crystal(u, v) {
    const c = mix(hex('#e4ecff'), hex('#a8a0ec'), v);
    const facet = (Math.floor(u * 4 + v * 3) + Math.floor(u * 3 - v * 4)) % 3;
    return mix(c, facet === 0 ? hex('#ffffff') : facet === 1 ? hex('#8fd0ff') : hex('#c9a8e0'), 0.35);
  },
  midnight(u, v) {
    let c = mix(hex('#070b22'), hex('#1b1e52'), v);
    if (hash(Math.floor(u * 10), Math.floor(v * 16) + 7) > 0.88) c = mix(hex('#ffffff'), hex('#9ad4ff'), hash(u * 99, v * 7));
    return c;
  },
  sunset(u, v) {
    const stripes = [hex('#ffd29b'), hex('#ffb36b'), hex('#ff8fb1'), hex('#b28dff'), hex('#6f7ff5')];
    const i = Math.min(stripes.length - 1, Math.floor(v * stripes.length));
    return mix(stripes[i], stripes[Math.min(stripes.length - 1, i + 1)], (v * stripes.length - i) * 0.4);
  },
  frost(u, v) {
    const c = mix(hex('#f4f8ff'), hex('#bcd6ff'), v);
    return (Math.floor((u + v) * 12) % 3 === 0) ? mix(c, hex('#ffffff'), 0.7) : c;
  },
};

export const CAPES = [
  { id: 'saturn', name: 'Saturn', pattern: 'saturn', accent: '#e6a86c' },
  { id: 'aurora', name: 'Aurora', pattern: 'aurora', accent: '#5be4b0' },
  { id: 'crystal', name: 'Crystal', pattern: 'crystal', accent: '#a8a0ec' },
  { id: 'midnight', name: 'Midnight', pattern: 'midnight', accent: '#1b1e52' },
  { id: 'sunset', name: 'Sunset', pattern: 'sunset', accent: '#ff8fb1' },
  { id: 'frost', name: 'Frost', pattern: 'frost', accent: '#bcd6ff' },
];
export const HATS = [
  { id: 'halo', name: 'Halo' },
  { id: 'crown', name: 'Crown' },
  { id: 'top-hat', name: 'Top hat' },
  { id: 'ring', name: 'Saturn ring' },
];
export const WINGS = [
  { id: 'glass-wings', name: 'Glass wings' },
  { id: 'dragon-wings', name: 'Dragon wings' },
];

/** 64x32 RGBA cape texture for a built-in design. */
export function capeTexture(id) {
  const def = CAPES.find((c) => c.id === id);
  if (!def) throw new Error(`Unknown cape ${id}`);
  const fn = PATTERNS[def.pattern];
  const img = blank(64, 32);
  const edge = mix(fn(0.5, 0.5), [0, 0, 0], 0.25);
  // Cape box: u0=0, v0=0, w=10, h=16, d=1.
  const paint = (x0, y0, w, h, flip = false) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (flip ? w - 1 - x : x) / (w - 1 || 1); const v = y / (h - 1 || 1);
      setPx(img, x0 + x, y0 + y, fn(u, v));
    }
  };
  paint(1, 1, 10, 16); // outside (what others see)
  for (let y = 1; y < 17; y++) for (let x = 12; x < 22; x++) setPx(img, x, y, mix(fn((x - 12) / 9, (y - 1) / 15), [0, 0, 0], 0.35)); // inside
  for (let x = 1; x < 11; x++) { setPx(img, x, 0, edge); setPx(img, x + 10, 0, edge); }
  for (let y = 1; y < 17; y++) { setPx(img, 0, y, edge); setPx(img, 11, y, edge); }
  // Elytra area (22..45 x 0..21): reuse the pattern.
  paint(22, 0, 24, 22);
  return img;
}

export const ALL = { cape: CAPES, hat: HATS, wings: WINGS };
