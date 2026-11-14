// Wallpaper presets and per-instance covers. Scenes are original procedural
// SVG/CSS (no copyrighted screenshots). Custom image/video files are stored
// in the app data folder and served over the glass-bg: protocol.
import { useEffect, useState } from 'react';
import { blockyPath, InstanceArt } from './art';
import { api, isElectron } from '../api';
import Icon from '../icons';

export const LANDSCAPES = [
  { id: 'highlands', name: 'Highlands', hint: 'Dusk hills' },
  { id: 'dawn', name: 'Dawn', hint: 'Early light' },
  { id: 'midday', name: 'Midday', hint: 'Clear sky' },
  { id: 'sunset', name: 'Sunset', hint: 'Warm evening' },
  { id: 'night', name: 'Night', hint: 'Moon and stars' },
  { id: 'cherry', name: 'Cherry Grove', hint: 'Pink spring' },
  { id: 'autumn', name: 'Autumn', hint: 'Gold and rust' },
  { id: 'snowy', name: 'Snowy', hint: 'Winter peaks' },
  { id: 'ocean', name: 'Ocean', hint: 'Blocky waves' },
  { id: 'desert', name: 'Desert', hint: 'Sand mesas' },
];

export const SOLIDS = [
  { id: 'solid-midnight', name: 'Midnight', color: '#12142a' },
  { id: 'solid-navy', name: 'Navy', color: '#1b1e52' },
  { id: 'solid-slate', name: 'Slate', color: '#2c3348' },
  { id: 'solid-ink', name: 'Ink', color: '#0b0c10' },
  { id: 'solid-fog', name: 'Fog', color: '#c9d0dc' },
  { id: 'solid-ivory', name: 'Ivory', color: '#f3efe6' },
  { id: 'solid-blush', name: 'Blush', color: '#e8c4c4' },
  { id: 'solid-sand', name: 'Sand', color: '#e2d0b0' },
  { id: 'solid-sage', name: 'Sage', color: '#9fb6a3' },
  { id: 'solid-teal', name: 'Teal', color: '#1f4a4e' },
  { id: 'solid-lavender', name: 'Lavender', color: '#b7a8d4' },
  { id: 'solid-terracotta', name: 'Terracotta', color: '#c46b4a' },
];

export const GRADIENTS = [
  { id: 'grad-twilight', name: 'Twilight', hint: 'Purple to rose', css: 'linear-gradient(180deg, #1d2163 0%, #3f3a96 40%, #9a5f9e 72%, #d98c8c 100%)' },
  { id: 'grad-dawn', name: 'Dawn Wash', hint: 'Peach to sky', css: 'linear-gradient(180deg, #7ea4e8 0%, #c9d9f5 42%, #ffd3be 78%, #ffe8cf 100%)' },
  { id: 'grad-space', name: 'Deep Space', hint: 'Navy nebula', css: 'radial-gradient(80% 70% at 78% 10%, rgba(160,110,255,0.7), transparent 55%), radial-gradient(60% 50% at 15% 80%, rgba(80,140,255,0.5), transparent 50%), linear-gradient(180deg, #070714, #12143a 55%, #0a0a18)' },
  { id: 'grad-mint', name: 'Mint Ice', hint: 'Cool mint', css: 'linear-gradient(165deg, #d8f3ee 0%, #b9e3ea 40%, #c9d4f0 100%)' },
  { id: 'grad-rosegold', name: 'Rose Gold', hint: 'Warm metal', css: 'linear-gradient(160deg, #f3d0c4 0%, #e8b8a4 45%, #d4a574 100%)' },
  { id: 'grad-dusk', name: 'Dusk Bloom', hint: 'Indigo to coral', css: 'linear-gradient(180deg, #14163a 0%, #3a2a6e 45%, #c46b6b 100%)' },
  { id: 'grad-fog', name: 'Soft Fog', hint: 'Pale lilac', css: 'linear-gradient(180deg, #eef0f7 0%, #d9d6ea 55%, #c9c3dc 100%)' },
  { id: 'grad-ember', name: 'Ember', hint: 'Low glow', css: 'radial-gradient(80% 60% at 50% 110%, rgba(255,140,70,0.7), transparent 55%), linear-gradient(180deg, #140c10 0%, #2a1214 60%, #4a1c16 100%)' },
];

