// SF Symbols-style line icons drawn inline so the app has no icon font dependency.
const P = {
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" stroke="none" />,
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v8.5a1 1 0 0 0 1 1h3.5V15h3v4.5H17a1 1 0 0 0 1-1V10" /></>,
  library: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  discover: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  sparkles: <><path d="M12 3.5 13.6 8a3 3 0 0 0 1.9 1.9L20 11.5l-4.5 1.6a3 3 0 0 0-1.9 1.9L12 19.5l-1.6-4.5a3 3 0 0 0-1.9-1.9L4 11.5l4.5-1.6A3 3 0 0 0 10.4 8L12 3.5Z" /><path d="M19 3v3M17.5 4.5h3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  download: <><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" /></>,
  heart: <path d="M12 19.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 6.8a4.3 4.3 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z" />,
  cube: <><path d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9L12 3.5Z" /><path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9" /></>,
  server: <><rect x="4" y="4.5" width="16" height="6.5" rx="2" /><rect x="4" y="13" width="16" height="6.5" rx="2" /><path d="M8 7.75h.01M8 16.25h.01" /></>,
  bolt: <path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12l1-7Z" />,
  gauge: <><path d="M4.5 16a7.5 7.5 0 1 1 15 0" /><path d="m12 16 3.5-5" /></>,
  target: <><circle cx="12" cy="12" r="7.5" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /></>,
  text: <><path d="M5 6.5h14M5 11.5h10M5 16.5h7" /></>,
  run: <><circle cx="14" cy="4.5" r="1.8" /><path d="m8 21 3-6 3 2.5V21M6.5 11l3-3.5h4l2 3.5 3 1" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5" /></>,
  lock: <><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.6 1.6-2.6h1.8a3.7 3.7 0 0 0 3.7-3.7C20.5 7.6 16.7 3.5 12 3.5Z" /><circle cx="8" cy="11" r="1" /><circle cx="11" cy="7.5" r="1" /><circle cx="15.5" cy="8.5" r="1" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  java: <><path d="M8 18.5c3 1 7 1 9-.5M7.5 15.5c3 1 7.5 1 10-.5" /><path d="M13 3.5c2 2-3 4-1 6.5M10.5 6c-1 1.5 1 2.5.5 4" /></>,
  memory: <><rect x="4" y="7" width="16" height="10" rx="2" /><path d="M8 7v10M12 7v10M16 7v10M4 20h16" /></>,
  arrowUp: <><path d="M12 19V6" /><path d="m6.5 11.5 5.5-5.5 5.5 5.5" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4.5H15" /></>,
  trash: <><path d="M5 7h14M10 4h4M7 7l1 12.5h8L17 7" /></>,
  terminal: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="m7.5 10 3 2.5-3 2.5M12.5 15.5h4" /></>,
  code: <><path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  wand: <><path d="m4 20 11-11M14 4v2M19 9h2M17.5 5.5 19 4M16.5 9.5 18 11" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  external: <><path d="M14 4.5h5.5V10M19.5 4.5 11 13" /><path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V8a1.5 1.5 0 0 1 1.5-1.5h4" /></>,
  grok: <><path d="M5 18.5 18.5 5" /><path d="M9.5 5.5a6.5 6.5 0 0 1 9 9" /><path d="M14.5 18.5a6.5 6.5 0 0 1-9-9" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6l7-2.5Z" /><path d="m9 12 2 2 4-4" /></>,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 4 3.5 2.5-2 4.5 3.5" /></>,
  box: <><path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z" /><path d="m4 8 8 4 8-4M12 12v8" /></>,
};

export default function Icon({ name, size = 18, stroke = 1.8, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      {P[name] || P.cube}
    </svg>
  );
}
