// Saturn title panorama: renders the six cube faces (panorama_0..5) of a
// stylized deep-space sky — nebula, stars, and Saturn with its rings — by
// casting a ray per pixel. Deterministic, no dependencies, so the PNGs are
// generated at build time instead of being kept in git.
// Usage: node scripts/make-panorama.js <outDir> [size]
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = Number(process.argv[3] || 1024);

// ---------- small vector helpers ----------
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---------- hash + value noise (3D) ----------
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), u), x10 = mix(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = mix(c(0, 0, 1), c(1, 0, 1), u), x11 = mix(c(0, 1, 1), c(1, 1, 1), u);
  return mix(mix(x00, x10, v), mix(x01, x11, v), w);
}
function fbm(p, oct = 5) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(p[0] * f, p[1] * f, p[2] * f); f *= 2.03; a *= 0.5; }
  return s;
}

// ---------- scene ----------
const SUN = norm([-0.55, 0.45, -0.25]);
const PLANET_DIR = norm([0.42, 0.16, 1]);
const PLANET_DIST = 10;
const PLANET_R = PLANET_DIST * Math.sin((20 * Math.PI) / 180);
const P = scale(PLANET_DIR, PLANET_DIST);
// Ring plane normal: tilted toward the viewer so the rings read as an open ellipse.
const RING_N = norm([0.18, 1, -0.32]);
const RING_IN = PLANET_R * 1.28, RING_OUT = PLANET_R * 2.35;
const POLE = RING_N;
const MOON_DIR = norm([-0.8, 0.22, 0.55]);
const MOON_R = Math.sin((2.2 * Math.PI) / 180);

function stars(d) {
  // Jittered points on a 3D grid around the unit sphere: continuous across faces.
  let out = 0;
  const layers = [[220, 0.06, 1.0], [90, 0.035, 1.6]];
  for (const [k, prob, bright] of layers) {
    const q = scale(d, k);
    const xi = Math.floor(q[0]), yi = Math.floor(q[1]), zi = Math.floor(q[2]);
    for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = 0; dz <= 1; dz++) {
      const cx = xi + dx - (q[0] - xi < 0.5 ? 1 : 0), cy = yi + dy - (q[1] - yi < 0.5 ? 1 : 0), cz = zi + dz - (q[2] - zi < 0.5 ? 1 : 0);
      if (hash3(cx, cy, cz) > prob) continue;
      const sx = cx + hash3(cx + 7, cy, cz), sy = cy + hash3(cx, cy + 7, cz), sz = cz + hash3(cx, cy, cz + 7);
      const dist = Math.hypot(q[0] - sx, q[1] - sy, q[2] - sz);
      const mag = hash3(cx + 3, cy + 5, cz + 11);
      out += bright * (0.35 + mag * mag * 1.6) * Math.exp(-dist * dist * (k > 100 ? 90 : 40));
    }
  }
  return out;
}

function background(d) {
  // Deep navy → violet gradient, a soft glow band (the galaxy) and a nebula.
  const up = d[1];
  let col = mix3([0.02, 0.025, 0.07], [0.06, 0.035, 0.14], smooth(-1, 0.6, up));
  const band = Math.exp(-Math.pow(dot(d, norm([0.3, 0.85, -0.4])) / 0.28, 2));
  const n = fbm(scale(d, 2.6));
  const n2 = fbm(scale(d, 5.5).map((v, i) => v + 31.7 * (i + 1)));
  const neb = smooth(0.42, 0.78, n) * (0.35 + 0.65 * band);
  col = mix3(col, [0.28, 0.16, 0.48], neb * 0.55);
  col = mix3(col, [0.16, 0.38, 0.62], smooth(0.5, 0.85, n2) * band * 0.45);
  col = mix3(col, [0.62, 0.32, 0.55], smooth(0.62, 0.9, n * n2 * 1.6) * 0.35);
  // Sun glare.
  const s = Math.max(0, dot(d, SUN));
  col = col.map((c, i) => c + [1.0, 0.86, 0.7][i] * (Math.pow(s, 600) * 3 + Math.pow(s, 40) * 0.12));
  const st = stars(d) * (1 - neb * 0.4);
  return col.map((c, i) => c + st * [0.92, 0.95, 1.0][i]);
}

function planetColor(hit) {
  const nrm = norm(sub(hit, P));
  const lat = dot(nrm, POLE);
  const turb = fbm([lat * 18, nrm[0] * 2, nrm[2] * 2], 3);
  const bands = 0.5 + 0.5 * Math.sin(lat * 26 + turb * 3.5);
  let base = mix3([0.86, 0.72, 0.52], [0.98, 0.9, 0.74], bands);
  base = mix3(base, [0.7, 0.58, 0.48], smooth(0.6, 0.95, Math.abs(lat)) * 0.5);
  const lambert = Math.max(0, dot(nrm, SUN));
  // Ring shadow on the planet: march toward the sun and see if we cross the ring plane inside the rings.
  let shadow = 1;
  const denom = dot(SUN, RING_N);
  if (Math.abs(denom) > 1e-4) {
    const t = dot(sub(P, hit), RING_N) / denom;
    if (t > 0) {
      const q = sub([hit[0] + SUN[0] * t, hit[1] + SUN[1] * t, hit[2] + SUN[2] * t], P);
      const r = Math.hypot(q[0], q[1], q[2]);
      if (r > RING_IN && r < RING_OUT) shadow = 1 - 0.55 * ringDensity(r);
    }
  }
  const lit = 0.06 + 1.05 * lambert * shadow;
  const rim = Math.pow(1 - Math.max(0, -dot(nrm, norm(hit))), 3) * 0.25;
  return base.map((c, i) => c * lit + rim * [0.5, 0.6, 1][i]);
}