export const OTHERS = [
  { id: 'aurora', name: 'Aurora', hint: 'Animated lights', animated: true },
  { id: 'glassflow', name: 'Glass Flow', hint: 'Liquid glass', animated: true },
  { id: 'starfield', name: 'Starfield', hint: 'Deep night', animated: true },
  { id: 'prism', name: 'Prism', hint: 'Iridescent wash', animated: true },
  { id: 'mesh', name: 'Soft Mesh', hint: 'Blurred color' },
];

export const GROUPS = [
  ['Landscapes', LANDSCAPES],
  ['Solids', SOLIDS],
  ['Gradients', GRADIENTS],
  ['Other', OTHERS],
];

const LAND_CFG = {
  highlands: {
    seeds: [7, 21, 99], blocks: [32, 40, 48], bases: [0.42, 0.6, 0.78], amps: [0.35, 0.3, 0.2], landH: 0.46,
    far: ['#8b7bd8', '#5b4aa8'], mid: ['#4d5fb8', '#2c2f78'], near: ['#253070', '#141a48'],
    sky: 'radial-gradient(1200px 700px at 78% -10%, rgba(255,170,120,0.55), transparent 60%), radial-gradient(900px 600px at 10% 10%, rgba(120,140,255,0.55), transparent 60%), linear-gradient(180deg, #1d2163 0%, #3f3a96 36%, #9a5f9e 68%, #d98c8c 100%)',
    skyLight: 'radial-gradient(1200px 700px at 78% -10%, rgba(255,220,180,0.8), transparent 60%), radial-gradient(900px 600px at 10% 10%, rgba(170,200,255,0.9), transparent 60%), linear-gradient(180deg, #8fb4ff 0%, #b8c6ff 40%, #ffd3c4 75%, #ffe8cf 100%)',
    blobs: [['#6a7bff', '-8%', '30%'], ['#ff9a8b', 'auto', '8%', '-6%'], ['#9b6bff', '45%', 'auto', null, '-10%']],
    decor: 'glow',
  },
  dawn: {
    seeds: [11, 33, 71], blocks: [32, 40, 48], bases: [0.5, 0.66, 0.82], amps: [0.28, 0.22, 0.16], landH: 0.44,
    far: ['#f0b8a0', '#c88a8a'], mid: ['#7a8f7a', '#4a5e52'], near: ['#3d4f40', '#243028'],
    sky: 'radial-gradient(900px 500px at 72% 58%, rgba(255,200,140,0.85), transparent 50%), linear-gradient(180deg, #2a3a6a 0%, #7a8fbd 32%, #f0c3a0 62%, #ffd8b8 100%)',
    skyLight: 'radial-gradient(900px 500px at 72% 55%, rgba(255,230,180,0.9), transparent 50%), linear-gradient(180deg, #9bb6e8 0%, #c8d6f0 35%, #ffe0c4 70%, #fff0dc 100%)',
    blobs: [['#ffb88a', '60%', '40%'], ['#8aa4e0', '-10%', '10%']],
    decor: 'sun-low',
  },
  midday: {
    seeds: [4, 18, 42], blocks: [28, 36, 44], bases: [0.48, 0.64, 0.8], amps: [0.32, 0.24, 0.16], landH: 0.5,
    far: ['#8ec6ff', '#5a9ad8'], mid: ['#6db36a', '#3e7a42'], near: ['#4a8a3e', '#2d5a28'],
    sky: 'radial-gradient(700px 500px at 78% 18%, rgba(255,250,230,0.95), transparent 45%), linear-gradient(180deg, #6aa8f0 0%, #8ec4f8 45%, #c8e4ff 100%)',
    skyLight: 'radial-gradient(700px 500px at 78% 18%, #fffce8, transparent 45%), linear-gradient(180deg, #8ec4ff 0%, #b6d8ff 50%, #e8f4ff 100%)',
    blobs: [['#fff6c8', '70%', '5%'], ['#9ad0ff', '-8%', '40%']],
    decor: 'sun-high',
  },
  sunset: {
    seeds: [13, 29, 61], blocks: [36, 44, 52], bases: [0.4, 0.58, 0.76], amps: [0.38, 0.28, 0.18], landH: 0.48,
    far: ['#e08a6a', '#a04a48'], mid: ['#5a2a3a', '#2a1528'], near: ['#1a0e1c', '#0c0810'],
    sky: 'radial-gradient(800px 480px at 74% 48%, rgba(255,200,90,0.95), rgba(255,120,80,0.2) 40%, transparent 60%), linear-gradient(180deg, #1a1448 0%, #6a2a6a 35%, #e06850 65%, #ffb060 100%)',
    skyLight: 'radial-gradient(800px 480px at 74% 48%, rgba(255,220,140,0.95), transparent 55%), linear-gradient(180deg, #6a7ab8 0%, #e08a8a 50%, #ffc898 100%)',
    blobs: [['#ff8a50', '65%', '35%'], ['#c05080', '0%', '20%']],
    decor: 'sun-set',
  },
  night: {
    seeds: [3, 27, 81], blocks: [32, 40, 48], bases: [0.44, 0.62, 0.8], amps: [0.34, 0.26, 0.16], landH: 0.46,
    far: ['#3a3a7a', '#1c1c48'], mid: ['#1c2448', '#0e1228'], near: ['#0a0c1c', '#05060e'],
    sky: 'radial-gradient(600px 400px at 78% 22%, rgba(200,220,255,0.25), transparent 50%), linear-gradient(180deg, #07081a 0%, #12163a 55%, #1a2048 100%)',
    skyLight: 'radial-gradient(600px 400px at 78% 22%, rgba(255,255,255,0.55), transparent 50%), linear-gradient(180deg, #3a4a7a 0%, #6a7aa8 60%, #8a9ab8 100%)',
    blobs: [['#4a5a9a', '10%', '15%']],
    decor: 'night',
  },
  cherry: {
    seeds: [9, 25, 55], blocks: [30, 38, 46], bases: [0.5, 0.66, 0.82], amps: [0.26, 0.2, 0.14], landH: 0.46,
    far: ['#f0b8d0', '#d080a8'], mid: ['#8fbf7a', '#5a8a52'], near: ['#5a8a4a', '#3a5e34'],
    sky: 'radial-gradient(900px 600px at 20% 20%, rgba(255,200,220,0.55), transparent 55%), linear-gradient(180deg, #8aa0e0 0%, #c8b8e8 40%, #f0c8d8 75%, #ffe4e8 100%)',
    skyLight: 'linear-gradient(180deg, #c8d8f8 0%, #f0d8e8 50%, #ffe8f0 100%)',
    blobs: [['#ffb0c8', '15%', '20%'], ['#ffd0e0', '70%', '40%']],
    decor: 'cherry',
  },
  autumn: {
    seeds: [15, 37, 73], blocks: [34, 42, 50], bases: [0.46, 0.64, 0.8], amps: [0.3, 0.24, 0.16], landH: 0.5,
    far: ['#e0a060', '#c07040'], mid: ['#c86830', '#8a3c18'], near: ['#6a3a18', '#3a2010'],
    sky: 'radial-gradient(800px 500px at 80% 20%, rgba(255,200,120,0.6), transparent 55%), linear-gradient(180deg, #4a68a0 0%, #8aa0b8 35%, #e8c090 70%, #f0d0a0 100%)',
    skyLight: 'linear-gradient(180deg, #8ab0d8 0%, #d8c8a0 55%, #f0dcb0 100%)',
    blobs: [['#ffb060', '70%', '15%'], ['#d07040', '5%', '50%']],
    decor: 'autumn',
  },
  snowy: {
    seeds: [6, 22, 88], blocks: [32, 40, 52], bases: [0.4, 0.58, 0.76], amps: [0.4, 0.32, 0.2], landH: 0.52,
    far: ['#d0e0f0', '#a0b8d0'], mid: ['#e8f0f8', '#c0d0e0'], near: ['#f4f8fc', '#d0dce8'],
    sky: 'linear-gradient(180deg, #4a5a7a 0%, #8aa0b8 45%, #d0dce8 100%)',
    skyLight: 'linear-gradient(180deg, #b8c8dc 0%, #e0e8f0 50%, #f4f8fc 100%)',
    blobs: [['#e8f0ff', '20%', '10%'], ['#c8d8f0', '70%', '30%']],
    decor: 'snow',
  },
  ocean: {
    seeds: [8, 24, 64], blocks: [36, 48, 56], bases: [0.55, 0.68, 0.82], amps: [0.18, 0.12, 0.08], landH: 0.58,
    far: ['#6ab0c8', '#3a7a98'], mid: ['#2a6a88', '#184860'], near: ['#0e3a50', '#082030'],
    sky: 'radial-gradient(700px 400px at 75% 30%, rgba(255,230,180,0.55), transparent 50%), linear-gradient(180deg, #4a88c8 0%, #7ab0d8 40%, #b8d8e8 100%)',
    skyLight: 'linear-gradient(180deg, #8ec4e8 0%, #c0e0f0 55%, #e0f0f8 100%)',
    blobs: [['#fff0c8', '72%', '22%'], ['#4a90c0', '-5%', '40%']],
    decor: 'ocean',
  },
  desert: {
    seeds: [2, 19, 47], blocks: [40, 52, 64], bases: [0.52, 0.68, 0.84], amps: [0.36, 0.22, 0.12], landH: 0.5,
    far: ['#e8c878', '#c8a050'], mid: ['#d4a04a', '#a87830'], near: ['#c49038', '#8a6020'],
    sky: 'radial-gradient(600px 400px at 78% 22%, rgba(255,245,200,0.95), transparent 45%), linear-gradient(180deg, #5a88c8 0%, #9ab8d8 35%, #f0d8a0 75%, #f8e0a8 100%)',
    skyLight: 'linear-gradient(180deg, #8eb4e0 0%, #e8d8a8 60%, #f8ecc0 100%)',
    blobs: [['#ffe8a0', '70%', '8%']],
    decor: 'sun-high',
  },
};

