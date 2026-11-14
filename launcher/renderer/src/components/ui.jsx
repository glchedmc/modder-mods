import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../icons';

export function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} role="tab" aria-selected={value === o.value}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Range({ value, min, max, step, onChange, format = (v) => v }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="row" style={{ gap: 12 }}>
      <input type="range" min={min} max={max} step={step} value={value} style={{ '--p': `${p}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="faint" style={{ width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{format(value)}</span>
    </div>
  );
}

export function Sheet({ children, onClose, width }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet glass strong" style={width ? { width } : undefined}>{children}</div>
    </div>,
    document.body,
  );
}

export function ModIcon({ src, title, size }) {
  const [err, setErr] = useState(false);
  const letter = (title || '?').trim()[0];
  const style = size ? { width: size, height: size } : undefined;
  if (!src || err) {
    const hue = [...(title || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return <div className="mod-icon" style={{ ...style, background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 40) % 360} 65% 45%))`, fontWeight: 750, fontSize: 18, color: '#fff' }}>{letter}</div>;
  }
  return <div className="mod-icon" style={style}><img src={src} alt="" onError={() => setErr(true)} loading="lazy" /></div>;
}

export function fmtNum(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n || 0);
}

export function timeAgo(iso) {
  if (!iso) return 'Never played';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}

export function fmtHours(sec) {
  const h = (sec || 0) / 3600;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`;
}

export const LOADER_META = {
  vanilla: { label: 'Vanilla', color: 'linear-gradient(135deg,#8fd16a,#4f8f33)', desc: 'Pure Minecraft' },
  fabric: { label: 'Fabric', color: 'linear-gradient(135deg,#e8dcc0,#b5a27c)', desc: 'Lightweight mods' },
  quilt: { label: 'Quilt', color: 'linear-gradient(135deg,#c79bff,#7e4fd6)', desc: 'Fabric-compatible' },
  forge: { label: 'Forge', color: 'linear-gradient(135deg,#8aa0c8,#3e4d6e)', desc: 'Classic modding' },
  neoforge: { label: 'NeoForge', color: 'linear-gradient(135deg,#ffb067,#d96a1f)', desc: 'Modern Forge' },
  paper: { label: 'Paper', color: 'linear-gradient(135deg,#f3f3f3,#b9c0d0)', desc: 'Plugin server' },
  purpur: { label: 'Purpur', color: 'linear-gradient(135deg,#e2a3ff,#9b3fd6)', desc: 'Paper fork server' },
};
