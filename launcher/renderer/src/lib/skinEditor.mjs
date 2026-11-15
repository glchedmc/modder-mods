// Pure skin-editor model (no DOM): which pixel belongs to which body part and
// layer, the left/right mirror map, flood fill and undo/redo history.
// Images are {width: 64, height: 64, data: Uint8ClampedArray RGBA}.
import { faces } from './skinmap.mjs';

export const SIZE = 64;
export const PART_LABELS = { head: 'Head', body: 'Body', rightArm: 'Right arm', leftArm: 'Left arm', rightLeg: 'Right leg', leftLeg: 'Left leg' };
export const LAYER_LABELS = { base: 'Base', over: 'Outer layer' };
const MIRROR_PART = { head: 'head', body: 'body', rightArm: 'leftArm', leftArm: 'rightArm', rightLeg: 'leftLeg', leftLeg: 'rightLeg' };
const MIRROR_FACE = { right: 'left', left: 'right', front: 'front', back: 'back', top: 'top', bottom: 'bottom' };

/** Boxes [u, v, w, h, d] per part for each layer; slim arms are 3 wide. */
export function layout(model = 'classic') {
  const aw = model === 'slim' ? 3 : 4;
  return {
    base: { head: [0, 0, 8, 8, 8], body: [16, 16, 8, 12, 4], rightArm: [40, 16, aw, 12, 4], leftArm: [32, 48, aw, 12, 4], rightLeg: [0, 16, 4, 12, 4], leftLeg: [16, 48, 4, 12, 4] },
    over: { head: [32, 0, 8, 8, 8], body: [16, 32, 8, 12, 4], rightArm: [40, 32, aw, 12, 4], leftArm: [48, 48, aw, 12, 4], rightLeg: [0, 32, 4, 12, 4], leftLeg: [0, 48, 4, 12, 4] },
  };
}

const cache = new Map();
/** 64x64 lookup: for each pixel {part, layer, face, fx, fy, fw, fh} or null. */
export function pixelMap(model = 'classic') {
  if (cache.has(model)) return cache.get(model);
  const map = new Array(SIZE * SIZE).fill(null);
  const lay = layout(model);
  for (const layer of ['base', 'over']) {
    for (const [part, box] of Object.entries(lay[layer])) {
      for (const [face, [x0, y0, w, h]] of Object.entries(faces(box))) {
        for (let fy = 0; fy < h; fy++) for (let fx = 0; fx < w; fx++) map[(y0 + fy) * SIZE + x0 + fx] = { part, layer, face, fx, fy, fw: w, fh: h, x0, y0 };
      }
    }
  }
  cache.set(model, map);
  return map;
}

export function pixelInfo(x, y, model = 'classic') {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  return pixelMap(model)[y * SIZE + x];
}

/** 1 where a pixel belongs to `layer`. */
export function layerMask(model = 'classic', layer = 'base') {
  const m = new Uint8Array(SIZE * SIZE);
  pixelMap(model).forEach((p, i) => { if (p && p.layer === layer) m[i] = 1; });
  return m;
}

/** The pixel on the other side of the body (right arm <-> left arm, etc.). */
export function mirrorPixel(x, y, model = 'classic') {
  const p = pixelInfo(x, y, model);
  if (!p) return null;
  const box = layout(model)[p.layer][MIRROR_PART[p.part]];
  const [tx0, ty0, tw] = faces(box)[MIRROR_FACE[p.face]];
  return [tx0 + (tw - 1 - p.fx), ty0 + p.fy];
}

const at = (img, x, y) => (y * SIZE + x) * 4;
export function getRGBA(img, x, y) { const i = at(img, x, y); return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; }
export function setRGBA(img, x, y, c) { const i = at(img, x, y); img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3] === undefined ? 255 : c[3]; }

export function hexToRgba(hex, alpha = 255) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}
export function rgbaToHex([r, g, b]) { return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`; }

/**
 * Paints one pixel (and its mirror) if it belongs to the active layer.
 * Returns the number of pixels changed.
 */
export function paint(img, x, y, color, { model = 'classic', layer = 'base', mirror = false } = {}) {
  let n = 0;
  const targets = [[x, y]];
  if (mirror) { const m = mirrorPixel(x, y, model); if (m) targets.push(m); }
  for (const [px, py] of targets) {
    const info = pixelInfo(px, py, model);
    if (!info || info.layer !== layer) continue;
    const cur = getRGBA(img, px, py);
    if (cur[0] === color[0] && cur[1] === color[1] && cur[2] === color[2] && cur[3] === color[3]) continue;
    setRGBA(img, px, py, color);
    n++;
  }
  return n;
}

/** Bresenham line between two pixels, so fast strokes have no gaps. */
export function line(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; let x = x0; let y = y0;
  for (let guard = 0; guard < 256; guard++) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

/** Fills same-colored pixels connected to (x, y) within one face of one part. */
export function floodFill(img, x, y, color, { model = 'classic', layer = 'base', mirror = false } = {}) {
  const start = pixelInfo(x, y, model);
  if (!start || start.layer !== layer) return 0;
  const target = getRGBA(img, x, y);
  const same = (c) => c[0] === target[0] && c[1] === target[1] && c[2] === target[2] && c[3] === target[3];
  if (same(color)) return 0;
  const inFace = (px, py) => { const p = pixelInfo(px, py, model); return p && p.layer === layer && p.part === start.part && p.face === start.face; };
  const seen = new Set();
  const stack = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [px, py] = stack.pop();
    const k = py * SIZE + px;
    if (seen.has(k) || !inFace(px, py) || !same(getRGBA(img, px, py))) continue;
    seen.add(k);
    n += paint(img, px, py, color, { model, layer, mirror });
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return n;
}

export function cloneImage(img) { return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }; }

/** Snapshot undo/redo (a 64x64 skin is 16 KB, so 100 steps is cheap). */
export class History {
  constructor(limit = 100) { this.limit = limit; this.past = []; this.future = []; }
  /** Call before a change with the image as it was. */
  push(img) { this.past.push(new Uint8ClampedArray(img.data)); if (this.past.length > this.limit) this.past.shift(); this.future = []; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo(img) { if (!this.past.length) return null; this.future.push(new Uint8ClampedArray(img.data)); return { width: SIZE, height: SIZE, data: this.past.pop() }; }
  redo(img) { if (!this.future.length) return null; this.past.push(new Uint8ClampedArray(img.data)); return { width: SIZE, height: SIZE, data: this.future.pop() }; }
}

export const PALETTE = ['#000000', '#3b3b3b', '#7a7a7a', '#ffffff', '#6b3e26', '#a0673f', '#e0ac69', '#f5d0a9', '#c0392b', '#ff6b7d', '#ffb36b', '#ffd84d', '#5be49b', '#2e8b57', '#4fd1e8', '#7aa8ff', '#3a4fb8', '#b28dff', '#7e4fd6', '#ff8fb1'];
