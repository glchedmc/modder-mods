// Canvas helpers (renderer only).
export function toDataUrl(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c.toDataURL('image/png');
}

export function loadImageData(src, maxSide = 1024) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.max(1, Math.round(im.naturalWidth * k)); const h = Math.max(1, Math.round(im.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = k < 1;
      ctx.drawImage(im, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      resolve({ width: w, height: h, data: d.data });
    };
    im.onerror = () => reject(new Error('Could not read that image.'));
    im.src = src;
  });
}

/** Flat front view of a skin (head, body, arms, legs) for thumbnails. */
export function skinFrontDataUrl(skinUrl, variant = 'classic', scale = 8) {
  return loadImageData(skinUrl, 64).then((img) => {
    const aw = variant === 'slim' ? 3 : 4;
    const c = document.createElement('canvas'); c.width = 16 * scale; c.height = 32 * scale;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const src = document.createElement('canvas'); src.width = 64; src.height = 64;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), 64, img.height), 0, 0);
    const draw = (sx, sy, w, h, dx, dy) => ctx.drawImage(src, sx, sy, w, h, dx * scale, dy * scale, w * scale, h * scale);
    draw(8, 8, 8, 8, 4, 0); draw(40, 8, 8, 8, 4, 0);
    draw(20, 20, 8, 12, 4, 8); draw(20, 36, 8, 12, 4, 8);
    draw(44, 20, aw, 12, 4 - aw, 8); draw(36, 52, aw, 12, 12, 8);
    draw(4, 20, 4, 12, 4, 20); draw(20, 52, 4, 12, 8, 20);
    return c.toDataURL('image/png');
  });
}