function useIsDark() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light');
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.dataset.theme !== 'light'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function Landscape({ id, animated }) {
  const dark = useIsDark();
  const cfg = LAND_CFG[id] || LAND_CFG.highlands;
  const W = 1600, H = 500;
  const far = blockyPath(cfg.seeds[0], { width: W, height: H, block: cfg.blocks[0], base: cfg.bases[0], amp: cfg.amps[0] });
  const mid = blockyPath(cfg.seeds[1], { width: W, height: H, block: cfg.blocks[1], base: cfg.bases[1], amp: cfg.amps[1] });
  const near = blockyPath(cfg.seeds[2], { width: W, height: H, block: cfg.blocks[2], base: cfg.bases[2], amp: cfg.amps[2] });
  const r = rand(cfg.seeds[0] + 99);
  const stars = id === 'night' ? Array.from({ length: 40 }, () => [r() * W, r() * H * 0.7, r() * 2 + 0.6, 0.4 + r() * 0.6]) : [];
  const petals = id === 'cherry' ? Array.from({ length: 18 }, (_, i) => ({ x: r() * 100, y: r() * 80, s: 6 + r() * 8, d: 10 + r() * 14, delay: r() * 8 })) : [];
  const flakes = id === 'snow' || id === 'snowy' ? Array.from({ length: 24 }, () => ({ x: r() * 100, y: r() * 80, s: 2 + r() * 4, d: 8 + r() * 12, delay: r() * 8 })) : [];
  const uid = `s${id}`;
  return (
    <div className={`scene scene-${id}`} aria-hidden="true">
      <div className="sky" style={{ background: dark ? cfg.sky : cfg.skyLight }} />
      {cfg.blobs.map(([color, left, top, right, bottom], i) => (
        <div key={i} className={`blob b${i + 1}`} style={{ background: color, left, top, right, bottom, animationDelay: `${-i * 7}s` }} />
      ))}
      <svg className="land" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" style={{ height: `${cfg.landH * 100}%` }}>
        <defs>
          <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cfg.far[0]} /><stop offset="1" stopColor={cfg.far[1]} /></linearGradient>
          <linearGradient id={`${uid}m`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cfg.mid[0]} /><stop offset="1" stopColor={cfg.mid[1]} /></linearGradient>
          <linearGradient id={`${uid}n`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cfg.near[0]} /><stop offset="1" stopColor={cfg.near[1]} /></linearGradient>
        </defs>
        {stars.map(([x, y, s, o], i) => <rect key={i} x={x} y={y} width={s} height={s} fill="#fff" opacity={o} />)}
        {cfg.decor === 'night' && <circle cx={1240} cy={120} r={36} fill="#f4f1e6" opacity="0.92" />}
        {cfg.decor === 'sun-high' && <circle cx={1260} cy={110} r={48} fill="#fff7d6" opacity="0.95" />}
        {cfg.decor === 'sun-low' && <circle cx={1180} cy={280} r={54} fill="#ffd09a" opacity="0.95" />}
        {cfg.decor === 'sun-set' && <circle cx={1220} cy={300} r={70} fill="#ffcf7a" opacity="0.95" />}
        {cfg.decor === 'ocean' && <circle cx={1240} cy={160} r={36} fill="#fff4d0" opacity="0.9" />}
        {cfg.decor === 'glow' && <circle cx={1280} cy={90} r={70} fill="#ffd9b8" opacity="0.35" />}
        <path d={far.d} fill={`url(#${uid}f)`} opacity="0.85" />
        <path d={mid.d} fill={`url(#${uid}m)`} opacity="0.92" />
        <path d={near.d} fill={`url(#${uid}n)`} />
      </svg>
      {animated && petals.map((p, i) => (
        <i key={i} className="petal" style={{ left: `${p.x}%`, top: `-${p.s}px`, width: p.s, height: p.s * 0.7, animationDuration: `${p.d}s`, animationDelay: `${-p.delay}s` }} />
      ))}
      {animated && flakes.map((p, i) => (
        <i key={i} className="flake" style={{ left: `${p.x}%`, top: `-${p.s}px`, width: p.s, height: p.s, animationDuration: `${p.d}s`, animationDelay: `${-p.delay}s` }} />
      ))}
      <div className="grain" />
    </div>
  );
}

