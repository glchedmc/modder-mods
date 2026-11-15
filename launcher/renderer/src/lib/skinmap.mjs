// Pure skin-texture helpers (no DOM), shared by the renderer and the unit tests.
// Images are {width, height, data: Uint8ClampedArray RGBA}.

export const W = 64;
export const H = 64;

// Box parts: [u, v, w, h, d] for the base layer (64x64 layout), armW is the arm width.
export function parts(variant = 'classic') {
  const aw = variant === 'slim' ? 3 : 4;
  return {
    head: [0, 0, 8, 8, 8],
    body: [16, 16, 8, 12, 4],
    rightArm: [40, 16, aw, 12, 4],
    leftArm: [32, 48, aw, 12, 4],
    rightLeg: [0, 16, 4, 12, 4],
    leftLeg: [16, 48, 4, 12, 4],
  };
}
export const OVERLAYS = {
  head: [32, 0, 8, 8, 8], body: [16, 32, 8, 12, 4], rightArm: [40, 32, 4, 12, 4],
  leftArm: [48, 48, 4, 12, 4], rightLeg: [0, 32, 4, 12, 4], leftLeg: [0, 48, 4, 12, 4],
};

/** Face rectangles of a box: {top, bottom, right, front, left, back} as [x, y, w, h]. */
export function faces([u, v, w, h, d]) {
  return {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h], back: [u + d + w + d, v + d, w, h],
  };
}

export function blank(w = W, h = H) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
const idx = (img, x, y) => (y * img.width + x) * 4;
export function getPx(img, x, y) { const i = idx(img, x, y); return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; }
export function setPx(img, x, y, c) { const i = idx(img, x, y); img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3] ?? 255; }
const shade = (c, k) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), 255];
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Every base-layer pixel position. */
export function baseRegions(variant = 'classic') {
  const out = [];
  for (const p of Object.values(parts(variant))) for (const r of Object.values(faces(p))) out.push(r);
  return out;
}
export function overlayRegions() {
  const out = [];
  for (const p of Object.values(OVERLAYS)) for (const r of Object.values(faces(p))) out.push(r);
  return out;
}

function backgroundMask(img) {
  const { width: w, height: h } = img;
  const corners = [];
  const k = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  for (const [cx, cy] of [[0, 0], [w - k, 0], [0, h - k], [w - k, h - k]]) {
    for (let y = cy; y < cy + k; y++) for (let x = cx; x < cx + k; x++) corners.push(getPx(img, x, y));
  }
  const transparent = corners.filter((c) => c[3] < 32).length > corners.length / 2;
  const med = (i) => corners.map((c) => c[i]).sort((a, b) => a - b)[corners.length >> 1];
  const bg = [med(0), med(1), med(2)];
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = getPx(img, x, y);
      mask[y * w + x] = transparent ? (c[3] > 128 ? 1 : 0) : (c[3] > 128 && dist(c, bg) > 60 ? 1 : 0);
    }
  }
  return mask;
}

function bbox(mask, w, h) {
  const rows = new Array(h).fill(0); const cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { rows[y]++; cols[x]++; }
  const minR = Math.max(1, Math.round(w * 0.01)); const minC = Math.max(1, Math.round(h * 0.01));
  let y0 = rows.findIndex((n) => n >= minR); let y1 = h - 1 - [...rows].reverse().findIndex((n) => n >= minR);
  let x0 = cols.findIndex((n) => n >= minC); let x1 = w - 1 - [...cols].reverse().findIndex((n) => n >= minC);
  if (y0 < 0 || x0 < 0) return null;
  return { x0, y0, x1, y1 };
}

/** Most common (quantised) color of the masked pixels in a cell; null when mostly background. */
function sampleCell(img, mask, x0, y0, x1, y1) {
  const counts = new Map(); let fg = 0; let total = 0;
  const xa = Math.max(0, Math.floor(x0)); const xb = Math.min(img.width, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)); const yb = Math.min(img.height, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      total++;
      if (!mask[y * img.width + x]) continue;
      fg++;
      const c = getPx(img, x, y);
      const key = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
      const e = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2];
      counts.set(key, e);
    }
  }
  if (!total || fg / total < 0.35) return null;
  let best = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n), 255];
}

/**
 * Maps a front-view character picture onto a valid 64x64 skin. The figure is
 * split on Minecraft's 16x32 front grid (head 8, body/arms 12, legs 12 units
 * tall); sides, back, top and bottom are derived from the front.
 */
