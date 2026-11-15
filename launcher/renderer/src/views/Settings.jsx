import { glassLabel } from '../lib/glass.mjs';
import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api, on, isElectron } from '../api';
import { Switch, Range, Segmented, Sheet } from '../components/ui';
import { BackgroundPicker } from '../components/backgrounds';
import CompanionSettings from './CompanionSettings';
import saturnIcon from '../../../build/icon.svg';
import wireframeIcon from '../../../build/dock/wireframe.svg';
import crystalIcon from '../../../build/dock/crystal.svg';

const APP_ICONS = [['saturn', 'Saturn', saturnIcon], ['wireframe', 'Wireframe', wireframeIcon], ['crystal', 'Crystal', crystalIcon]];

function MicRow({ app }) {
  const [mic, setMic] = useState(null);
  useEffect(() => { api.micStatus().then(setMic).catch(() => {}); }, []);
  if (!mic) return null;
  return (
    <>
      <div className="setting"><div className="label"><b title="Minecraft runs inside Saturn Client, so macOS asks once for the launcher.">Microphone access</b><span>{mic.hint} Minecraft uses the launcher's permission.</span></div>
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
  ['companion', 'Companion Mod', 'sparkles'],
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

function SignInSheet({ onClose, app }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api.startSignIn().then(setInfo).catch((e) => setInfo({ error: e.message, code: e.code }));
    return on('auth:update', (u) => {
      if (u.state === 'error') setInfo((cur) => ({ ...(cur || {}), error: u.error, code: u.code }));
      if (u.state === 'done') onClose();
    });
  }, [onClose]);
  return (
    <Sheet onClose={onClose} width={480}>
      <h2>Sign in with Microsoft</h2>
      {!info && <div className="muted" style={{ marginTop: 12 }}>Contacting Microsoft…</div>}
      {info && info.error && (
        <div className="muted" style={{ marginTop: 12, lineHeight: 1.55 }}>
          {info.code === 'APP_NOT_APPROVED' ? 'Microsoft sign-in is waiting on Mojang approval.' : info.error}
        </div>
      )}
      {info && info.needsClientId && (
        <div className="muted" style={{ marginTop: 12, lineHeight: 1.55 }}>
          Microsoft sign-in for Minecraft needs an Azure app client ID that Mojang has approved for Minecraft services. Add yours under <b>Azure client ID</b> first. See the README for the two-step setup.
        </div>
      )}
      {info && info.userCode && !info.needsClientId && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <div className="muted">Open <b>{info.verificationUri}</b> and enter:</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 34, fontWeight: 700, letterSpacing: '0.12em', margin: '16px 0' }}>{info.userCode}</div>
          <div className="row" style={{ justifyContent: 'center' }}><span className="activity" style={{ padding: 0, minWidth: 0 }}><span className="spinner" /></span><span className="muted">Waiting for you to finish in the browser…</span></div>
        </div>
      )}
      <div className="foot"><button className="btn" onClick={onClose}>Close</button></div>
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
            <div className="setting"><div className="label"><b>Show snapshots</b><span>Include snapshot versions in pickers.</span></div><Switch on={s.showSnapshots} onChange={(v) => set({ showSnapshots: v })} /></div>
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
            <div className="setting"><div className="label"><b>Saturn Client</b><span>Version {info.version} · {info.platform} {info.arch}</span></div></div>
            <div className="setting"><div className="label"><b>Data folder</b><span>{info.dataDir}</span></div></div>
            <div className="setting"><div className="label"><b>Source</b><span>github.com/glchedmc/modder-mods/tree/glass-launcher/launcher</span></div></div>
            <div className="setting"><div className="label"><b>Not affiliated with Mojang or Microsoft.</b><span>Minecraft is a trademark of Mojang Synergies AB.</span></div></div>
          </div>
        )}
      </div>
      {signIn && <SignInSheet app={app} onClose={() => setSignIn(false)} />}
    </div>
  );
}
