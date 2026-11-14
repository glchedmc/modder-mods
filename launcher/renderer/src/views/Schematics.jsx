import { useCallback, useEffect, useState } from 'react';
import Icon from '../icons';
import { api, isElectron } from '../api';
import { ModIcon, fmtNum, Sheet, timeAgo } from '../components/ui';

export function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function ConfirmRemove({ file, onClose, onConfirm }) {
  return (
    <Sheet onClose={onClose} width={420}>
      <h2>Remove schematic?</h2>
      <p className="muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
        <b style={{ color: 'var(--text)' }}>{file.name}</b> will be deleted from this instance. The original file elsewhere is left alone.
      </p>
      <div className="foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger" onClick={onConfirm}><Icon name="trash" size={14} />Remove</button>
      </div>
    </Sheet>
  );
}

export default function Schematics({ app, instance }) {
  const inst = instance || app.selected;
  const [data, setData] = useState({ files: [], hasLitematica: true, suggestLitematica: false });
  const [loading, setLoading] = useState(true);
  const [dropOver, setDropOver] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ loading: false, hits: [], total: 0, error: null, started: false });
  const [busy, setBusy] = useState({});
  const [remove, setRemove] = useState(null);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    if (!inst) return;
    setLoading(true);
    try { setData(await api.listSchematics(inst.id)); } catch (e) { app.toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [inst && inst.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const addPaths = async (paths) => {
    if (!paths || !paths.length) return;
    try {
      const r = await api.addSchematics(inst.id, paths);
      setData(r);
      app.toast(r.added.length === 1 ? `Added ${r.added[0].split('/').pop()}` : `Added ${r.added.length} schematics`, 'ok');
    } catch (e) { app.toast(e.message, 'error'); }
  };

  const pick = async () => { await addPaths(await api.pickSchematicFiles()); };

  const onDrop = async (e) => {
    e.preventDefault();
    setDropOver(false);
    const paths = isElectron && window.glass.pathsFromFiles ? window.glass.pathsFromFiles(e.dataTransfer.files) : [];
    if (paths.length) await addPaths(paths);
    else app.toast('Couldn’t read those files. Use Add instead.', 'error');
  };

  const runSearch = async (q) => {
    setSearch((s) => ({ ...s, loading: true, error: null, started: true }));
    try {
      const r = await api.searchSchematics(q);
      setSearch({ loading: false, hits: r.hits, total: r.total, error: null, started: true, source: r.source });
    } catch (e) {
      setSearch({ loading: false, hits: [], total: 0, error: e.message, started: true });
    }
  };

  useEffect(() => {
    if (!search.started && !query) return undefined;
    const t = setTimeout(() => runSearch(query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query]);

  const downloadHit = async (hit, file) => {
    const f = file || hit.file;
    if (!f || !f.url) { if (hit.pageUrl) api.openUrl(hit.pageUrl); return; }
    setBusy((s) => ({ ...s, [hit.id + f.name]: true }));
    try {
      const r = await api.downloadSchematic(inst.id, f);
      setData(r);
      app.toast(`Downloaded ${f.name}`, 'ok');
    } catch (e) { app.toast(e.message, 'error'); }
    finally { setBusy((s) => ({ ...s, [hit.id + f.name]: false })); }
  };

  const confirmRemove = async () => {
    const file = remove;
    setRemove(null);
    try { setData(await api.removeSchematic(inst.id, file.rel)); app.toast(`Removed ${file.name}`, 'ok'); }
    catch (e) { app.toast(e.message, 'error'); }
  };

  const installLitematica = async () => {
    setBusy((s) => ({ ...s, litematica: true }));
    try {
      await app.installMod(inst, 'modrinth', { id: 'litematica', title: 'Litematica' });
      await refresh();
    } finally { setBusy((s) => ({ ...s, litematica: false })); }
  };

  if (!inst) {
    return <div className="glass card empty">Select or create an instance to manage its schematics.</div>;
  }

  const files = (data.files || []).filter((f) => !filter || f.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="schematics">
      {data.suggestLitematica && (
        <div className="upgrade-card glass" style={{ marginBottom: 16 }}>
          <div className="orb"><Icon name="layers" size={20} /></div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0 }}>Litematica isn’t installed</h4>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Install it to load .litematic files in this instance. WorldEdit also reads .schem files.</div>
          </div>
          <button className="btn primary" disabled={busy.litematica} onClick={installLitematica} title="Install Litematica from Modrinth">
            {busy.litematica ? 'Installing…' : 'Install Litematica'}
          </button>
        </div>
      )}

      <div className="row between" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ width: 240 }}><Icon name="search" size={15} /><input placeholder="Filter installed" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        <div className="row">
          <button className="btn" onClick={refresh} title="Refresh the list"><Icon name="refresh" size={15} />Refresh</button>
          <button className="btn primary" onClick={pick} title="Copy schematic files into this instance"><Icon name="plus" size={15} />Add</button>
        </div>
      </div>

      <div
        className={`glass dropzone ${dropOver ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDropOver(true); }}
        onDragLeave={() => setDropOver(false)}
        onDrop={onDrop}
        title="Drop .litematic, .schem, .schematic, .nbt or .zip files here"
      >
        <Icon name="download" size={16} />
        <span>Drop schematics here, or use Add to pick files. They go into the instance’s schematics folder.</span>
      </div>

      <div className="list glass stagger" style={{ marginTop: 12 }}>
        {loading && !files.length && <div className="empty">Loading schematics…</div>}
        {files.map((f) => (
          <div key={f.rel} className="list-row">
            <div className="mod-icon" style={{ background: 'linear-gradient(135deg, #8fd16a, #4f8f33)', color: '#fff', fontSize: 10, fontWeight: 750 }} title={f.ext}>.{f.ext}</div>
            <div className="grow">
              <b className="truncate" style={{ display: 'block' }} title={f.rel}>{f.name}</b>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{fmtBytes(f.size)} · {timeAgo(f.mtime).replace('played', 'added').replace('Never played', 'Just now')} · {f.folder}</div>
            </div>
            <button className="btn ghost sm icon-btn" title="Remove from this instance" onClick={() => setRemove(f)}><Icon name="trash" size={15} /></button>
          </div>
        ))}
        {!loading && files.length === 0 && <div className="empty">No schematics in this instance yet. Add some, or find new ones below.</div>}
      </div>

      <div className="group-title" style={{ marginTop: 22 }}>Find new ones</div>
      <div className="muted" style={{ fontSize: 12.5, margin: '-6px 2px 12px' }}>
        Search <a href="https://minemev.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>MineMev</a> and download straight into this instance. Builds come from MineMev, Choculaterie, RedenMC and MCodex.
      </div>
      <div className="filters">
        <div className="field" style={{ flex: 1, minWidth: 220, height: 38 }}>
          <Icon name="search" size={16} />
          <input placeholder="Search farms, houses, storage…" value={query} onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (!search.started) runSearch(query); }} />
        </div>
      </div>

      {search.error && <div className="glass card empty">Couldn’t search MineMev: {search.error}</div>}
      <div className="grid cols-2 stagger">
        {(search.loading && !search.hits.length ? Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, skeleton: true })) : search.hits).map((h) => {
          if (h.skeleton) return <div key={h.id} className="glass result-card" style={{ height: 112, opacity: 0.5 }} />;
          const file = h.file;
          const key = h.id + (file && file.name);
          return (
            <div key={h.id} className="glass result-card card hover">
              <ModIcon src={h.icon} title={h.title} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <b className="truncate" style={{ fontSize: 15, display: 'block' }} title={h.title}>{h.title}</b>
                    <span className="faint" style={{ fontSize: 12 }}>by {h.author || 'unknown'} · {h.vendor}</span>
                  </div>
                  {file && file.url
                    ? <button className="btn primary sm" disabled={busy[key]} onClick={() => downloadHit(h, file)} title="Download into this instance">
                        {busy[key] ? 'Saving…' : <><Icon name="download" size={14} />{file.size ? fmtBytes(file.size) : 'Download'}</>}
                      </button>
                    : <button className="btn sm" onClick={() => api.openUrl(h.pageUrl)} title="Open the page in your browser">Open page</button>}
                </div>
                <div className="summary">{h.summary}</div>
                <div className="meta">
                  <span title="Downloads"><Icon name="download" size={13} />{fmtNum(h.downloads)}</span>
                  {(h.tags || []).slice(0, 2).map((c) => <span key={c} className="pill" style={{ height: 19, fontWeight: 600 }}>{c}</span>)}
                  {(h.files || []).length > 1 && <span className="faint">{h.files.length} files</span>}
                </div>
                {(h.files || []).length > 1 && (
                  <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {h.files.map((f) => (
                      <button key={f.id || f.name} className="btn sm" disabled={busy[h.id + f.name]} onClick={() => downloadHit(h, f)} title={`Download ${f.name}`}>
                        {f.name}{f.size ? ` · ${fmtBytes(f.size)}` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {search.started && !search.loading && !search.error && search.hits.length === 0 && (
        <div className="empty">No builds matched that search.</div>
      )}
      {remove && <ConfirmRemove file={remove} onClose={() => setRemove(null)} onConfirm={confirmRemove} />}
    </div>
  );
}
