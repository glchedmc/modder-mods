import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api, features } from '../api';
import { Switch, Range } from '../components/ui';

export default function CompanionSettings({ app, instance }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.getCompanion(instance ? instance.id : null).then(setCfg); }, [instance && instance.id]);
  if (!cfg) return null;
  const set = (k, v) => { const next = { ...cfg, [k]: v }; setCfg(next); api.setCompanion(instance ? instance.id : null, next); };
  return (
    <div>
      <div className="glass flat row" style={{ padding: '11px 14px', borderRadius: 16, marginBottom: 16, gap: 10 }}>
        <Icon name="info" size={17} style={{ color: 'var(--accent)' }} />
        <span className="muted" style={{ fontSize: 12.5 }}>These sync with the in-game menu: press <span className="kbd">Right Shift</span> in Minecraft. {instance ? `Editing ${instance.name}.` : 'Defaults for new instances.'}</span>
      </div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        {features.groups.map((g) => (
          <div key={g.id}>
            <div className="group-title"><Icon name={g.icon} size={14} />{g.label}</div>
            <div className="group glass">
              {features.features.filter((f) => f.group === g.id).map((f) => (
                <div key={f.key} className="setting">
                  <div className="label"><b>{f.label}</b>{f.hint && <span>{f.hint}</span>}</div>
                  {f.type === 'bool' && <Switch on={Boolean(cfg[f.key])} onChange={(v) => set(f.key, v)} label={f.label} />}
                  {f.type === 'number' && <Range value={cfg[f.key]} min={f.min} max={f.max} step={f.step} onChange={(v) => set(f.key, v)} format={(v) => (f.step < 1 ? v.toFixed(1) : v) + (f.key === 'hudScale' ? '×' : f.key === 'zoomFactor' ? '×' : '')} />}
                  {f.type === 'color' && <input type="color" value={cfg[f.key]} onChange={(e) => set(f.key, e.target.value.toUpperCase())} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
