import { MOD } from './lib/platform.mjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './icons';
import { api, on, isElectron, features } from './api';
import { Wallpaper } from './components/backgrounds';
import { glassVars, isSolid } from './lib/glass.mjs';
import Home from './views/Home';
import Library from './views/Library';
import Instance from './views/Instance';
import Discover from './views/Discover';
import Studio from './views/Studio';
import Settings from './views/Settings';
import Schematics from './views/Schematics';
import Skins from './views/Skins';
import Cosmetics from './views/Cosmetics';
import Host from './views/Host';
import Friends from './views/Friends';
import Games from './views/Games';
import { SaturnMark } from './components/brand';

const NAV = [
  ['home', 'Play', 'home'],
  ['library', 'Library', 'library'],
  ['discover', 'Discover', 'discover'],
  ['games', 'Games', 'gamepad'],
  ['skins', 'Skins', 'shirt'],
  ['cosmetics', 'Cosmetics', 'crown'],
  ['friends', 'Friends', 'peers'],
  ['host', 'Host World', 'globe'],
  ['schematics', 'Schematics', 'layers'],
  ['studio', 'Grok Studio', 'sparkles'],
  ['settings', 'Settings', 'settings'],
];
const TITLES = {
  home: ['Play', null], library: ['Library', 'Your instances and servers'], discover: ['Discover', 'Mods, packs and shaders from every platform'],
  schematics: ['Schematics', 'Builds for the selected instance'], games: ['Games', 'Your installed Steam games and more'],
  skins: ['Skins', 'Your look, in 3D'], cosmetics: ['Cosmetics', 'Capes, hats and wings'], host: ['Host World', 'Play your world with friends'], friends: ['Friends', 'Chat and play together'],
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
  const [social, setSocial] = useState({ unread: 0, requests: 0 });

  const go = useCallback((r, p = {}) => {
    const q = new URLSearchParams(p).toString();
    window.location.hash = `/${r}${q ? `?${q}` : ''}`;
  }, []);
  useEffect(() => { const f = () => setNav(parseHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  const toast = useCallback((text, kind = 'info', action = null) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 4200);
  }, []);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

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
      on('host:update', (u) => { if (u.address) toast(`Your world is live at ${u.address}`, 'ok'); }),
      on('social:update', (s) => setSocial({ unread: (s && s.unreadTotal) || 0, requests: (s && s.requests) || 0 })),
      on('nav', (n) => n && n.route && go(n.route, n.params || {})),
      on('social:event', (e) => {
        const h = parseHash();
        const viewing = h.route === 'friends' && h.params.pk === e.pk;
        if (e.type === 'message' && !viewing) toast(`${e.name}: ${e.text}`, 'info', { label: 'Reply', icon: 'chat', run: () => go('friends', { pk: e.pk }) });
        else if (e.type === 'invite') toast(`${e.name} invited you to “${e.world.name}”`, 'ok', { label: 'View', icon: 'globe', run: () => go('friends', { tab: 'worlds' }) });
        else if (e.type === 'friend-request') toast(`${e.name || 'Someone'} sent you a friend request`, 'info', { label: 'View', icon: 'userPlus', run: () => go('friends') });
        else if (e.type === 'friend') toast(`You and ${e.name || 'your friend'} are now friends`, 'ok');
        else if (e.type === 'world') toast(`${e.name} added you to “${e.world.name}”`, 'ok', { label: 'View', icon: 'globe', run: () => go('friends', { tab: 'worlds' }) });
        else if (e.type === 'hosting' && h.route !== 'friends') toast(`${e.name} is hosting “${e.world.name}”`, 'ok', { label: 'Join', icon: 'play', run: () => go('friends', { tab: 'worlds' }) });
        else if (e.type === 'joining') toast(e.text, 'info');
        else if (e.type === 'join-ready') toast(e.text, 'ok');
        else if (e.type === 'join-failed') toast(e.text, 'error');
      }),
      on('auth:update', (u) => { if (u.state === 'done') { toast(`Signed in as ${u.name}`, 'ok'); refresh(); } else if (u.state === 'error') toast(u.error, 'error'); }),
    ];
    api.socialState().then((s) => setSocial({ unread: (s && s.unreadTotal) || 0, requests: (s && s.requests) || 0 })).catch(() => {});
    return () => offs.forEach((f) => f && f());
  }, [toast, refresh, go]);

  // Theme + accent + glass intensity.
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--accent-rgb', hexToRgb(settings.accent));
    const vars = glassVars(settings.glassStrength, { reduceTransparency: settings.reduceTransparency, theme: root.dataset.theme });
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    document.body.classList.toggle('glass-solid', isSolid(settings.glassStrength, settings.reduceTransparency));
    document.body.classList.toggle('reduce-motion', settings.reduceMotion);
  }, [settings]);

  // Cmd+\\ (Ctrl+\\ elsewhere) toggles the sidebar; Cmd/Ctrl+K opens Discover.
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        setSettings((cur) => { if (!cur) return cur; const next = { ...cur, sidebarCollapsed: !cur.sidebarCollapsed }; api.setSettings({ sidebarCollapsed: next.sidebarCollapsed }); return next; });
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        go('discover');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [go]);

  if (!settings) return <Wallpaper settings={null} />;

  const app = {
    route, params, go, settings, secrets, instances, selected, accounts, account: accounts[0] || null, compat, launchState, logs, toast, refresh,
    featureCount: features.features.filter((f) => f.type === 'bool').length,
    setSelected: async (id) => { setSettings(await api.setSettings({ selectedInstance: id })); if (route !== 'home' && route !== 'library') go('home'); },
    saveSettings: async (patch) => setSettings(await api.setSettings(patch)),
    toggleSidebar: () => { const v = !settings.sidebarCollapsed; setSettings({ ...settings, sidebarCollapsed: v }); api.setSettings({ sidebarCollapsed: v }); },
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
  const views = { home: Home, library: Library, instance: Instance, discover: Discover, schematics: Schematics, studio: Studio, settings: Settings, skins: Skins, cosmetics: Cosmetics, host: Host, friends: Friends, games: Games };
  const View = views[route] || Home;
  const isMac = isElectron && navigator.userAgent.includes('Mac');
  const isLinux = isElectron && !isMac && navigator.userAgent.includes('Linux');
  const collapsed = Boolean(settings.sidebarCollapsed);
  const iconsOnly = collapsed && settings.sidebarMode !== 'hidden';
  const hidden = collapsed && settings.sidebarMode === 'hidden';

  return (
    <>
      <Wallpaper settings={settings} />
      <div className={`app ${isMac ? 'mac' : ''} ${isLinux ? 'linux' : ''} ${collapsed ? `sb-collapsed sb-${settings.sidebarMode === 'hidden' ? 'hidden' : 'icons'}` : ''}`}>
        <aside className="sidebar glass" aria-hidden={hidden}>
          <div className="traffic"><i /><i /><i /></div>
          <div className="brand"><SaturnMark size={30} /><div className="brand-text"><b>Saturn</b><small>Client</small></div></div>
          <div className="sidebar-scroll">
            <nav className="nav">
              {NAV.map(([k, label, icon]) => (
                <button key={k} title={iconsOnly ? label : undefined} className={route === k || (k === 'library' && route === 'instance' && params.tab !== 'schematics') || (k === 'schematics' && route === 'instance' && params.tab === 'schematics') ? 'active' : ''} onClick={() => go(k)}>
                  <Icon name={icon} size={18} /><span className="nav-text">{label}</span>
                  {k === 'studio' && jobsRunning > 0 && <span className="badge">{jobsRunning}</span>}
                  {k === 'friends' && social.unread + social.requests > 0 && <span className="badge hot">{social.unread + social.requests}</span>}
                </button>
              ))}
            </nav>
            <div className="nav-label">Instances</div>
            <nav className="nav">
              {instances.slice(0, 4).map((i) => (
                <button key={i.id} title={iconsOnly ? i.name : undefined} className={selected && selected.id === i.id && route === 'home' ? 'active' : ''} onClick={() => app.setSelected(i.id).then(() => go('home'))}>
                  <span className="inst-dot" style={{ background: i.accent }} />
                  <span className="truncate nav-text">{i.name}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="account-chip glass flat" title={iconsOnly ? (app.account ? app.account.name : 'Not signed in') : undefined} onClick={() => go('settings', { section: 'keys' })}>
            <div className="avatar">{app.account ? app.account.name[0] : <Icon name="user" size={16} />}</div>
            <div className="meta"><b className="truncate">{app.account ? app.account.name : 'Not signed in'}</b><span>{app.account ? 'Microsoft account' : 'Sign in to play online'}</span></div>
          </div>
        </aside>

        <main className="main">
          <header className="toolbar">
            <button className="btn ghost icon-btn sidebar-toggle" title={`${collapsed ? 'Show' : 'Hide'} sidebar (${MOD}\\)`} aria-label="Toggle sidebar" onClick={app.toggleSidebar}><Icon name="sidebar" size={18} /></button>
            <div>
              <h1>{route === 'instance' && selected ? 'Instance' : title}</h1>
              {sub && <div className="sub">{sub}</div>}
            </div>
            <div className="grow" />
            {launchState && launchState.state !== 'running' && route !== 'home' && (
              <div className="activity glass flat"><span className="spinner" /><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{launchState.phase}</div><div className="progress" style={{ marginTop: 4 }}><i style={{ width: `${launchState.total ? (launchState.done / launchState.total) * 100 : 0}%` }} /></div></div></div>
            )}
            {route !== 'discover' && (
              <div className="field search" onClick={() => go('discover')}><Icon name="search" size={16} /><input placeholder="Search mods, packs, shaders" readOnly /><span className="kbd">{MOD}K</span></div>
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
            <span style={{ fontWeight: 550, flex: 1 }}>{t.text}</span>
            {t.action && <button className="btn sm" onClick={() => { dismiss(t.id); t.action.run(); }}><Icon name={t.action.icon || 'undo'} size={13} />{t.action.label}</button>}
          </div>
        ))}
      </div>
    </>
  );
}