export function mapCharacterToSkin(img, { variant = 'classic' } = {}) {
  const mask = backgroundMask(img);
  const box = bbox(mask, img.width, img.height);
  if (!box) throw new Error('Could not find a character in the image.');
  const unit = (box.y1 - box.y0 + 1) / 32;
  const cx = (box.x0 + box.x1 + 1) / 2;
  const gx0 = cx - 8 * unit;
  const gy0 = box.y0;
  const cell = (u, v) => sampleCell(img, mask, gx0 + u * unit + unit * 0.15, gy0 + v * unit + unit * 0.15, gx0 + (u + 1) * unit - unit * 0.15, gy0 + (v + 1) * unit - unit * 0.15);
  const aw = variant === 'slim' ? 3 : 4;
  // Front grid rectangles (viewer's left is the character's right side).
  const front = {
    head: [4, 0, 8, 8], body: [4, 8, 8, 12],
    rightArm: [4 - aw, 8, aw, 12], leftArm: [12, 8, aw, 12],
    rightLeg: [4, 20, 4, 12], leftLeg: [8, 20, 4, 12],
  };
  const fallback = { head: [200, 160, 130, 255], body: [70, 110, 190, 255], rightArm: [200, 160, 130, 255], leftArm: [200, 160, 130, 255], rightLeg: [50, 60, 120, 255], leftLeg: [50, 60, 120, 255] };
  const skin = blank();
  const P = parts(variant);
  for (const [name, [fu, fv, fw, fh]] of Object.entries(front)) {
    const grid = [];
    for (let y = 0; y < fh; y++) {
      const row = [];
      for (let x = 0; x < fw; x++) row.push(cell(fu + x, fv + y));
      grid.push(row);
    }
    // Fill gaps from neighbours, then the part's main color.
    const known = grid.flat().filter(Boolean);
    const main = known.length ? known[Math.floor(known.length / 2)] : fallback[name];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (!grid[y][x]) grid[y][x] = (grid[y][x - 1] || (grid[y - 1] && grid[y - 1][x]) || main);
    }
    const f = faces(P[name]);
    const put = ([rx, ry, rw, rh], fn) => { for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) setPx(skin, rx + x, ry + y, fn(x, y, rw, rh)); };
    put(f.front, (x, y) => grid[y][x]);
    const hair = name === 'head' ? grid[0][Math.floor(fw / 2)] : null;
    put(f.back, (x, y) => (name === 'head' ? shade(y < 6 ? hair : grid[y][fw - 1 - x], 0.9) : shade(grid[y][fw - 1 - x], 0.85)));
    put(f.right, (x, y) => (name === 'head' && y < 3 ? shade(hair, 0.95) : shade(grid[y][0], 0.9)));
    put(f.left, (x, y) => (name === 'head' && y < 3 ? shade(hair, 0.95) : shade(grid[y][fw - 1], 0.9)));
    put(f.top, (x) => (name === 'head' ? hair : shade(grid[0][Math.min(fw - 1, x)], 0.95)));
    put(f.bottom, (x) => shade(grid[fh - 1][Math.min(fw - 1, x)], 0.75));
  }
  return normalizeSkin(skin, { variant });
}

/** Nearest-neighbour downscale of a skin-sheet style image to 64x64 (texture mode). */
export function mapAtlasToSkin(img, { variant = 'classic' } = {}) {
  const out = blank();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / 64));
      const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / 64));
      setPx(out, x, y, getPx(img, sx, sy));
    }
  }
  return normalizeSkin(out, { variant });
}

/** 64x32 legacy skins become 64x64 (left limbs copied from the right, like the game does). */
export function upgradeLegacy(img) {
  if (img.height === 64) return img;
  const out = blank();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) setPx(out, x, y, getPx(img, x, y));
  const copy = ([su, sv], [du, dv]) => {
    const sf = faces([su, sv, 4, 12, 4]); const df = faces([du, dv, 4, 12, 4]);
    for (const k of Object.keys(sf)) {
      const [sx, sy, w, h] = sf[k]; const [dx, dy] = df[k === 'left' ? 'right' : k === 'right' ? 'left' : k];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(out, dx + x, dy + y, getPx(img, sx + (w - 1 - x), sy + y));
    }
  };
  copy([0, 16], [16, 48]); // leg
  copy([40, 16], [32, 48]); // arm
  return out;
}

/**
 * Skin rules: base layer fully opaque, overlay pixels either solid or clear,
 * unused areas clear. Transparent base pixels take the part's average color.
 */
export function normalizeSkin(input, { variant = 'classic' } = {}) {
  const img = upgradeLegacy(input);
  if (img.width !== 64 || img.height !== 64) throw new Error('Skins must be 64×64.');
  const out = blank();
  for (const [x0, y0, w, h] of overlayRegions()) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const c = getPx(img, x, y);
      setPx(out, x, y, c[3] >= 128 ? [c[0], c[1], c[2], 255] : [0, 0, 0, 0]);
    }
  }
  for (const [x0, y0, w, h] of baseRegions(variant)) {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const c = getPx(img, x, y); if (c[3] >= 128) { r += c[0]; g += c[1]; b += c[2]; n++; } }
    const avg = n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255] : [128, 128, 128, 255];
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const c = getPx(img, x, y);
      setPx(out, x, y, c[3] >= 128 ? [c[0], c[1], c[2], 255] : avg);
    }
  }
  return out;
}

/** True when every base pixel is opaque and every overlay pixel is 0 or 255 alpha. */
export function isValidSkin(img, variant = 'classic') {
  if (img.width !== 64 || img.height !== 64) return false;
  for (const [x0, y0, w, h] of baseRegions(variant)) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (getPx(img, x, y)[3] !== 255) return false;
  for (const [x0, y0, w, h] of overlayRegions()) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const a = getPx(img, x, y)[3]; if (a !== 0 && a !== 255) return false; }
  return true;
}
