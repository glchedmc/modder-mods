import { glassLabel } from '../lib/glass.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../icons';
import { api, on, isElectron } from '../api';
import { Switch, Range, Segmented, Sheet } from '../components/ui';
import { BackgroundPicker } from '../components/backgrounds';
import CompanionSettings from './CompanionSettings';
import saturnIcon from '../../../build/icon.svg';
import nightIcon from '../../../build/dock/night.svg';
import dawnIcon from '../../../build/dock/dawn.svg';

const APP_ICONS = [['saturn', 'Saturn', saturnIcon], ['night', 'Night', nightIcon], ['dawn', 'Dawn', dawnIcon]];

function MicRow({ app }) {
  const [mic, setMic] = useState(null);
  useEffect(() => { api.micStatus().then(setMic).catch(() => {}); }, []);
  if (!mic) return null;
  return (
    <>
      <div className="setting"><div className="label"><b title="Minecraft runs inside Saturn, so macOS asks once for the launcher.">Microphone access</b><span>{mic.hint} Minecraft uses the launcher's permission.</span></div>
        <span className={`pill ${mic.tone}`} title="Voice chat mods use this permission"><Icon name="mic" size={11} />{mic.label}</span>
        {mic.status === 'not-determined' && <button className="btn primary sm" onClick={async () => setMic(await api.requestMic())}>Allow</button>}
        {(mic.status === 'denied' || mic.status === 'restricted') && <button className="btn sm" onClick={() => api.openMicSettings()}>Open System Settings</button>}
        {mic.soundSettings && <button className="btn sm" title="Pick your input device" onClick={() => api.openMicSettings()}><Icon name="mic" size={13} />Sound settings</button>}
        {mic.status === 'granted' && !mic.soundSettings && <button className="btn sm ghost" onClick={async () => setMic(await api.micStatus())}><Icon name="refresh" size={13} />Check</button>}
      </div>
    </>
  );
}

const SECTIONS = [
  ['general', 'General', 'settings'],
  ['appearance', 'Appearance', 'palette'],
  ['game', 'Java & Memory', 'java'],
  ['companion', 'Built-in mods', 'sparkles'],
  ['voice', 'Voice & Mic', 'mic'],
  ['friends', 'Friends', 'peers'],
  ['keys', 'Accounts & Keys', 'key'],
  ['about', 'About', 'info'],
];

function KeyRow({ name, label, hint, link, isSet, builtin, onSave }) {
  const [val, setVal] = useState('');
  const [editing, setEditing] = useState(false);
  return (
    <div className="setting">
      <div className="label"><b>{label}</b><span>{hint} {link && <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Get a key</a>}</span></div>
      {isSet && !editing ? (
        <div className="row"><span className="secure-tag" title={storageLabel()}><Icon name="lock" size={12} />Saved securely</span><button className="btn sm" onClick={() => setEditing(true)}>Replace</button><button className="btn sm ghost" onClick={() => onSave(name, '')}>Remove</button></div>
      ) : builtin && !editing ? (
        <div className="row"><span className="secure-tag"><Icon name="check" size={12} />Built-in key is in use</span><button className="btn sm" onClick={() => setEditing(true)}>Replace</button></div>
      ) : (
        <div className="row">
          <div className="field key-field"><Icon name="key" size={14} /><input type="password" placeholder="Paste key" value={val} onChange={(e) => setVal(e.target.value)} autoComplete="off" spellCheck={false} /></div>
          <button className="btn primary sm" disabled={!val} onClick={async () => { await onSave(name, val.trim()); setVal(''); setEditing(false); }}>Save</button>
        </div>
      )}
    </div>
  );
}

function fmtLeft(sec) { const m = Math.floor(sec / 60); return `${m}:${String(sec % 60).padStart(2, '0')}`; }

/**
 * Microsoft sign-in, like the official launcher: clicking Sign in opens a Microsoft login window and the
 * redirect is caught automatically. Fallbacks (small links): your default browser, or a device code.
 * The request starts ONCE per opening (a ref guards re-renders and double clicks; the main process also
 * re-shows an already running sign-in), and every failure shows a readable message plus the log location.
 */
