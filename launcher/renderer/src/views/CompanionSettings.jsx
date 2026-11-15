import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api, features } from '../api';
import { Switch, Range, Segmented } from '../components/ui';

// "Built-in mods": the Saturn companion's modules plus the Performance pack.
function PerfPack({ instance }) {
  const [info, setInfo] = useState(null);
  const id = instance ? instance.id : null;
  useEffect(() => { if (api.perfPackInfo) api.perfPackInfo(id).then(setInfo).catch(() => {}); }, [id]);
  if (!info) return null;
  const toggle = async (v) => {
    if (id) setInfo(await api.setPerfPack(id, v));
    else { await api.setSettings({ performancePack: v }); setInfo({ ...info, global: v, on: v }); }
  };
  return (
    <div className="glass flat" style={{ padding: '13px 16px', borderRadius: 16, marginBottom: 16 }}>
      <div className="setting" style={{ padding: 0 }}>
        <div className="label"><b><Icon name="bolt" size={14} /> Performance pack</b><span>{info.supported ? 'Sodium and friends from Modrinth, installed for you.' : 'Needs a Fabric or Quilt client instance.'}</span></div>
        <Switch on={info.on} onChange={toggle} label="Performance pack" />
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {info.mods.map((m) => (
          <span key={m.projectId} className={`pill ${m.installed && m.enabled ? 'green' : ''}`} title={m.why}>{m.title}{m.version ? ` ${m.version}` : ''}</span>
        ))}
      </div>
    </div>
  );
}

export default function CompanionSettings({ app, instance }) {
  const [cfg, setCfg] = useState(null);
  const [standalone, setStandalone] = useState([]);
  const id = instance ? instance.id : null;
  useEffect(() => { api.getCompanion(id).then(setCfg); }, [id]);
  useEffect(() => { setStandalone([]); if (id && api.builtinModules) api.builtinModules(id).then((r) => setStandalone(r.standalone || [])).catch(() => {}); }, [id]);
  if (!cfg) return null;
  const set = (k, v) => { const next = { ...cfg, [k]: v }; setCfg(next); api.setCompanion(id, next); };
  const covered = Object.fromEntries(standalone.map((s) => [s.key, s.mods]));
  return (
    <div>
      <PerfPack instance={instance} />
      <div className="glass flat row" style={{ padding: '11px 14px', borderRadius: 16, marginBottom: 16, gap: 10 }}>
        <Icon name="info" size={17} style={{ color: 'var(--accent)' }} />
        <span className="muted" style={{ fontSize: 12.5 }}>Synced with the in-game menu: press <span className="kbd">Right Shift</span>. {instance ? `Editing ${instance.name}.` : 'Defaults for new instances.'}</span>
      </div>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        {features.groups.map((g) => (
          <div key={g.id}>
            <div className="group-title"><Icon name={g.icon} size={14} />{g.label}</div>
            <div className="group glass">
              {features.features.filter((f) => f.group === g.id && f.type !== 'layout').map((f) => (
                <div key={f.key} className="setting">
                  <div className="label">
                    <b>{f.label}{f.lunar && !/^none/i.test(f.lunar) && <i className="lunar-tag" title="Lunar Client equivalent">Lunar: {f.lunar}</i>}</b>
                    {covered[f.key] ? <span style={{ color: '#ffd36b' }}>Handled by {covered[f.key].join(', ')}; the built-in copy stays off.</span> : f.hint && <span>{f.hint}</span>}
                  </div>
                  {f.type === 'bool' && <Switch on={Boolean(cfg[f.key])} onChange={(v) => set(f.key, v)} label={f.label} />}
                  {f.type === 'number' && <Range value={cfg[f.key]} min={f.min} max={f.max} step={f.step} onChange={(v) => set(f.key, v)} format={(v) => (f.step < 1 ? v.toFixed(1) : v) + (f.key === 'hudScale' || f.key === 'zoomFactor' ? '×' : f.key === 'menuGlass' ? '%' : '')} />}
                  {f.type === 'color' && <input type="color" value={cfg[f.key]} onChange={(e) => set(f.key, e.target.value.toUpperCase())} />}
                  {f.type === 'choice' && <Segmented value={cfg[f.key]} options={f.options.map((o, i) => ({ value: o, label: (f.labels || [])[i] || o.charAt(0).toUpperCase() + o.slice(1) }))} onChange={(v) => set(f.key, v)} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