function ringDensity(r) {
  const t = (r - RING_IN) / (RING_OUT - RING_IN);
  let d = 0.55 + 0.45 * Math.sin(t * 60) * 0.3 + 0.3 * Math.sin(t * 17 + 1.3);
  if (t > 0.58 && t < 0.63) d *= 0.08; // Cassini division
  d *= smooth(0, 0.05, t) * (1 - smooth(0.93, 1, t));
  return clamp(d);
}

function shade(d) {
  // Ray–sphere (planet).
  const b = dot(d, P);
  const c = dot(P, P) - PLANET_R * PLANET_R;
  const disc = b * b - c;
  const tNear = disc > 0 ? b - Math.sqrt(disc) : -1;
  const tPlanet = tNear > 0 ? tNear : Infinity;
  // Ray–ring plane.
  const denom = dot(d, RING_N);
  let tRing = Infinity, ringA = 0, ringCol = null;
  if (Math.abs(denom) > 1e-5) {
    const t = dot(P, RING_N) / denom;
    if (t > 0) {
      const q = sub(scale(d, t), P);
      const r = Math.hypot(q[0], q[1], q[2]);
      if (r > RING_IN && r < RING_OUT) {
        tRing = t;
        const dens = ringDensity(r);
        ringA = dens * 0.85;
        const tt = (r - RING_IN) / (RING_OUT - RING_IN);
        ringCol = mix3([0.85, 0.78, 0.66], [0.72, 0.8, 0.98], tt);
        // Planet shadow on the rings (behind the planet, away from the sun).
        const hit = scale(d, t);
        const toSun = SUN;
        const bb = dot(toSun, sub(P, hit));
        const cc = dot(sub(P, hit), sub(P, hit)) - PLANET_R * PLANET_R;
        const shadowed = bb > 0 && bb * bb - cc > 0;
        const lightAmt = shadowed ? 0.18 : 0.95;
        ringCol = ringCol.map((x) => x * lightAmt);
      }
    }
  }
  let col;
  if (tPlanet < Infinity) {
    col = planetColor(scale(d, tPlanet));
  } else {
    col = background(d);
    // Thin atmosphere halo around the limb.
    const ang = Math.acos(clamp(dot(d, PLANET_DIR), -1, 1));
    const edge = ang - Math.asin(PLANET_R / PLANET_DIST);
    if (edge > 0) col = col.map((x, i) => x + [0.35, 0.45, 0.9][i] * Math.exp(-edge * 90) * 0.35);
  }
  if (tRing < tPlanet) col = mix3(col, ringCol, ringA);
  // Small icy moon.
  const m = dot(d, MOON_DIR);
  const mc = Math.cos(MOON_R);
  if (m > mc) {
    const k = Math.sqrt(clamp((m - mc) / (1 - mc)));
    col = mix3(col, [0.75, 0.82, 0.95].map((x) => x * (0.35 + 0.65 * clamp(k + 0.2 * dot(SUN, d)))), smooth(0, 0.08, k));
  }
  return col;
}

// Face directions in the order Minecraft's CubeMap loads panorama_0..5.
const FACES = [
  (u, v) => [u, -v, 1],
  (u, v) => [1, -v, -u],
  (u, v) => [-u, -v, -1],
  (u, v) => [-1, -v, u],
  (u, v) => [u, 1, v],
  (u, v) => [u, -1, -v],
];

function tonemap(x) {
  const y = 1 - Math.exp(-x * 1.25);
  return Math.round(clamp(Math.pow(y, 1 / 1.05)) * 255);
}

// ---------- PNG ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function render(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (let f = 0; f < 6; f++) {
    const rgb = Buffer.alloc(SIZE * SIZE * 3);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // 2x2 supersampling keeps the stars and ring edges smooth.
        let r = 0, g = 0, b = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const u = ((x + ox) / SIZE) * 2 - 1, v = ((y + oy) / SIZE) * 2 - 1;
          const c = shade(norm(FACES[f](u, v)));
          r += c[0]; g += c[1]; b += c[2];
        }
        const i = (y * SIZE + x) * 3;
        rgb[i] = tonemap(r / 4); rgb[i + 1] = tonemap(g / 4); rgb[i + 2] = tonemap(b / 4);
      }
    }
    fs.writeFileSync(path.join(outDir, `panorama_${f}.png`), png(SIZE, SIZE, rgb));
  }
}

if (require.main === module) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node scripts/make-panorama.js <outDir> [size]'); process.exit(1); }
  console.time('panorama');
  render(out);
  console.timeEnd('panorama');
}
module.exports = { render, FACES };
