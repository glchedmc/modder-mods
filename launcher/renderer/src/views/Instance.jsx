import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api } from '../api';
import { InstanceArt } from '../components/art';
import { LOADER_META, ModIcon, Switch, Range, timeAgo } from '../components/ui';
import CompanionSettings from './CompanionSettings';
import Schematics from './Schematics';

function StatusPill({ c }) {
  if (!c) return <span className="pill green"><span className="dot" />Compatible</span>;
  if (c.status === 'update') return <span className="pill amber"><Icon name="arrowUp" size={11} />Update {c.latestName || ''}</span>;
  if (c.status === 'needs-port') return <span className="pill red"><span className="dot" />No 26.3 build</span>;
  if (c.status === 'ported') return <span className="pill violet"><Icon name="sparkles" size={11} />Ported by Grok</span>;
  if (c.status === 'unknown') return <span className="pill">Local file</span>;
  return <span className="pill green"><span className="dot" />Compatible</span>;
}

export default function Instance({ app }) {
  const inst = app.instances.find((i) => i.id === app.params.id) || app.selected;
  const [tab, setTab] = useState(app.params.tab || 'mods');
  const [q, setQ] = useState('');
  useEffect(() => { if (app.params.tab) setTab(app.params.tab); }, [app.params.tab]);
  if (!inst) return null;
  const mods = (inst.mods || []).filter((m) => !q || m.title.toLowerCase().includes(q.toLowerCase()));
  const loader = LOADER_META[inst.loader];
  const toggle = async (m, v) => { await api.toggleMod(inst.id, m.file, v); app.refresh(); };
  return (
    <div className="view-enter">
      <div className="glass" style={{ borderRadius: 26, overflow: 'hidden', display: 'flex', alignItems: 'stretch' }}>
        <div style={{ width: 230, minHeight: 130, position: 'relative' }}><InstanceArt instance={inst} height={130} /></div>
        <div style={{ flex: 1, padding: '18px 22px' }} className="col">
          <div className="row" style={{ gap: 8 }}><span className="pill">{inst.mcVersion}</span><span className="pill">{loader.label} {inst.loaderVersion || ''}</span>{inst.companion && <span className="pill violet"><Icon name="sparkles" size={11} />Companion</span>}</div>
          <h2 style={{ margin: '8px 0 2px', fontSize: 26, letterSpacing: '-0.02em' }}>{inst.name}</h2>
          <div className="faint" style={{ fontSize: 12.5 }}>{(inst.mods || []).length} mods · {timeAgo(inst.lastPlayed)}</div>
        </div>
        <div className="row" style={{ padding: 20, gap: 10 }}>
          <button className="btn icon-btn" title="Open folder" onClick={() => api.openFolder(inst.id)}><Icon name="folder" size={16} /></button>
          <button className="play-btn" style={{ height: 46, fontSize: 16, padding: '0 22px', borderRadius: 16 }} onClick={() => app.launch(inst)}><Icon name="play" size={18} />Play</button>
        </div>
      </div>

      <div className="tabs">
        {[['mods', 'Mods', 'cube'], ['schematics', 'Schematics', 'layers'], ['companion', 'Companion', 'sparkles'], ['settings', 'Game Settings', 'settings'], ['logs', 'Logs', 'terminal']].map(([k, l, ic]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon name={ic} size={15} />{l}</button>
        ))}
      </div>

      {tab === 'mods' && (
        <>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div className="field" style={{ width: 260 }}><Icon name="search" size={15} /><input placeholder="Filter installed mods" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="row">
              <button className="btn" onClick={() => app.checkMods(inst)}><Icon name="refresh" size={15} />Check for updates</button>
              <button className="btn primary" onClick={() => app.go('discover')}><Icon name="plus" size={15} />Add Mods</button>
            </div>
          </div>
          <div className="list glass stagger">
            {mods.map((m) => {
              const c = app.compat[m.file] || (m.source === 'companion' ? { status: 'ok' } : null);
              return (
                <div key={m.file} className="list-row">
                  <ModIcon src={m.icon} title={m.title} />
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}><b className="truncate">{m.title}</b><span className="faint" style={{ fontSize: 12 }}>{m.versionName}</span></div>
                    <div className="faint truncate" style={{ fontSize: 12, marginTop: 2 }}>{m.file}{m.dependencyOf ? ' · dependency' : ''}</div>
                  </div>
                  <StatusPill c={c} />
                  {c && c.status === 'needs-port' && <button className="btn grok sm" onClick={() => app.startPort(inst, m)}><Icon name="sparkles" size={14} />Upgrade to {inst.mcVersion}</button>}
                  {c && c.status === 'update' && <button className="btn sm" onClick={() => app.toast(`Updating ${m.title}…`)}><Icon name="download" size={14} />Update</button>}
                  {m.source !== 'companion' && <Switch on={m.enabled !== false} onChange={(v) => toggle(m, v)} label={`Enable ${m.title}`} />}
                  {m.source !== 'companion' && <button className="btn ghost sm icon-btn" onClick={async () => { await api.removeMod(inst.id, m.file); app.refresh(); }}><Icon name="trash" size={15} /></button>}
                </div>
              );
            })}
            {mods.length === 0 && <div className="empty">No mods yet. <a style={{ color: 'var(--accent)' }} onClick={() => app.go('discover')}>Browse mods</a></div>}
          </div>
        </>
      )}

      {tab === 'schematics' && <Schematics app={app} instance={inst} />}

      {tab === 'companion' && <CompanionSettings app={app} instance={inst} />}

      {tab === 'settings' && (
        <div className="group glass">
          <div className="setting"><div className="label"><b>Memory</b><span>How much RAM Minecraft may use.</span></div>
            <Range value={inst.memoryMb} min={1024} max={16384} step={512} onChange={(v) => app.updateInstance(inst.id, { memoryMb: v })} format={(v) => `${(v / 1024).toFixed(1)} GB`} /></div>
          <div className="setting"><div className="label"><b>Java arguments</b><span>Advanced. Added after memory flags.</span></div>
            <div className="field" style={{ width: 300 }}><input defaultValue={inst.jvmArgs || ''} placeholder="-XX:+UseZGC" onBlur={(e) => app.updateInstance(inst.id, { jvmArgs: e.target.value })} /></div></div>
          <div className="setting"><div className="label"><b>Glass Companion</b><span>HUD, zoom and tooltip features (Fabric/Quilt 26.3).</span></div>
            <Switch on={inst.companion} onChange={(v) => app.updateInstance(inst.id, { companion: v })} /></div>
          <div className="setting"><div className="label"><b>Delete instance</b><span>Removes worlds, mods and settings in this instance.</span></div>
            <button className="btn danger" onClick={() => app.removeInstance(inst.id)}><Icon name="trash" size={15} />Delete</button></div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="console">{(app.logs[inst.id] || ['No game output yet. Launch the instance to see its log here.']).map((l, i) => <div key={i}>{l}</div>)}</div>
      )}
    </div>
  );
}
