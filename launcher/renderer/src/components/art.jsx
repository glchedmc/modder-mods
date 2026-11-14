// Procedural blocky landscapes: the wallpaper and per-instance cover art.
// Everything is generated SVG, so there are no image assets to license.

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Stepped (voxel) ridge line as an SVG path filled to the bottom. */
export function blockyPath(seed, { width = 1600, height = 600, block = 40, base = 0.5, amp = 0.25, smooth = 4 }) {
  const r = rand(seed);
  const cols = Math.ceil(width / block) + 1;
  const raw = Array.from({ length: cols + smooth * 2 }, () => r());
  const h = [];
  for (let i = 0; i < cols; i++) {
    let s = 0; for (let k = 0; k < smooth * 2 + 1; k++) s += raw[i + k];
    const v = s / (smooth * 2 + 1);
    h.push(Math.round((height * (base - (v - 0.5) * amp * 4)) / block) * block);
  }
  let d = `M0 ${height} L0 ${h[0]}`;
  for (let i = 0; i < cols; i++) { d += ` L${i * block} ${h[i]} L${(i + 1) * block} ${h[i]}`; }
  d += ` L${width} ${height} Z`;
  return { d, heights: h };
}

export function Wallpaper() {
  const far = blockyPath(7, { width: 1600, height: 500, block: 32, base: 0.42, amp: 0.35 });
  const mid = blockyPath(21, { width: 1600, height: 500, block: 40, base: 0.6, amp: 0.3 });
  const near = blockyPath(99, { width: 1600, height: 500, block: 48, base: 0.78, amp: 0.2 });
  return (
    <div className="wallpaper" aria-hidden="true">
      <div className="sky" />
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <svg className="land" viewBox="0 0 1600 500" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b7bd8" stopOpacity="0.75" /><stop offset="1" stopColor="#5b4aa8" stopOpacity="0.4" /></linearGradient>
          <linearGradient id="wm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4d5fb8" /><stop offset="1" stopColor="#2c2f78" /></linearGradient>
          <linearGradient id="wn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#253070" /><stop offset="1" stopColor="#141a48" /></linearGradient>
        </defs>
        
        <path d={far.d} fill="url(#wf)" />
        <path d={mid.d} fill="url(#wm)" opacity="0.9" />
        <path d={near.d} fill="url(#wn)" />
      </svg>
      <div className="grain" />
    </div>
  );
}

const PALETTES = {
  grass: ['#8fd16a', '#5a9e3c', '#7a5634'],
  sword: ['#ffb58f', '#d9734f', '#6e3b2a'],
  brush: ['#cdb3ff', '#8f6be0', '#4a3486'],
  server: ['#8ff0c0', '#3cb37d', '#245e47'],
};

/** Cover art for an instance card or the home hero, tinted by the instance accent. */
export function InstanceArt({ instance, height = 104, hero = false }) {
  const seed = hash(instance.id || instance.name);
  const [top, side, dirt] = PALETTES[instance.icon] || PALETTES.grass;
  const accent = instance.accent || '#7aa8ff';
  const W = hero ? 1200 : 400;
  const H = hero ? 420 : height;
  const blk = hero ? 30 : 16;
  const back = blockyPath(seed, { width: W, height: H, block: blk, base: 0.55, amp: 0.4 });
  const front = blockyPath(seed + 17, { width: W, height: H, block: blk, base: 0.78, amp: 0.3 });
  const r = rand(seed);
  const stars = Array.from({ length: hero ? 26 : 8 }, () => [r() * W, r() * H * 0.45, r() * 1.6 + 0.4]);
  // Trees on the front ridge.
  const trees = [];
  front.heights.forEach((y, i) => { if (r() > (hero ? 0.86 : 0.8) && i > 1) trees.push([i * blk, y]); });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`s${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={accent} />
          <stop offset="0.65" stopColor="#ffc6a8" />
          <stop offset="1" stopColor="#ffe9d2" />
        </linearGradient>
        <linearGradient id={`f${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={top} /><stop offset={blk / H * 0.9} stopColor={top} /><stop offset={blk / H * 0.9 + 0.001} stopColor={side} /><stop offset="1" stopColor={dirt} /></linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#s${seed})`} />
      {stars.map(([x, y, s], i) => <rect key={i} x={x} y={y} width={s} height={s} fill="#fff" opacity="0.7" />)}
      <circle cx={W * (hero ? 0.6 : 0.78)} cy={H * (hero ? 0.42 : 0.3)} r={hero ? 40 : 14} fill="#fff7e6" opacity="0.9" />
      <rect x={W * 0.12} y={H * 0.16} width={blk * 4} height={blk * 0.8} fill="#fff" opacity="0.5" />
      <rect x={W * 0.12 + blk} y={H * 0.16 - blk * 0.8} width={blk * 2} height={blk * 0.8} fill="#fff" opacity="0.5" />
      <path d={back.d} fill={side} opacity="0.45" />
      {trees.map(([x, y], i) => (
        <g key={i}>
          <rect x={x + blk * 0.35} y={y - blk * 1.6} width={blk * 0.3} height={blk * 1.6} fill="#6b4a2b" />
          <rect x={x - blk * 0.1} y={y - blk * 2.6} width={blk * 1.2} height={blk * 1.2} fill={side} />
        </g>
      ))}
      <path d={front.d} fill={`url(#f${seed})`} />
    </svg>
  );
}

export function InstanceGlyph({ instance, size = 22 }) {
  const glyph = { grass: 'cube', sword: 'target', brush: 'palette', server: 'server' }[instance.icon] || 'cube';
  return { glyph, size };
}
