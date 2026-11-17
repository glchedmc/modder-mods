// Small in-app version of the Saturn icon: a glass planet with its ring.
export function SaturnMark({ size = 30 }) {
  return (
    <svg className="saturn-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sm-bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#e3ecff" /><stop offset="0.5" stopColor="#9fb2ef" /><stop offset="1" stopColor="#5b4fb4" /></linearGradient>
        <radialGradient id="sm-pl" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stopColor="#fff" /><stop offset="0.5" stopColor="#b8c6ff" /><stop offset="1" stopColor="#6f5fd0" /></radialGradient>
        <clipPath id="sm-back"><rect x="0" y="0" width="64" height="33" /></clipPath>
        <clipPath id="sm-front"><rect x="0" y="33" width="64" height="31" /></clipPath>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#sm-bg)" />
      <ellipse cx="32" cy="34" rx="26" ry="6.5" transform="rotate(-16 32 34)" clipPath="url(#sm-back)" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="32" cy="32" r="12.5" fill="url(#sm-pl)" stroke="#fff" strokeOpacity="0.75" strokeWidth="0.8" />
      <ellipse cx="32" cy="34" rx="26" ry="6.5" transform="rotate(-16 32 34)" clipPath="url(#sm-front)" fill="none" stroke="#fff" strokeOpacity="0.95" strokeWidth="2" />
      <rect x="2.5" y="2.5" width="59" height="59" rx="14.5" fill="none" stroke="#fff" strokeOpacity="0.6" />
    </svg>
  );
}
