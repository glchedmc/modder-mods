import { useEffect, useRef, useState } from 'react';
import Icon from '../icons';
import { api } from '../api';
import { ModIcon, Segmented, Switch, fmtNum, LOADER_META } from '../components/ui';

const TYPES = [['mod', 'Mods', 'cube'], ['resourcepack', 'Resource Packs', 'image'], ['shader', 'Shaders', 'sparkles'], ['modpack', 'Modpacks', 'box'], ['plugin', 'Plugins', 'server'], ['datapack', 'Data Packs', 'layers']];

export default function Discover({ app }) {
  const inst = app.selected;
  const [source, setSource] = useState('modrinth');
  const [type, setType] = useState(inst && inst.type === 'server' ? 'plugin' : 'mod');
  const [query, setQuery] = useState(app.params.q || '');
  const [sort, setSort] = useState('relevance');
  const [onlyCompatible, setOnlyCompatible] = useState(true);
  const [state, setState] = useState({ loading: true, hits: [], total: 0, error: null });
  const [installing, setInstalling] = useState({});
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const r = await api.searchMods({ source, query, projectType: type, loader: inst && inst.loader, gameVersion: inst ? inst.mcVersion : '26.3', sort, versionFilter: onlyCompatible });
        setState({ loading: false, hits: r.hits, total: r.total, error: null });
      } catch (e) {
        setState({ loading: false, hits: [], total: 0, error: e });
      }
    }, 250);
  }, [source, type, query, sort, onlyCompatible, inst && inst.id]);

  const installed = new Set((inst && inst.mods || []).map((m) => m.projectId));
  const install = async (h) => {
    setInstalling((s) => ({ ...s, [h.id]: true }));
    try { await app.installMod(inst, source, h); } finally { setInstalling((s) => ({ ...s, [h.id]: false })); }
  };
  const target = inst ? inst.mcVersion : '26.3';

  return (
    <div className="view-enter">
      <div className="filters">
        <Segmented value={source} onChange={setSource} options={[{ value: 'modrinth', label: 'Modrinth' }, { value: 'curseforge', label: 'CurseForge' }]} />
        <div className="field" style={{ flex: 1, minWidth: 220, height: 38 }}><Icon name="search" size={16} /><input placeholder={`Search ${source === 'modrinth' ? 'Modrinth' : 'CurseForge'}…`} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="field" style={{ width: 160, height: 38 }}><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="relevance">Relevance</option><option value="downloads">Most downloaded</option><option value="follows">Most followed</option><option value="updated">Recently updated</option><option value="newest">Newest</option></select><Icon name="chevronDown" size={14} /></div>
      </div>
      <div className="filters">
        {TYPES.map(([k, l, ic]) => <button key={k} className={`chip ${type === k ? 'on' : ''}`} onClick={() => setType(k)}><Icon name={ic} size={14} />{l}</button>)}
        <div style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12.5 }}>Only {target} builds</span>
        <Switch on={onlyCompatible} onChange={setOnlyCompatible} label="Only compatible" />
      </div>
      {inst && <div className="faint" style={{ fontSize: 12.5, margin: '-4px 2px 14px' }}>Installing into <b style={{ color: 'var(--text)' }}>{inst.name}</b> · {LOADER_META[inst.loader].label} {inst.mcVersion}{!onlyCompatible ? ` · mods without a ${target} build can be upgraded by Grok` : ''}</div>}

      {state.error && state.error.code === 'NO_KEY' ? (
        <div className="glass card empty">
          <Icon name="key" size={30} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: '10px 0 4px' }}>Connect CurseForge</h3>
          <p className="muted" style={{ maxWidth: 420, margin: '0 auto 16px' }}>CurseForge requires a free API key from console.curseforge.com. It's stored in your Keychain and never leaves this Mac except to talk to CurseForge.</p>
          <button className="btn primary" onClick={() => app.go('settings', { section: 'keys' })}>Add API Key</button>
        </div>
      ) : state.error ? (
        <div className="glass card empty">Couldn't load results: {state.error.message}</div>
      ) : (
        <div className="grid cols-2 stagger">
          {(state.loading && !state.hits.length ? Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, skeleton: true })) : state.hits).map((h) => {
            if (h.skeleton) return <div key={h.id} className="glass result-card" style={{ height: 112, opacity: 0.5 }} />;
            const compatible = !h.versions || h.versions.length === 0 || h.versions.includes(target);
            const has = installed.has(h.id);
            return (
              <div key={h.id} className="glass result-card card hover">
                <ModIcon src={h.icon} title={h.title} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}><b className="truncate" style={{ fontSize: 15, display: 'block' }}>{h.title}</b><span className="faint" style={{ fontSize: 12 }}>by {h.author}</span></div>
                    {has ? <span className="pill green"><Icon name="check" size={12} />Installed</span>
                      : compatible ? <button className="btn primary sm" disabled={!inst || installing[h.id]} onClick={() => install(h)}>{installing[h.id] ? 'Installing…' : <><Icon name="download" size={14} />Install</>}</button>
                        : <button className="btn grok sm" disabled={!inst} onClick={() => app.startPort(inst, { title: h.title, projectId: h.id, source, from: h.versions[h.versions.length - 1], icon: h.icon })}><Icon name="sparkles" size={14} />Upgrade to {target}</button>}
                  </div>
                  <div className="summary">{h.summary}</div>
                  <div className="meta">
                    <span><Icon name="download" size={13} />{fmtNum(h.downloads)}</span>
                    <span><Icon name="heart" size={13} />{fmtNum(h.follows)}</span>
                    {!compatible && <span className="pill red" style={{ height: 19 }}>Latest: {h.versions[h.versions.length - 1]}</span>}
                    {(h.categories || []).slice(0, 2).map((c) => <span key={c} className="pill" style={{ height: 19, fontWeight: 600, textTransform: 'capitalize' }}>{c}</span>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!state.loading && !state.error && state.hits.length === 0 && <div className="empty">No results. Try turning off "Only {target} builds" to find mods Grok can upgrade.</div>}
    </div>
  );
}