function Solid({ color }) {
  return <div className="scene scene-solid" style={{ background: color }}><div className="grain" /></div>;
}

function Gradient({ css }) {
  return <div className="scene scene-grad" style={{ background: css }}><div className="grain" /></div>;
}

function Aurora({ animated }) {
  return (
    <div className="scene scene-aurora">
      <Landscape id="night" animated={false} />
      <div className={`aurora-band a1 ${animated ? 'on' : ''}`} />
      <div className={`aurora-band a2 ${animated ? 'on' : ''}`} />
      <div className={`aurora-band a3 ${animated ? 'on' : ''}`} />
    </div>
  );
}

function GlassFlow({ animated }) {
  return (
    <div className="scene scene-glassflow">
      <div className="sky" style={{ background: 'linear-gradient(180deg, #16183a, #2a2158 50%, #3a2a50)' }} />
      <div className={`gf g1 ${animated ? 'on' : ''}`} />
      <div className={`gf g2 ${animated ? 'on' : ''}`} />
      <div className={`gf g3 ${animated ? 'on' : ''}`} />
      <div className={`gf g4 ${animated ? 'on' : ''}`} />
      <div className="grain" />
    </div>
  );
}

function Starfield({ animated }) {
  const r = rand(42);
  const stars = Array.from({ length: 70 }, () => [r() * 100, r() * 100, 1 + r() * 2.2, 0.35 + r() * 0.65, 2 + r() * 4]);
  return (
    <div className="scene scene-starfield">
      <div className="sky" style={{ background: 'radial-gradient(900px 600px at 70% 20%, rgba(80,100,180,0.35), transparent 55%), linear-gradient(180deg, #05060f, #0c1028)' }} />
      {stars.map(([x, y, s, o, d], i) => (
        <i key={i} className={`stardot ${animated ? 'on' : ''}`} style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, opacity: o, animationDuration: `${d}s`, animationDelay: `${-i * 0.17}s` }} />
      ))}
    </div>
  );
}

