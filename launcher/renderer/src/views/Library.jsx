import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api } from '../api';
import { InstanceCover } from '../components/backgrounds';
import { LOADER_META, Sheet, timeAgo, Segmented } from '../components/ui';

const ICONS = { grass: 'cube', sword: 'target', brush: 'palette', server: 'server' };

export function NewInstanceSheet({ onClose, onCreate, defaults }) {
  const [name, setName] = useState('');
  const [loader, setLoader] = useState(defaults.loader || 'fabric');
  const [versions, setVersions] = useState([]);
  const [mc, setMc] = useState(defaults.version || '26.3');
  const [loaderVersions, setLoaderVersions] = useState([]);
  const [loaderVersion, setLoaderVersion] = useState('');
  const [eula, setEula] = useState(false);
  const server = loader === 'paper' || loader === 'purpur' || loader === 'fabric-server';
  const [avail, setAvail] = useState(null); // { fabric: true, forge: false, ... } for the chosen version
  const showSnapshots = Boolean(defaults.showSnapshots);
  const showOld = Boolean(defaults.showOldVersions);
  useEffect(() => { api.listVersions({ snapshots: showSnapshots, old: showOld }).then(setVersions).catch(() => {}); }, [showSnapshots, showOld]);
  const mcType = (versions.find((v) => v.id === mc) || {}).type || 'release';
  useEffect(() => {
    let live = true;
    setAvail(null);
    (api.loadersFor ? api.loadersFor(mc) : Promise.resolve(null)).then((a) => { if (live) setAvail(a); }).catch(() => {});
    return () => { live = false; };
  }, [mc]);
  // Server software only ships for releases; Fabric server follows Fabric.
  const has = (k) => {
    if (k === 'vanilla') return true;
    if (k === 'paper' || k === 'purpur') return mcType === 'release';
    if (!avail) return true; // still checking
    if (k === 'fabric-server') return avail.fabric !== false;
    return avail[k] !== false;
  };
  useEffect(() => { if (!has(loader)) setLoader('vanilla'); }, [avail, mcType]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLoaderVersions([]); setLoaderVersion('');
    if (loader === 'vanilla') return;
    api.loaderVersions(loader, mc).then((v) => { setLoaderVersions(v); setLoaderVersion((v.find((x) => x.stable) || v[0] || {}).version || ''); }).catch(() => {});
  }, [loader, mc]);
  const create = () => onCreate({ name: name || `${LOADER_META[loader].label} ${mc}`, loader, mcVersion: mc, loaderVersion: loaderVersion || null, eula });
  return (
    <Sheet onClose={onClose} width={640}>
      <h2>New Instance</h2>
      <div className="muted">Pick a loader and version. Everything else is downloaded for you.</div>
      <label className="form-label">Loader</label>
      <div className="loader-grid">
        {Object.entries(LOADER_META).map(([k, m]) => (
          <div key={k} className={`loader-tile ${loader === k ? 'on' : ''} ${has(k) ? '' : 'off'}`} title={has(k) ? m.desc : `No ${m.label} build for ${mc}`} onClick={() => has(k) && setLoader(k)}>
            <div className="lt-icon" style={{ background: m.color }}><Icon name={k === 'paper' || k === 'purpur' || k === 'fabric-server' ? 'server' : 'cube'} size={18} style={{ color: '#fff' }} /></div>
            <b>{m.label}</b><span>{m.desc}</span>
          </div>
        ))}
        <div className="loader-tile" style={{ opacity: 0.6 }}><div className="lt-icon" style={{ background: 'rgba(255,255,255,.15)' }}><Icon name="box" size={18} /></div><b>Modpack</b><span>From Discover</span></div>
      </div>
      <div className="grid cols-2">
        <div>
          <label className="form-label">Name</label>
          <div className="field"><input placeholder={`${LOADER_META[loader].label} ${mc}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        </div>
        <div>
          <label className="form-label">Minecraft version</label>
          <div className="field"><select value={mc} onChange={(e) => setMc(e.target.value)}>{(versions.length ? versions : [{ id: mc }]).map((v) => <option key={v.id} value={v.id}>{v.id}{v.id === '26.3' ? ' (latest)' : v.type === 'snapshot' ? ' (snapshot)' : v.type === 'old_beta' ? ' (beta)' : v.type === 'old_alpha' ? ' (alpha)' : ''}</option>)}</select><Icon name="chevronDown" size={14} /></div>
        </div>
      </div>
      {loader !== 'vanilla' && (
        <>
          <label className="form-label">{server ? 'Build' : `${LOADER_META[loader].label} version`}</label>
          <div className="field"><select value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
            {loaderVersions.length === 0 && <option value="">Latest available</option>}
            {loaderVersions.map((v) => <option key={v.version} value={v.version}>{v.version}{v.stable ? '' : ' (beta)'}</option>)}
          </select><Icon name="chevronDown" size={14} /></div>
        </>
      )}
      {server && (
        <div className="row" style={{ marginTop: 14, gap: 10 }}>
          <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} id="eula" />
          <label htmlFor="eula" className="muted" style={{ fontSize: 12.5 }}>I agree to the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Minecraft EULA</a> (required to run a server).</label>
        </div>
      )}
      {(loader === 'fabric' || loader === 'quilt') && mc === '26.3' && (
        <div className="glass flat" style={{ marginTop: 16, padding: '11px 14px', borderRadius: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Icon name="sparkles" size={18} style={{ color: '#c4b2ff' }} />
          <span style={{ fontSize: 12.5 }} className="muted">Saturn Companion and Fabric API will be installed for HUD, zoom, compact tooltips and more.</span>
        </div>
      )}
      <div className="foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={create} disabled={server && !eula}>Create</button>
      </div>
    </Sheet>
  );
}

export default function Library({ app }) {
  const { instances, selected, setSelected, go, params } = app;
  const [creating, setCreating] = useState(Boolean(params.create));
  const [filter, setFilter] = useState('all');
  const shown = instances.filter((i) => filter === 'all' || (filter === 'servers' ? i.type === 'server' : i.type === 'client'));
  return (
    <div className="view-enter">
      <div className="row between" style={{ marginBottom: 16 }}>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'clients', label: 'Game', icon: 'cube' }, { value: 'servers', label: 'Servers', icon: 'server' }]} />
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New Instance</button>
      </div>
      <div className="grid auto stagger">
        {shown.map((i) => (
          <div key={i.id} className={`glass card hover instance-card ${selected && selected.id === i.id ? 'selected' : ''}`}
            onClick={() => setSelected(i.id)} onDoubleClick={() => go('instance', { id: i.id })}>
            <div className="cover"><InstanceCover instance={i} settings={app.settings} /></div>
            <div className="icon" style={{ background: LOADER_META[i.loader].color }}><Icon name={ICONS[i.icon] || 'cube'} size={22} style={{ color: '#fff' }} /></div>
            <div className="body">
              <div className="row between"><h4 className="truncate">{i.name}</h4><button className="btn ghost sm icon-btn" onClick={(e) => { e.stopPropagation(); go('instance', { id: i.id }); }}><Icon name="chevron" size={16} /></button></div>
              <div className="row" style={{ marginTop: 6, gap: 6 }}>
                <span className="pill">{i.mcVersion}</span><span className="pill">{LOADER_META[i.loader].label}</span>
                {i.type === 'client' && <span className="faint" style={{ fontSize: 12 }}>{(i.mods || []).length} mods</span>}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>{timeAgo(i.lastPlayed)}</div>
            </div>
          </div>
        ))}
        <div className="glass card hover new-card" onClick={() => setCreating(true)}>
          <div><div className="plus"><Icon name="plus" size={22} /></div>New Instance<div className="faint" style={{ fontSize: 12, fontWeight: 500, marginTop: 3 }}>Vanilla, Fabric, Quilt, Forge, NeoForge, Paper, Purpur</div></div>
        </div>
      </div>
      {creating && <NewInstanceSheet defaults={{ loader: app.settings.defaultLoader, version: app.settings.defaultVersion, showSnapshots: app.settings.showSnapshots, showOldVersions: app.settings.showOldVersions }} onClose={() => setCreating(false)} onCreate={async (p) => { setCreating(false); await app.createInstance(p); }} />}
    </div>
  );
}
