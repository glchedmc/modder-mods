import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api, isElectron } from '../api';
import { InstanceCover, BackgroundPicker } from '../components/backgrounds';
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

function RenameRow({ mod, onSave, onCancel }) {
  const [name, setName] = useState(mod.displayName || mod.title);
  const [renameFile, setRenameFile] = useState(false);
  const [file, setFile] = useState(mod.file.replace(/\.jar$/i, ''));
  const save = () => onSave({ name: name.trim() === mod.title ? null : name, ...(renameFile ? { fileName: file } : {}) });
  const key = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); };
  return (
    <div className="grow rename-row">
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}><Icon name="pencil" size={14} /><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={key} placeholder={mod.title} aria-label="Display name" /></div>
        <button className="btn primary sm" onClick={save}>Save</button>
        <button className="btn sm ghost" onClick={onCancel}>Cancel</button>
      </div>
      <label className="row faint rename-file" style={{ gap: 8, marginTop: 6, fontSize: 12 }} title="Renames the .jar on disk too">
        <input type="checkbox" checked={renameFile} onChange={(e) => setRenameFile(e.target.checked)} disabled={mod.source === 'companion'} />Rename file too
        {renameFile && <span className="field" style={{ height: 28, flex: 1 }}><input value={file} onChange={(e) => setFile(e.target.value)} onKeyDown={key} spellCheck={false} aria-label="File name" /><span className="faint">.jar</span></span>}
      </label>
    </div>
  );
}