function Prism({ animated }) {
  return (
    <div className={`scene scene-prism ${animated ? 'on' : ''}`}>
      <div className="prism-wash" />
      <div className="grain" />
    </div>
  );
}

function Mesh() {
  return (
    <div className="scene scene-mesh">
      <div className="mesh m1" />
      <div className="mesh m2" />
      <div className="mesh m3" />
      <div className="mesh m4" />
    </div>
  );
}

export function customMediaUrl(custom) {
  if (!custom || !custom.file) return null;
  if (custom.previewUrl) return custom.previewUrl;
  if (isElectron) return `glass-bg://file/${encodeURIComponent(custom.file)}`;
  return null;
}

export function MediaBackground({ custom }) {
  const url = customMediaUrl(custom);
  if (!url) return <Landscape id="highlands" animated={false} />;
  if (custom.kind === 'video') {
    return <video className="media-bg" src={url} muted loop playsInline autoPlay />;
  }
  return <img className="media-bg" src={url} alt="" />;
}

export function BackgroundLayer({ id, custom, solid, animated = true }) {
  if (id === 'custom' && custom) return <MediaBackground custom={custom} />;
  if (id === 'solid-custom') return <Solid color={solid || '#1b1e52'} />;
  const s = SOLIDS.find((x) => x.id === id);
  if (s) return <Solid color={s.color} />;
  const g = GRADIENTS.find((x) => x.id === id);
  if (g) return <Gradient css={g.css} />;
  if (id === 'aurora') return <Aurora animated={animated} />;
  if (id === 'glassflow') return <GlassFlow animated={animated} />;
  if (id === 'starfield') return <Starfield animated={animated} />;
  if (id === 'prism') return <Prism animated={animated} />;
  if (id === 'mesh') return <Mesh />;
  return <Landscape id={LAND_CFG[id] ? id : 'highlands'} animated={animated} />;
}

