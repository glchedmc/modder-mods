import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './icons';
import { api, on, isElectron, features } from './api';
import { Wallpaper } from './components/art';
import Home from './views/Home';
import Library from './views/Library';
import Instance from './views/Instance';
import Discover from './views/Discover';
import Studio from './views/Studio';
import Settings from './views/Settings';
import Schematics from './views/Schematics';

const NAV = [
  ['home', 'Play', 'home'],
  ['library', 'Library', 'library'],
  ['discover', 'Discover', 'discover'],
  ['schematics', 'Schematics', 'layers'],
  ['studio', 'Grok Studio', 'sparkles'],
  ['settings', 'Settings', 'settings'],
];
const TITLES = {
  home: ['Play', null], library: ['Library', 'Your instances and servers'], discover: ['Discover', 'Mods, packs and shaders from every platform'],
  schematics: ['Schematics', 'Builds for the selected instance'],
  studio: ['Grok Studio', 'Upgrade mods to the latest Minecraft'], settings: ['Settings', null], instance: ['Instance', null],
};

function parseHash() {
  const [route, query] = (window.location.hash.replace(/^#\/?/, '') || 'home').split('?');
  return { route: route || 'home', params: Object.fromEntries(new URLSearchParams(query || '')) };
}

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; }

export default function App() {
  const [{ route, params }, setNav] = useState(parseHash());
  const [settings, setSettings] = useState(null);
  const [secrets, setSecrets] = useState({});
  const [instances, setInstances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [compat, setCompat] = useState({});
  const [launchState, setLaunchState] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [logs, setLogs] = useState({});
  const [jobsRunning, setJobsRunning] = useState(0);

  const go = useCallback((r, p = {}) => {
    const q = new URLSearchParams(p).toString();
    window.location.hash = `/${r}${q ? `?${q}` : ''}`;
  }, []);
  useEffect(() => { const f = () => setNav(parseHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refresh = useCallback(async () => {
    const [s, sec, inst, acc, jobs] = await Promise.all([api.getSettings(), api.secretStatus(), api.listInstances(), api.listAccounts(), api.listJobs()]);
    setSettings(s); setSecrets(sec); setInstances(inst); setAccounts(acc); setJobsRunning(jobs.filter((j) => j.state === 'running').length);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const selected = useMemo(() => {
    if (!settings) return null;
    return instances.find((i) => i.id === settings.selectedInstance) || instances[0] || null;
  }, [instances, settings]);

  useEffect(() => { if (selected) api.checkMods(selected.id).then(setCompat).catch(() => {}); }, [selected && selected.id]);

  useEffect(() => {
    const offs = [
      on('launch:progress', (p) => setLaunchState((s) => ({ ...(s || {}), ...p, state: 'preparing' }))),
      on('launch:state', (p) => { setLaunchState((s) => ({ ...(s || {}), ...p })); if (p.state === 'exited' || p.state === 'error') { setTimeout(() => setLaunchState(null), 400); if (p.error) toast(p.error, 'error'); refresh(); } }),
      on('launch:log', ({ id, line }) => setLogs((l) => ({ ...l, [id]: [...(l[id] || []).slice(-1500), line] }))),
      on('grok:job', (job) => { if (job.state !== 'running') { toast(job.state === 'done' ? `${job.title} upgraded to ${job.to} and installed` : `${job.title}: upgrade ${job.state}`, job.state === 'done' ? 'ok' : 'error'); refresh(); } }),
      on('auth:update', (u) => { if (u.state === 'done') { toast(`Signed in as ${u.name}`, 'ok'); refresh(); } else if (u.state === 'error') toast(u.error, 'error'); }),
    ];
    return () => offs.forEach((f) => f && f());
  }, [toast, refresh]);

  // Theme + accent + glass intensity.
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-rgb', hexToRgb(settings.accent));
    root.style.setProperty('--glass-blur', `${Math.round(10 + settings.glassIntensity * 30)}px`);
    document.body.classList.toggle('reduce-motion', settings.reduceMotion);
  }, [settings]);

  if (!settings) return <Wallpaper />;

  const app = {
    route, params, go, settings, secrets, instances, selected, accounts, account: accounts[0] || null, compat, launchState, logs, toast, refresh,
    featureCount: features.features.filter((f) => f.type === 'bool').length,
    setSelected: async (id) => { setSettings(await api.setSettings({ selectedInstance: id })); if (route !== 'home' && route !== 'library') go('home'); },
    saveSettings: async (patch) => setSettings(await api.setSettings(patch)),
    setSecret: async (name, value) => { setSecrets(await api.setSecret(name, value)); toast(value ? 'Saved to Keychain' : 'Key removed', 'ok'); },
    createInstance: async (p) => { try { const inst = await api.createInstance(p); await api.setSettings({ selectedInstance: inst.id }); await refresh(); toast(`${inst.name} is ready`, 'ok'); go('home'); } catch (e) { toast(e.message, 'error'); } },
    updateInstance: async (id, patch) => { await api.updateInstance(id, patch); refresh(); },
    removeInstance: async (id) => { await api.removeInstance(id); await refresh(); go('library'); },
    launch: async (inst) => { setLaunchState({ id: inst.id, state: 'preparing', phase: 'Preparing', done: 0, total: 1 }); try { await api.launch(inst.id); } catch (e) { setLaunchState(null); toast(e.message, 'error'); } },
    checkMods: async (inst) => { setCompat(await api.checkMods(inst.id)); toast('Checked for updates', 'ok'); },
    installMod: async (inst, source, hit) => {
      try { const r = await api.installMod(inst.id, source, hit.id, hit.title); toast(`Installed ${hit.title}${r.added.length > 1 ? ` + ${r.added.length - 1} dependenc${r.added.length > 2 ? 'ies' : 'y'}` : ''}`, 'ok'); if (r.missing && r.missing.length) toast(`${r.missing.length} required dependency has no ${inst.mcVersion} build`, 'error'); refresh(); } catch (e) { toast(e.message, 'error'); }
    },
    startPort: async (inst, mod) => {
      if (!secrets.xaiApiKey && isElectron) { toast('Add your xAI key in Settings', 'error'); go('settings', { section: 'keys' }); return; }
      const job = await api.startPort(inst.id, mod); go('studio', { job: job.id });
    },
  };

  const [title, sub] = TITLES[route] || TITLES.home;
  const views = { home: Home, library: Library, instance: Instance, discover: Discover, schematics: Schematics, studio: Studio, settings: Settings };
  const View = views[route] || Home;
  const isMac = isElectron && navigator.userAgent.includes('Mac');

  return (
    <>
      <Wallpaper />
      <div className={`app ${isMac ? 'mac' : ''}`}>
        <aside className="sidebar glass">
          <div className="traffic"><i /><i /><i /></div>
          <div className="brand"><div className="logo" /><div><b>Glass</b><small>Minecraft Launcher</small></div></div>
          <nav className="nav">
            {NAV.map(([k, label, icon]) => (
              <button key={k} className={route === k || (k === 'library' && route === 'instance' && params.tab !== 'schematics') || (k === 'schematics' && route === 'instance' && params.tab === 'schematics') ? 'active' : ''} onClick={() => go(k)}>
                <Icon name={icon} size={18} />{label}
                {k === 'studio' && jobsRunning > 0 && <span className="badge">{jobsRunning}</span>}
              </button>
            ))}
          </nav>
          <div className="nav-label">Instances</div>
          <nav className="nav">
            {instances.slice(0, 4).map((i) => (
              <button key={i.id} className={selected && selected.id === i.id && route === 'home' ? 'active' : ''} onClick={() => app.setSelected(i.id).then(() => go('home'))}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: i.accent, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5)', flex: 'none' }} />
                <span className="truncate">{i.name}</span>
              </button>
            ))}
          </nav>
          <div className="spacer" />
          <div className="account-chip glass flat" onClick={() => go('settings', { section: 'keys' })}>
            <div className="avatar">{app.account ? app.account.name[0] : <Icon name="user" size={16} />}</div>
            <div className="meta"><b className="truncate">{app.account ? app.account.name : 'Not signed in'}</b><span>{app.account ? 'Microsoft account' : 'Sign in to play online'}</span></div>
          </div>
        </aside>

        <main className="main">
          <header className="toolbar">
            <div>
              <h1>{route === 'instance' && selected ? 'Instance' : title}</h1>
              {sub && <div className="sub">{sub}</div>}
            </div>
            <div className="grow" />
            {launchState && launchState.state !== 'running' && route !== 'home' && (
              <div className="activity glass flat"><span className="spinner" /><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{launchState.phase}</div><div className="progress" style={{ marginTop: 4 }}><i style={{ width: `${launchState.total ? (launchState.done / launchState.total) * 100 : 0}%` }} /></div></div></div>
            )}
            {route !== 'discover' && (
              <div className="field search" onClick={() => go('discover')}><Icon name="search" size={16} /><input placeholder="Search mods, packs, shaders" readOnly /><span className="kbd">⌘K</span></div>
            )}
          </header>
          <div className="content" key={route + (params.id || '')}>
            <View app={app} />
          </div>
        </main>
      </div>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast glass strong">
            <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'error' ? 'info' : 'sparkles'} size={18} style={{ color: t.kind === 'ok' ? 'var(--green)' : t.kind === 'error' ? 'var(--red)' : 'var(--accent)', flex: 'none', marginTop: 1 }} />
            <span style={{ fontWeight: 550 }}>{t.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}