export default function Instance({ app }) {
  const inst = app.instances.find((i) => i.id === app.params.id) || app.selected;
  const [tab, setTab] = useState(app.params.tab || 'mods');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  useEffect(() => { if (app.params.tab) setTab(app.params.tab); }, [app.params.tab]);
  if (!inst) return null;
  const mods = (inst.mods || []).filter((m) => !q || `${m.displayName || ''} ${m.title}`.toLowerCase().includes(q.toLowerCase()));
  const undoWith = (newFile, undo) => async () => { try { await api.renameMod(inst.id, newFile, undo); app.refresh(); app.toast('Undone', 'ok'); } catch (e) { app.toast(e.message, 'error'); } };
  const rename = async (m, opts) => {
    try {
      const r = await api.renameMod(inst.id, m.file, opts);
      setEditing(null); app.refresh();
      app.toast(`Renamed to ${r.mod.displayName || r.mod.title}`, 'ok', { label: 'Undo', run: undoWith(r.mod.file, r.undo) });
    } catch (e) { app.toast(e.message, 'error'); }
  };
  const reset = async (m) => {
    try { const r = await api.resetModName(inst.id, m.file); app.refresh(); app.toast(`Reset to ${r.mod.title}`, 'ok', { label: 'Undo', run: undoWith(r.mod.file, r.undo) }); } catch (e) { app.toast(e.message, 'error'); }
  };
  const loader = LOADER_META[inst.loader];
  const toggle = async (m, v) => { await api.toggleMod(inst.id, m.file, v); app.refresh(); };
  return (
    <div className="view-enter">
      <div className="glass" style={{ borderRadius: 26, overflow: 'hidden', display: 'flex', alignItems: 'stretch' }}>
        <div style={{ width: 230, minHeight: 130, position: 'relative' }}><InstanceCover instance={inst} settings={app.settings} height={130} /></div>
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
                  {editing === m.file ? <RenameRow mod={m} onSave={(o) => rename(m, o)} onCancel={() => setEditing(null)} /> : (
                  <div className="grow" onDoubleClick={() => setEditing(m.file)}>
                    <div className="row" style={{ gap: 8 }}><b className="truncate">{m.displayName || m.title}</b><span className="faint" style={{ fontSize: 12 }}>{m.versionName}</span>{(m.displayName || m.originalFile) && <span className="pill renamed" title={`Original: ${m.title}${m.originalFile ? ` · ${m.originalFile}` : ''}`}>Renamed</span>}</div>
                    <div className="faint truncate" style={{ fontSize: 12, marginTop: 2 }}>{m.file}{m.displayName ? ` · ${m.title}` : ''}{m.dependencyOf ? ' · dependency' : ''}</div>
                  </div>)}
                  <StatusPill c={c} />
                  {c && c.status === 'needs-port' && <button className="btn grok sm" onClick={() => app.startPort(inst, m)}><Icon name="sparkles" size={14} />Upgrade to {inst.mcVersion}</button>}
                  {c && c.status === 'update' && <button className="btn sm" onClick={() => app.toast(`Updating ${m.title}…`)}><Icon name="download" size={14} />Update</button>}
                  {editing !== m.file && (m.displayName || m.originalFile) && <button className="btn ghost sm icon-btn" title="Reset name" onClick={() => reset(m)}><Icon name="reset" size={15} /></button>}
                  {editing !== m.file && <button className="btn ghost sm icon-btn" title="Rename" onClick={() => setEditing(m.file)}><Icon name="pencil" size={15} /></button>}
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
        <>
        <div className="group-title">Cover</div>
        <div className="group glass" style={{ padding: '14px 16px 8px' }}>
          <BackgroundPicker
            compact
            includeInherit
            includeArt
            instance={inst}
            settings={app.settings}
            value={inst.background || 'art'}
            custom={inst.customBackground}
            solid={inst.backgroundSolid || app.settings.backgroundSolid}
            onSelect={(id) => app.updateInstance(inst.id, { background: id })}
            onSolidColor={(c) => app.updateInstance(inst.id, { background: 'solid-custom', backgroundSolid: c })}
            onImport={async () => {
              if (!isElectron) { app.toast('Add a file in the installed app'); return; }
              const filePath = await api.pickBackgroundFile();
              if (!filePath) return;
              try {
                const meta = await api.importBackground(filePath);
                if (inst.customBackground && inst.customBackground.file) await api.removeBackgroundFile(inst.customBackground.file).catch(() => {});
                await app.updateInstance(inst.id, { background: 'custom', customBackground: meta });
              } catch (e) { app.toast(e.message, 'error'); }
            }}
            onRemoveCustom={async () => {
              if (inst.customBackground && inst.customBackground.file) await api.removeBackgroundFile(inst.customBackground.file).catch(() => {});
              await app.updateInstance(inst.id, { background: inst.background === 'custom' ? 'art' : inst.background, customBackground: null });
            }}
          />
        </div>
        <div className="group-title">Game</div>
        <div className="group glass">
          <div className="setting"><div className="label"><b>Memory</b><span>How much RAM Minecraft may use.</span></div>
            <Range value={inst.memoryMb} min={1024} max={16384} step={512} onChange={(v) => app.updateInstance(inst.id, { memoryMb: v })} format={(v) => `${(v / 1024).toFixed(1)} GB`} /></div>
          <div className="setting"><div className="label"><b>Java arguments</b><span>Advanced. Added after memory flags.</span></div>
            <div className="field" style={{ width: 300 }}><input defaultValue={inst.jvmArgs || ''} placeholder="-XX:+UseZGC" onBlur={(e) => app.updateInstance(inst.id, { jvmArgs: e.target.value })} /></div></div>
          <div className="setting"><div className="label"><b>Saturn Companion</b><span>HUD, zoom, tooltips and cosmetics (Fabric/Quilt 26.3).</span></div>
            <Switch on={inst.companion} onChange={(v) => app.updateInstance(inst.id, { companion: v })} /></div>
          <div className="setting"><div className="label"><b>Delete instance</b><span>Removes worlds, mods and settings in this instance.</span></div>
            <button className="btn danger" onClick={() => app.removeInstance(inst.id)}><Icon name="trash" size={15} />Delete</button></div>
        </div>
        </>
      )}

      {tab === 'logs' && (
        <div className="console">{(app.logs[inst.id] || ['No game output yet. Launch the instance to see its log here.']).map((l, i) => <div key={i}>{l}</div>)}</div>
      )}
    </div>
  );
}
