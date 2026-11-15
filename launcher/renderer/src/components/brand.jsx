// Small in-app version of the Saturn Client icon: crystal in a wireframe cube with a glass ring.
export function SaturnMark({ size = 30 }) {
  return (
    <svg className="saturn-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sm-bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#e3ecff" /><stop offset="0.5" stopColor="#9fb2ef" /><stop offset="1" stopColor="#5b4fb4" /></linearGradient>
        <linearGradient id="sm-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="0.5" stopColor="#6fd6ff" /><stop offset="1" stopColor="#a796ff" /></linearGradient>
        <linearGradient id="sm-c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#8fd0ff" /></linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#sm-bg)" />
      <path d="M32 12 L48 21 L48 40 L32 49 L16 40 L16 21 Z M16 21 L32 30 L48 21 M32 30 L32 49" fill="none" stroke="url(#sm-edge)" strokeWidth="2.2" strokeLinejoin="round" />
      <polygon points="32,20 41,31 36,41 28,41 23,31" fill="#7f8cf0" />
      <polygon points="32,20 41,31 32,34" fill="url(#sm-c)" />
      <polygon points="32,20 23,31 32,34" fill="#e6d2ff" />
      <ellipse cx="32" cy="34" rx="26" ry="6.5" transform="rotate(-16 32 34)" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" />
      <rect x="2.5" y="2.5" width="59" height="59" rx="14.5" fill="none" stroke="#fff" strokeOpacity="0.6" />
    </svg>
  );
}