export function resolveCover(instance, settings) {
  const id = (instance && instance.background) || 'art';
  if (id === 'inherit') {
    return { type: 'layer', id: settings.backgroundId, custom: settings.customBackground, solid: settings.backgroundSolid };
  }
  if (id === 'art') return { type: 'art', instance };
  if (id === 'custom') return { type: 'layer', id: 'custom', custom: instance.customBackground, solid: instance.backgroundSolid };
  return { type: 'layer', id, custom: instance.customBackground, solid: instance.backgroundSolid || settings.backgroundSolid };
}

export function InstanceCover({ instance, settings, hero = false, height = 104, animated = false }) {
  const cover = resolveCover(instance, settings);
  if (cover.type === 'art') return <InstanceArt instance={instance} hero={hero} height={height} />;
  return <BackgroundLayer id={cover.id} custom={cover.custom} solid={cover.solid} animated={animated} />;
}

export function Wallpaper({ settings }) {
  const reduce = Boolean(settings && settings.reduceMotion);
  const parallax = reduce ? 0 : Number(settings && settings.backgroundParallax != null ? settings.backgroundParallax : 0.35);
  const blur = Number(settings && settings.backgroundBlur != null ? settings.backgroundBlur : 0);
  const dim = Number(settings && settings.backgroundDim != null ? settings.backgroundDim : 0.2);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!parallax) { setPos({ x: 0, y: 0 }); return undefined; }
    const onMove = (e) => {
      setPos({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [parallax]);
  const t = parallax * 18;
  const scale = 1.08 + blur * 0.06;
  return (
    <div className="wallpaper" aria-hidden="true">
      <div
        className="wallpaper-shift"
        style={{
          transform: `translate(${pos.x * t}px, ${pos.y * t}px) scale(${scale})`,
          filter: blur ? `blur(${Math.round(blur * 28)}px)` : undefined,
        }}
      >
        <BackgroundLayer
          id={(settings && settings.backgroundId) || 'highlands'}
          custom={settings && settings.customBackground}
          solid={settings && settings.backgroundSolid}
          animated={!reduce}
        />
      </div>
      {dim > 0 && <div className="wallpaper-dim" style={{ opacity: dim }} />}
    </div>
  );
}

function Thumb({ id, selected, name, hint, onSelect, children, wide }) {
  return (
    <button
      type="button"
      className={`bg-thumb ${selected ? 'on' : ''} ${wide ? 'wide' : ''}`}
      data-bg={id}
      title={hint || name}
      onClick={() => onSelect(id)}
    >
      <div className="bg-thumb-art">{children}</div>
      <span>{name}</span>
    </button>
  );
}

export function BackgroundPicker({
  value, custom, solid, settings, onSelect, onSolidColor, onImport, onRemoveCustom,
  includeInherit = false, includeArt = false, instance = null, compact = false,
}) {
  const importFile = async () => {
    if (onImport) return onImport();
  };
  return (
    <div className={`bg-picker ${compact ? 'compact' : ''}`}>
      {(includeInherit || includeArt) && (
        <div className="bg-group">
          <div className="group-title">This instance</div>
          <div className="bg-grid">
            {includeInherit && (
              <Thumb id="inherit" selected={value === 'inherit'} name="App background" hint="Use the app background" onSelect={onSelect}>
                <BackgroundLayer id={settings.backgroundId} custom={settings.customBackground} solid={settings.backgroundSolid} animated={false} />
              </Thumb>
            )}
            {includeArt && instance && (
              <Thumb id="art" selected={value === 'art'} name="Generated art" hint="Unique cover art" onSelect={onSelect}>
                <InstanceArt instance={instance} height={80} />
              </Thumb>
            )}
          </div>
        </div>
      )}
      {GROUPS.map(([label, items]) => (
        <div className="bg-group" key={label}>
          <div className="group-title">{label}</div>
          <div className="bg-grid">
            {items.map((p) => (
              <Thumb key={p.id} id={p.id} selected={value === p.id} name={p.name} hint={p.hint || p.name} onSelect={onSelect}>
                {p.color
                  ? <Solid color={p.color} />
                  : <BackgroundLayer id={p.id} animated={false} />}
              </Thumb>
            ))}
            {label === 'Solids' && (
              <label className={`bg-thumb ${value === 'solid-custom' ? 'on' : ''}`} data-bg="solid-custom" title="Pick any color" onClick={() => onSolidColor && onSolidColor(solid || '#1b1e52')}>
                <div className="bg-thumb-art" style={{ background: solid || '#1b1e52' }}>
                  <span className="bg-color-dot">
                    <input type="color" value={solid || '#1b1e52'} onChange={(e) => onSolidColor && onSolidColor(e.target.value)} aria-label="Custom color" />
                  </span>
                </div>
                <span>Custom color</span>
              </label>
            )}
          </div>
        </div>
      ))}
      <div className="bg-group">
        <div className="group-title">Your image or video</div>
        <div className="bg-grid">
          {custom && (
            <Thumb id="custom" selected={value === 'custom'} name={custom.name || 'Custom'} hint="Your file" onSelect={onSelect} wide>
              <MediaBackground custom={custom} />
            </Thumb>
          )}
          <button type="button" className="bg-thumb add" title="png, jpg, webp, gif, mp4 or webm" onClick={importFile}>
            <div className="bg-thumb-art add-art"><Icon name="plus" size={22} /><span>Add file</span></div>
            <span>Image or video</span>
          </button>
          {custom && (
            <button type="button" className="bg-thumb add" title="Remove your file" onClick={onRemoveCustom}>
              <div className="bg-thumb-art add-art"><Icon name="trash" size={20} /><span>Remove</span></div>
              <span>Remove file</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
