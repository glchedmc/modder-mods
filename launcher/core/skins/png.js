'use strict';
// Tiny PNG header reader so skins and capes can be validated without an image library.
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  const s = String(input || '');
  const m = /^data:image\/png;base64,(.*)$/s.exec(s);
  return Buffer.from(m ? m[1] : s, 'base64');
}

/** {width, height, bitDepth, colorType} from the IHDR chunk, or throws. */
function pngInfo(input) {
  const buf = toBuffer(input);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG) || buf.toString('ascii', 12, 16) !== 'IHDR') {
    const e = new Error('That file is not a PNG image.'); e.code = 'NOT_PNG'; throw e;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], bytes: buf.length };
}

const MAX_BYTES = 512 * 1024;

/** Skins must be 64x64 (modern) or 64x32 (legacy). */
function validateSkin(input) {
  const info = pngInfo(input);
  if (info.bytes > MAX_BYTES) throw Object.assign(new Error('Skin file is too large.'), { code: 'TOO_LARGE' });
  if (info.width !== 64 || (info.height !== 64 && info.height !== 32)) {
    throw Object.assign(new Error(`Skins must be 64×64 PNGs (this one is ${info.width}×${info.height}).`), { code: 'BAD_SIZE' });
  }
  return { ...info, legacy: info.height === 32 };
}

/** Capes use the 64x32 layout (or an exact 2x/4x/8x of it for HD capes). */
function validateCape(input) {
  const info = pngInfo(input);
  if (info.bytes > MAX_BYTES * 4) throw Object.assign(new Error('Cape file is too large.'), { code: 'TOO_LARGE' });
  const ok = [1, 2, 4, 8].some((k) => info.width === 64 * k && info.height === 32 * k);
  if (!ok) throw Object.assign(new Error(`Capes must be 64×32 PNGs (this one is ${info.width}×${info.height}).`), { code: 'BAD_SIZE' });
  return info;
}

module.exports = { pngInfo, validateSkin, validateCape, toBuffer, SIG };