function SignInSheet({ onClose, app }) {
  const [info, setInfo] = useState(null);       // {method, userCode?, verificationUri?, expiresAt?} | {needsClientId}
  const [error, setError] = useState(null);     // {message, code}
  const [closed, setClosed] = useState(false);  // login window closed without finishing
  const [step, setStep] = useState(null);       // 'Microsoft' | 'Xbox Live' while finishing
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState({});
  const [note, setNote] = useState(null);
  const [logInfo, setLogInfo] = useState(null);
  const started = useRef(false);
  const closing = useRef(false);
  const methodRef = useRef('window');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const begin = (method, fresh) => {
    methodRef.current = method;
    setError(null); setStep(null); setNote(null); setInfo(null); setClosed(false);
    api.startSignIn({ method, fresh }).then(setInfo).catch((e) => setError({ message: e.message || 'Sign-in could not start.', code: e.code }));
  };
  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;
    api.authLogInfo().then(setLogInfo).catch(() => {});
    begin('window', false);
    const off = on('auth:update', (u) => {
      if (u.state === 'progress') setStep(u.step);
      if (u.state === 'cancelled') { setStep(null); setClosed(true); }
      if (u.state === 'error') { setStep(null); setError({ message: u.error || 'Sign-in failed.', code: u.code }); }
      if (u.state === 'done') { closing.current = true; closeRef.current(); }
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { off(); clearInterval(tick); if (!closing.current) api.cancelSignIn().catch(() => {}); };
  }, []);

  const once = (key, fn) => async () => {
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    try { await fn(); } finally { setTimeout(() => setBusy((b) => ({ ...b, [key]: false })), 600); }
  };
  const method = info && info.method;
  const copy = once('copy', async () => { await api.copyText(info.userCode); app.toast('Code copied', 'ok'); });
  const openPage = once('open', async () => {
    try {
      const r = await api.openSignInPage();
      if (r && r.opened) { await api.copyText(info.userCode).catch(() => {}); setNote('Opened in your browser. The code is copied: paste it there.'); }
      else setNote((r && r.reason) || `Go to ${info.verificationUri} and type the code.`);
    } catch (e) { setNote(`Couldn’t open the browser. Go to ${info.verificationUri} and type the code.`); }
  });
  const showWindow = once('show', async () => { await api.focusSignIn(); });
  const showLog = once('log', async () => { try { await api.revealAuthLog(); } catch (e) { app.toast(e.message, 'error'); } });
  const retry = once('retry', async () => begin(methodRef.current, true));
  const useMethod = (m) => once(`m-${m}`, async () => begin(m, true));
  const left = method === 'code' && info.expiresAt ? Math.max(0, Math.round((info.expiresAt - now) / 1000)) : 0;
  const expired = method === 'code' && left <= 0;
  const stopped = Boolean(error || closed || expired);
  const hasClient = !(info && info.needsClientId);

  return (
    <Sheet onClose={onClose} width={480}>
      <div className="signin-sheet">
        <h2>Sign in with Microsoft</h2>
        {!info && !error && <div className="muted" style={{ marginTop: 12 }}>Opening Microsoft…</div>}

        {error && (
          <div className="notice red signin-error" role="alert">
            <Icon name="info" size={16} />
            <div style={{ flex: 1 }}>
              <b>{error.code === 'APP_NOT_APPROVED' ? 'Waiting on Mojang approval' : 'Sign-in didn’t finish'}</b>
              <div style={{ marginTop: 3, lineHeight: 1.5 }}>{error.message}</div>
              <div className="faint" style={{ marginTop: 6, fontSize: 12 }}>
                Details are in the log{logInfo ? <>: <span className="mono" style={{ wordBreak: 'break-all' }}>{logInfo.file}</span></> : '.'}
              </div>
            </div>
          </div>
        )}
        {closed && !error && <div className="muted" style={{ marginTop: 12, lineHeight: 1.55 }}>The Microsoft window was closed before sign-in finished. Try again when you’re ready.</div>}

        {info && info.needsClientId && (
          <div className="muted" style={{ marginTop: 12, lineHeight: 1.55 }}>
            Microsoft sign-in for Minecraft needs an Azure app client ID that Mojang has approved for Minecraft services. Add yours under <b>Azure client ID</b> first.
          </div>
        )}

        {(method === 'window' || method === 'browser') && !stopped && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <div className="muted" style={{ lineHeight: 1.55 }}>
              {method === 'window' ? 'A Microsoft sign-in window is open. Sign in with the account that owns Minecraft; this closes by itself when you’re done.' : 'Finish signing in on the Microsoft page in your browser, then come back here. This continues by itself.'}
            </div>
            <div className="row signin-wait" style={{ justifyContent: 'center', marginTop: 16 }}>
              <span className="activity" style={{ padding: 0, minWidth: 0 }}><span className="spinner" /></span>
              <span className="muted">{step ? `Signed in. Finishing with ${step}…` : method === 'window' ? 'Waiting for the sign-in window…' : 'Waiting for your browser…'}</span>
            </div>
            {method === 'window' && !step && <div style={{ marginTop: 14 }}><button className="btn" onClick={showWindow} disabled={busy.show}><Icon name="external" size={14} />Show sign-in window</button></div>}
          </div>
        )}

        {method === 'code' && !error && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <div className="muted" style={{ lineHeight: 1.5 }}>Open <b>{(info.verificationUri || '').replace(/^https?:\/\/(www\.)?/, '')}</b> in your browser and enter this code:</div>
            <div className={`signin-code ${expired ? 'expired' : ''}`} aria-label="Sign-in code">{info.userCode}</div>
            <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
              <button className="btn" onClick={copy} disabled={busy.copy || expired}><Icon name="copy" size={14} />Copy code</button>
              <button className="btn primary" onClick={openPage} disabled={busy.open || expired}><Icon name="external" size={14} />Open in browser</button>
            </div>
            {note && <div className="faint" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5 }}>{note}</div>}
            <div className="row signin-wait" style={{ justifyContent: 'center', marginTop: 16 }}>
              {expired
                ? <span className="muted">This code expired.</span>
                : <><span className="activity" style={{ padding: 0, minWidth: 0 }}><span className="spinner" /></span><span className="muted">{step ? `Approved. Finishing with ${step}…` : 'Waiting for you to finish in the browser…'}</span><span className="faint mono" style={{ fontSize: 12 }}>{fmtLeft(left)}</span></>}
            </div>
          </div>
        )}

        {hasClient && !step && (
          <div className="signin-alt">
            {method !== 'window' && <button className="link" onClick={useMethod('window')}>Use the sign-in window</button>}
            {method !== 'browser' && <button className="link" onClick={useMethod('browser')}>Use my browser instead</button>}
            {method !== 'code' && <button className="link" onClick={useMethod('code')}>Use a code instead</button>}
          </div>
        )}

        <div className="foot">
          {stopped && <button className="btn ghost" onClick={showLog} disabled={busy.log}><Icon name="folder" size={14} />Show log</button>}
          {stopped && hasClient && <button className="btn primary" onClick={retry} disabled={busy.retry}><Icon name="refresh" size={14} />Try again</button>}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Sheet>
  );
}

