// The Saturn mark: a glass planet with its ring. Used for the app icon, the alternate dock icons,
// the in-app sidebar mark and the in-game logo texture. (No cube, no crystal.)
export const THEMES = {
  saturn: { bg: ['#e3ecff', '#9fb2ef', '#5b4fb4'], planet: ['#ffffff', '#b8c6ff', '#6f5fd0'], band: '#ffffff', ring: ['#ffffff', '#9fe3ff', '#c7b6ff', '#ffffff'], shadow: '#241a66' },
  night: { bg: ['#1a1e4a', '#2a2470', '#3a2a68'], planet: ['#c9d6ff', '#7d86ee', '#2f2a86'], band: '#cfe0ff', ring: ['#ffffff', '#7fd8ff', '#b79cff', '#ffffff'], shadow: '#080a28' },
  dawn: { bg: ['#fff1e8', '#f6c3d8', '#9a86d8'], planet: ['#ffffff', '#ffd2e6', '#a98ae0'], band: '#ffffff', ring: ['#ffffff', '#ffd8a8', '#e3b8ff', '#ffffff'], shadow: '#4a2a6a' },
};

const ringG = (id, r) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${r[0]}" stop-opacity="0.9"/><stop offset="0.35" stop-color="${r[1]}" stop-opacity="0.95"/><stop offset="0.7" stop-color="${r[2]}" stop-opacity="0.9"/><stop offset="1" stop-color="${r[3]}" stop-opacity="0.85"/></linearGradient>`;

function planetGroup(t, ids = '') {
  return {
    defs: `
    <radialGradient id="pl${ids}" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="${t.planet[0]}"/><stop offset="0.5" stop-color="${t.planet[1]}"/><stop offset="1" stop-color="${t.planet[2]}"/></radialGradient>
    <radialGradient id="pshade${ids}" cx="0.7" cy="0.75" r="0.7"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="${t.shadow}" stop-opacity="0.45"/></radialGradient>
    <clipPath id="pc${ids}"><circle cx="0" cy="0" r="205"/></clipPath>
    ${ringG('ring' + ids, t.ring)}
    <filter id="glow${ids}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="sh${ids}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="${t.shadow}" flood-opacity="0.42"/></filter>
    <clipPath id="rb${ids}"><rect x="-500" y="-300" width="1000" height="300"/></clipPath>
    <clipPath id="rf${ids}"><rect x="-500" y="0" width="1000" height="300"/></clipPath>`,
    back: `<g transform="translate(512 548) rotate(-16)" clip-path="url(#rb${ids})" fill="none" opacity="0.75">
      <ellipse rx="372" ry="96" stroke="#e8f6ff" stroke-opacity="0.22" stroke-width="44"/>
      <ellipse rx="372" ry="96" stroke="url(#ring${ids})" stroke-width="10" filter="url(#glow${ids})"/>
      <ellipse rx="340" ry="80" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/></g>`,
    body: `<g transform="translate(512 540)" filter="url(#sh${ids})">
      <circle r="205" fill="url(#pl${ids})"/>
      <g clip-path="url(#pc${ids})" transform="rotate(-16)">
        <rect x="-220" y="-110" width="440" height="34" fill="${t.band}" opacity="0.22"/>
        <rect x="-220" y="-40" width="440" height="22" fill="${t.band}" opacity="0.16"/>
        <rect x="-220" y="60" width="440" height="40" fill="${t.band}" opacity="0.14"/>
      </g>
      <circle r="205" fill="url(#pshade${ids})"/>
      <ellipse cx="-70" cy="-95" rx="95" ry="52" transform="rotate(-30 -70 -95)" fill="#fff" opacity="0.28"/>
      <circle r="205" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="5"/></g>`,
    front: `<g transform="translate(512 548) rotate(-16)" clip-path="url(#rf${ids})" fill="none">
      <ellipse rx="372" ry="96" stroke="#e8f6ff" stroke-opacity="0.22" stroke-width="44"/>
      <ellipse rx="372" ry="96" stroke="url(#ring${ids})" stroke-width="10" filter="url(#glow${ids})"/>
      <ellipse rx="340" ry="80" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/></g>`,
  };
}

/** Square app icon on a glass squircle (1024 box). */
export function iconSvg(name = 'saturn') {
  const t = THEMES[name];
  const p = planetGroup(t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- Saturn icon (${name}): a glass planet circled by its ring, on a glass squircle. -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${t.bg[0]}"/><stop offset="0.42" stop-color="${t.bg[1]}"/><stop offset="1" stop-color="${t.bg[2]}"/></linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.52" r="0.42"><stop offset="0" stop-color="#bfe9ff" stop-opacity="0.6"/><stop offset="0.6" stop-color="#9ad4ff" stop-opacity="0.14"/><stop offset="1" stop-color="#9ad4ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.38" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0.16"/></linearGradient>
    <clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>${p.defs}
  </defs>
  <g clip-path="url(#sq)">
    <rect x="100" y="100" width="824" height="824" fill="url(#bg)"/>
    <circle cx="250" cy="225" r="170" fill="#fff" opacity="0.24"/>
    <circle cx="512" cy="530" r="360" fill="url(#halo)"/>
    ${p.back}
    ${p.body}
    ${p.front}
    <rect x="100" y="100" width="824" height="824" fill="url(#glass)"/>
  </g>
  <rect x="102" y="102" width="820" height="820" rx="184" fill="none" stroke="#fff" stroke-opacity="0.66" stroke-width="4"/>
</svg>
`;
}

/** Transparent 256 px logo for the in-game title screen: planet and ring only. */
export function logoSvg() {
  const t = THEMES.saturn;
  const p = planetGroup(t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="90 190 844 700"><defs>${p.defs}</defs>${p.back}${p.body}${p.front}</svg>`;
}
