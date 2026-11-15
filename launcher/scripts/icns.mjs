// Minimal .icns writer: every entry is a PNG payload, which macOS accepts for these types.
export const ICNS_TYPES = [
  ['icp4', 16], ['icp5', 32], ['ic11', 32], ['ic12', 64], ['ic07', 128],
  ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024],
];

/** @param {Record<number, Buffer>} pngBySize */
export function buildIcns(pngBySize) {
  const chunks = [];
  for (const [type, px] of ICNS_TYPES) {
    const png = pngBySize[px];
    if (!png) continue;
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    chunks.push(head, png);
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

/** Lists [type, length] entries; used by tests. */
export function readIcns(buf) {
  if (buf.toString('ascii', 0, 4) !== 'icns') throw new Error('not icns');
  const out = [];
  for (let o = 8; o < buf.length;) { const len = buf.readUInt32BE(o + 4); out.push([buf.toString('ascii', o, o + 4), len]); o += len; }
  return out;
}