let storageCache = null;
const storageLabel = () => (storageCache ? storageCache.label : 'Secure storage');


const BUILTIN_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://offchain.pub', 'wss://relay.damus.io'];
function FriendsSettings({ app }) {
  const s = app.settings;
  const [name, setName] = useState(s.socialDisplayName || '');
  const [relays, setRelays] = useState((s.socialRelays && s.socialRelays.length ? s.socialRelays : BUILTIN_RELAYS).join('\n'));
  const [st, setSt] = useState(null);
  useEffect(() => { api.socialState().then(setSt).catch(() => {}); }, []);
  const save = async (patch, msg) => { try { setSt(await api.socialSetProfile(patch)); await app.refresh(); if (msg) app.toast(msg, 'ok'); } catch (e) { app.toast(e.message, 'error'); } };
  const me = st && st.me;
  return <>
    <div className="group-title"><Icon name="peers" size={13} />Friends & chat</div>
    <div className="group glass">
      <div className="setting"><div className="label"><b>Friends</b><span>Chat, presence and one-click joins over free public relays.</span></div><Switch on={s.socialEnabled !== false} onChange={(v) => save({ socialEnabled: v })} /></div>
      <div className="setting"><div className="label"><b>Display name</b><span>{app.account ? `Friends see your Minecraft name (${app.account.name}).` : 'Shown to friends until you sign in with Microsoft.'}</span></div>
        <div className="row" style={{ gap: 8 }}><div className="field" style={{ width: 200 }}><input value={name} maxLength={32} placeholder="Your name" onChange={(e) => setName(e.target.value)} /></div><button className="btn sm" onClick={() => save({ socialDisplayName: name.trim() }, 'Name saved')}>Save</button></div></div>
      <div className="setting"><div className="label"><b>Findable by friend code</b><span>Publishes your name with your code so friends can look it up. Off: share your npub instead.</span></div><Switch on={s.socialDiscoverable !== false} onChange={(v) => save({ socialDiscoverable: v })} /></div>
      <div className="setting"><div className="label"><b>Notifications</b><span>Desktop alerts for messages, invites and requests while Saturn is in the background.</span></div><Switch on={s.socialNotifications !== false} onChange={(v) => save({ socialNotifications: v })} /></div>
      {me && <div className="setting"><div className="label"><b>Your identity</b><span className="mono" style={{ wordBreak: 'break-all' }}>{me.npub}</span></div><button className="btn sm" onClick={async () => { await api.copyText(me.npub); app.toast('npub copied', 'ok'); }}><Icon name="copy" size={13} />Copy</button></div>}
    </div>
    <div className="group-title"><Icon name="globe" size={13} />Relays</div>
    <div className="group glass">
      <div className="setting" style={{ alignItems: 'flex-start' }}><div className="label"><b>Relay list</b><span>One wss:// address per line. Use at least two that both of you can reach. Relays see encrypted blobs and timing, never the text.</span>
        {st && st.relays && <div className="relay-status">{st.relays.map((r) => <span key={r.url} className={`pill ${r.state === 'open' ? 'green' : r.state === 'error' ? 'red' : ''}`} title={r.error || r.state}>{r.url.replace(/^wss?:\/\//, '')}</span>)}</div>}</div>
        <div className="col" style={{ gap: 8, width: 300 }}><textarea className="code-input" rows={5} value={relays} onChange={(e) => setRelays(e.target.value)} />
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}><button className="btn sm ghost" onClick={() => { setRelays(BUILTIN_RELAYS.join('\n')); save({ socialRelays: [] }, 'Using the built-in relays'); }}>Reset</button><button className="btn sm" onClick={() => save({ socialRelays: relays.split(/\s+/).filter(Boolean) }, 'Relays saved')}>Save</button></div></div></div>
    </div>
  </>;
}

export default function Settings({ app }) {
  const [section, setSection] = useState(app.params.section || 'general');
  const [info, setInfo] = useState({});
  const [signIn, setSignIn] = useState(false);
  const closeSignIn = useCallback(() => setSignIn(false), []);
  const s = app.settings;
  const set = (patch) => app.saveSettings(patch);
  useEffect(() => { api.appInfo().then(setInfo); }, []);
  const [storage, setStorage] = useState(null);
  const [javas, setJavas] = useState(null);
  useEffect(() => { api.storageInfo().then((v) => { setStorage(v); storageCache = v; }).catch(() => {}); }, []);
  useEffect(() => { if (app.params.section) setSection(app.params.section); }, [app.params.section]);

  return (
    <div className="settings-layout view-enter">
      <div className="settings-nav glass nav">
        {SECTIONS.map(([k, l, ic]) => <button key={k} className={section === k ? 'active' : ''} onClick={() => setSection(k)}><Icon name={ic} size={17} />{l}</button>)}
      </div>
      <div className="stagger" key={section}>
        {section === 'general' && <>
          <div className="group-title">Launching</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Default Minecraft version</b><span>Used for new instances.</span></div><div className="field" style={{ width: 160 }}><select value={s.defaultVersion} onChange={(e) => set({ defaultVersion: e.target.value })}>{['26.3', '26.2', '26.1.2', '1.21.11', '1.21.1', '1.20.1'].map((v) => <option key={v}>{v}</option>)}</select></div></div>
            <div className="setting"><div className="label"><b>Default loader</b></div><Segmented value={s.defaultLoader} onChange={(v) => set({ defaultLoader: v })} options={['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].map((v) => ({ value: v, label: { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }[v] }))} /></div>
            <div className="setting"><div className="label"><b>Hide launcher while playing</b><span>Reopens when the game closes.</span></div><Switch on={s.closeOnLaunch} onChange={(v) => set({ closeOnLaunch: v })} /></div>
            <div className="setting"><div className="label"><b>Show snapshots</b><span>Include snapshot versions in pickers.</span></div><Switch on={s.showSnapshots} onChange={(v) => set({ showSnapshots: v })} label="Show snapshots" /></div>
            <div className="setting"><div className="label"><b>Old versions</b><span>Include old beta and alpha releases.</span></div><Switch on={s.showOldVersions} onChange={(v) => set({ showOldVersions: v })} label="Old versions" /></div>
          </div>
          <div className="group-title">Games tab</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>No-violence game filter</b><span>Only show driving, sports, casual, family and party games. Hides shooters, horror, survival and games Steam marks for violence or adult content.</span></div><Switch on={s.gameFilter !== false} onChange={(v) => set({ gameFilter: v })} label="No-violence game filter" /></div>
          </div>
          <div className="group-title">Mod sources</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Modrinth</b><span>Public API, no key needed.</span></div><Switch on={s.modSources.modrinth} onChange={(v) => set({ modSources: { ...s.modSources, modrinth: v } })} /></div>
            <div className="setting"><div className="label"><b>CurseForge</b><span>{app.secrets.curseforgeApiKey ? (app.secrets.curseforgeApiKeyCustom ? 'Using your key.' : 'Using the built-in key.') : 'Needs an API key (Accounts & Keys).'}</span></div><Switch on={s.modSources.curseforge} onChange={(v) => set({ modSources: { ...s.modSources, curseforge: v } })} /></div>
          </div>
        </>}

        {section === 'appearance' && <>
          <div className="group-title">Look</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Theme</b></div><Segmented value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
            <div className="setting"><div className="label"><b>Accent color</b></div>
              <div className="row">{['#7aa8ff', '#b28dff', '#ff8fb1', '#ffb36b', '#5be49b', '#4fd1e8'].map((c) => <button key={c} onClick={() => set({ accent: c })} style={{ width: 24, height: 24, borderRadius: '50%', border: s.accent === c ? '2px solid #fff' : '2px solid transparent', background: c, boxShadow: `0 0 0 ${s.accent === c ? 3 : 0}px ${c}66, inset 0 1px 0 rgba(255,255,255,.5)` }} />)}</div></div>
            <div className="setting"><div className="label"><b>Reduce motion</b><span>Turns off animations.</span></div><Switch on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} /></div>
          </div>
          <div className="group-title">Glass</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Glass strength</b><span>0 is solid with no blur: fastest on older or Linux GPUs.</span></div>
              <div className="range-wide" title="Blur and see-through amount"><Range value={s.glassStrength} min={0} max={1} step={0.05} onChange={(v) => set({ glassStrength: v })} format={(v) => glassLabel(v)} /></div></div>
            <div className="range-ends"><span>Solid</span><span>Max glass</span></div>
            <div className="glass-preview">{[['solid', 0, 'Solid'], ['medium', 0.45, 'Medium'], ['max', 1, 'Max']].map(([k, v, l]) => (
              <button key={k} className={`${k} ${Math.abs((s.reduceTransparency ? 0 : s.glassStrength) - v) < 0.03 ? 'on' : ''}`} title={`Set glass to ${l}`} onClick={() => set({ glassStrength: v, reduceTransparency: false })}><span>{l}</span></button>
            ))}</div>
            <div className="setting"><div className="label"><b>Reduce transparency</b><span>Solid panels everywhere, whatever the slider says.</span></div><Switch on={s.reduceTransparency} onChange={(v) => set({ reduceTransparency: v })} /></div>
          </div>
          <div className="group-title">App icon & sidebar</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>{info.platform && info.platform !== 'darwin' ? 'App icon' : 'Dock icon'}</b><span>{info.platform && info.platform !== 'darwin' ? 'Shown in your taskbar and window switcher.' : 'Shown in the Dock while Saturn runs.'}</span></div>
              <div className="row icon-picker">{APP_ICONS.map(([k, l, src]) => (
                <button key={k} className={`icon-choice ${(s.appIcon || 'saturn') === k ? 'on' : ''}`} title={l} onClick={async () => { await api.setAppIcon(k); set({ appIcon: k }); }}><img src={src} alt="" /><span>{l}</span></button>
              ))}</div></div>
            <div className="setting"><div className="label"><b>Collapse sidebar</b><span>Toggle any time with {info.platform && info.platform !== 'darwin' ? 'Ctrl' : '⌘'}\.</span></div><Switch on={s.sidebarCollapsed} onChange={(v) => set({ sidebarCollapsed: v })} /></div>
            <div className="setting"><div className="label"><b>Collapsed sidebar shows</b><span>Icons only, or hide it completely.</span></div><Segmented value={s.sidebarMode} onChange={(v) => set({ sidebarMode: v })} options={[{ value: 'icons', label: 'Icons' }, { value: 'hidden', label: 'Nothing' }]} /></div>
          </div>
          <div className="group-title">Backgrounds</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Blur</b><span>Softens the scene.</span></div><Range value={s.backgroundBlur ?? 0} min={0} max={1} step={0.05} onChange={(v) => set({ backgroundBlur: v })} format={(v) => `${Math.round(v * 100)}%`} /></div>
            <div className="setting"><div className="label"><b>Dim</b><span>Darkens the scene.</span></div><Range value={s.backgroundDim ?? 0} min={0} max={0.8} step={0.05} onChange={(v) => set({ backgroundDim: v })} format={(v) => `${Math.round(v * 100)}%`} /></div>
            <div className="setting"><div className="label"><b>Parallax</b><span>Shifts with the pointer.</span></div><Range value={s.backgroundParallax ?? 0} min={0} max={1} step={0.05} onChange={(v) => set({ backgroundParallax: v })} format={(v) => s.reduceMotion ? 'Off' : `${Math.round(v * 100)}%`} /></div>
          </div>
          <div className="group glass" style={{ padding: '14px 16px 8px' }}>
            <BackgroundPicker
              settings={s}
              value={s.backgroundId || 'highlands'}
              custom={s.customBackground}
              solid={s.backgroundSolid}
              onSelect={(id) => set({ backgroundId: id })}
              onSolidColor={(c) => set({ backgroundId: 'solid-custom', backgroundSolid: c })}
              onImport={async () => {
                if (!isElectron) { app.toast('Add a file in the installed app'); return; }
                const filePath = await api.pickBackgroundFile();
                if (!filePath) return;
                try {
                  const meta = await api.importBackground(filePath);
                  if (s.customBackground && s.customBackground.file) await api.removeBackgroundFile(s.customBackground.file).catch(() => {});
                  await set({ backgroundId: 'custom', customBackground: meta });
                } catch (e) { app.toast(e.message, 'error'); }
              }}
              onRemoveCustom={async () => {
                if (s.customBackground && s.customBackground.file) await api.removeBackgroundFile(s.customBackground.file).catch(() => {});
                await set({ backgroundId: s.backgroundId === 'custom' ? 'highlands' : s.backgroundId, customBackground: null });
              }}
            />
          </div>
        </>}

        {section === 'game' && <>
          <div className="group-title">Java runtime</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Java</b><span>Saturn downloads the right Temurin build per version (Java 25 for 26.3), or uses a matching one already installed.</span></div><span className="pill green"><Icon name="check" size={11} />Automatic</span></div>
            <div className="setting"><div className="label"><b>Installed Java</b><span>{javas === null ? 'Not checked yet.' : javas.length ? javas.map((j) => `Java ${j.major || '?'}${j.managed ? ' (Saturn)' : ''}`).join(' · ') : 'None found. Saturn will download one on first launch.'}</span></div>
              <button className="btn sm" title="Look for installed Java runtimes" onClick={async () => setJavas(await api.detectJava().catch(() => []))}><Icon name="refresh" size={13} />Detect</button></div>
            <div className="setting"><div className="label"><b>Custom Java path</b><span>Optional override.</span></div><div className="field" style={{ width: 300 }}><input placeholder={info.platform === 'linux' ? '/usr/lib/jvm/…/bin/java' : '/Library/Java/JavaVirtualMachines/…/bin/java'} defaultValue={s.javaPath} onBlur={(e) => set({ javaPath: e.target.value })} /></div></div>
            <div className="setting"><div className="label"><b>Default memory</b><span>For new instances.</span></div><Range value={s.memoryMb} min={1024} max={16384} step={512} onChange={(v) => set({ memoryMb: v })} format={(v) => `${(v / 1024).toFixed(1)} GB`} /></div>
          </div>
        </>}

        {section === 'voice' && <>
          <div className="group-title"><Icon name="mic" size={13} />Microphone</div>
          <div className="group glass">
            <MicRow app={app} />
            <div className="setting"><div className="label"><b>Simple Voice Chat</b><span>Add proximity voice to the selected instance.</span></div>
              <button className="btn sm" disabled={!app.selected || app.selected.type === 'server'} onClick={async () => { try { await api.installHostingMod(app.selected.id, 'voicechat'); app.refresh(); app.toast('Simple Voice Chat installed', 'ok'); } catch (e) { app.toast(e.message, 'error'); } }}><Icon name="download" size={14} />Install for {app.selected ? app.selected.name : '…'}</button></div>
            <div className="setting"><div className="label"><b>Voice chat key</b><span>Push-to-talk is set inside the game (default: Caps Lock).</span></div></div>
          </div>
        </>}

        {section === 'friends' && <FriendsSettings app={app} />}

        {section === 'companion' && <CompanionSettings app={app} instance={app.selected && app.selected.companion ? app.selected : null} />}

        {section === 'keys' && <>
          <div className="group-title">Minecraft account</div>
          <div className="group glass">
            {app.account ? (
              <div className="setting"><div className="avatar">{app.account.name[0]}</div><div className="label"><b>{app.account.name}</b><span>Microsoft account</span></div><button className="btn" onClick={() => api.signOut().then(app.refresh)}>Sign out</button></div>
            ) : (
              <div className="setting"><div className="label"><b>Not signed in</b><span>Sign in with the Microsoft account that owns Minecraft: Java Edition.</span></div><button className="btn primary" onClick={() => setSignIn(true)}><Icon name="user" size={15} />Sign in</button></div>
            )}
            <div className="setting"><div className="label"><b>Azure client ID</b><span>Used for Microsoft sign-in. A default is built in; change it only if you registered your own app.</span></div>
              <div className="field key-field"><input placeholder="00000000-0000-0000-0000-000000000000" defaultValue={s.msaClientId} onBlur={(e) => set({ msaClientId: e.target.value.trim() })} spellCheck={false} /></div></div>
          </div>
          <div className="group-title"><Icon name="lock" size={13} />API keys · stored in {storage ? storage.label : 'secure storage'}</div>
          {storage && storage.mode === 'file' && <div className="notice amber glass flat" style={{ marginBottom: 10 }}><Icon name="info" size={16} /><div>No desktop keyring (GNOME Keyring / KWallet) was found, so keys are kept in a private file only your user can read. Install gnome-keyring for encrypted storage.</div></div>}
          <div className="group glass">
            <KeyRow name="xaiApiKey" label="xAI (Grok) API key" hint="Powers Upgrade to 26.3 and Grok skins." link="https://console.x.ai" isSet={app.secrets.xaiApiKey} onSave={app.setSecret} />
            <KeyRow name="openaiApiKey" label="OpenAI (ChatGPT) API key" hint="Optional. Generates skins with gpt-image-1." link="https://platform.openai.com/api-keys" isSet={app.secrets.openaiApiKey} onSave={app.setSecret} />
            <KeyRow name="curseforgeApiKey" label="CurseForge API key" hint={app.secrets.curseforgeApiKeyCustom ? "Your key overrides the built-in one." : app.secrets.curseforgeApiKeyBuiltin ? "Using the built-in key. Paste your own to override it." : "Enables CurseForge in Discover."} link="https://console.curseforge.com" isSet={app.secrets.curseforgeApiKeyCustom} builtin={app.secrets.curseforgeApiKeyBuiltin && !app.secrets.curseforgeApiKeyCustom} onSave={app.setSecret} />
          </div>
          <div className="group-title">AI skins</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Default provider</b></div><Segmented value={s.skinAiProvider} onChange={(v) => set({ skinAiProvider: v })} options={[{ value: 'grok', label: 'Grok' }, { value: 'openai', label: 'ChatGPT' }]} /></div>
            <div className="setting"><div className="label"><b>Grok image model</b></div><div className="field" style={{ width: 220 }}><input defaultValue={s.skinAiGrokModel} onBlur={(e) => set({ skinAiGrokModel: e.target.value.trim() || 'grok-imagine-image-2.0' })} spellCheck={false} /></div></div>
            <div className="setting"><div className="label"><b>OpenAI image model</b></div><div className="field" style={{ width: 220 }}><input defaultValue={s.skinAiOpenaiModel} onBlur={(e) => set({ skinAiOpenaiModel: e.target.value.trim() || 'gpt-image-1' })} spellCheck={false} /></div></div>
          </div>
          <div className="group-title">Grok</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Model</b><span>xAI Responses API model used for porting.</span></div><div className="field" style={{ width: 180 }}><select value={s.grokModel} onChange={(e) => set({ grokModel: e.target.value })}><option>grok-4.7</option><option>grok-4.6</option><option>grok-build-0.1</option><option>grok-4.3</option></select></div></div>
            <div className="setting"><div className="label"><b>Reasoning effort</b></div><Segmented value={s.grokReasoning} onChange={(v) => set({ grokReasoning: v })} options={['low', 'medium', 'high', 'xhigh'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} /></div>
            <div className="setting"><div className="label"><b>Build attempts</b><span>How many compile-fix rounds before giving up.</span></div><Range value={s.grokMaxAttempts} min={1} max={10} step={1} onChange={(v) => set({ grokMaxAttempts: v })} /></div>
          </div>
        </>}

        {section === 'about' && (
          <div className="group glass">
            <div className="setting"><div className="label"><b>Saturn</b><span>Version {info.version} · {info.platform} {info.arch}</span></div></div>
            <div className="setting"><div className="label"><b>Data folder</b><span>{info.dataDir}</span></div></div>
            <div className="setting"><div className="label"><b>Source</b><span>github.com/glchedmc/modder-mods/tree/glass-launcher/launcher</span></div></div>
            <div className="setting"><div className="label"><b>Not affiliated with Mojang or Microsoft.</b><span>Minecraft is a trademark of Mojang Synergies AB.</span></div></div>
          </div>
        )}
      </div>
      {signIn && <SignInSheet app={app} onClose={closeSignIn} />}
    </div>
  );
}
