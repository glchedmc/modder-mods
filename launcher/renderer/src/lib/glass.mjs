// Glass strength -> CSS variables. 0 = solid panels with no blur (fast on
// low-end and Linux GPUs), 1 = full liquid glass. "Reduce transparency"
// forces solid panels regardless of the slider.
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (n) => Math.round(n * 1000) / 1000;

export const GLASS_LEVELS = [
  { value: 0, label: 'Solid' },
  { value: 0.45, label: 'Medium' },
  { value: 1, label: 'Max' },
];

export function glassLabel(t) {
  if (t <= 0.02) return 'Solid';
  if (t < 0.3) return 'Light';
  if (t < 0.6) return 'Medium';
  if (t < 0.9) return 'Strong';
  return 'Max';
}

/**
 * @param {number} strength 0..1
 * @param {{reduceTransparency?: boolean, theme?: 'dark'|'light'}} opts
 * @returns {Record<string,string>} CSS custom properties
 */
export function glassVars(strength, { reduceTransparency = false, theme = 'dark' } = {}) {
  let t = Number.isFinite(Number(strength)) ? Math.min(1, Math.max(0, Number(strength))) : 0.75;
  if (reduceTransparency) t = 0;
  const solid = t === 0;
  const dark = theme !== 'light';
  const bgA = solid ? 1 : lerp(0.9, 0.2, t);
  const strongA = solid ? 1 : lerp(0.96, 0.45, t);
  const sheen = solid ? 0.35 : lerp(0.5, 1, t);
  return {
    '--glass-blur': `${solid ? 0 : Math.round(lerp(6, 36, t))}px`,
    '--glass-sat': `${Math.round(lerp(100, 185, t))}%`,
    '--glass-bg': dark ? `rgba(24, 26, 74, ${r2(bgA)})` : `rgba(246, 248, 255, ${r2(solid ? 1 : lerp(0.95, 0.36, t))})`,
    '--glass-bg-strong': dark ? `rgba(30, 32, 84, ${r2(strongA)})` : `rgba(255, 255, 255, ${r2(solid ? 1 : lerp(0.98, 0.58, t))})`,
    '--sheen-1': `rgba(255, 255, 255, ${r2(0.14 * sheen)})`,
    '--sheen-2': `rgba(255, 255, 255, ${r2(0.05 * sheen)})`,
    '--sheen-3': `rgba(255, 255, 255, ${r2(0.08 * sheen)})`,
    '--scrim-blur': `${solid ? 0 : Math.round(lerp(2, 8, t))}px`,
    '--scrim-bg': `rgba(6, 8, 30, ${r2(solid ? 0.6 : lerp(0.5, 0.35, t))})`,
    '--sheet-bg': dark ? `rgba(28, 30, 80, ${r2(solid ? 1 : lerp(0.97, 0.62, t))})` : `rgba(255, 255, 255, ${r2(solid ? 1 : lerp(0.98, 0.78, t))})`,
  };
}

export function isSolid(strength, reduceTransparency) {
  return Boolean(reduceTransparency) || Number(strength) <= 0;
}
