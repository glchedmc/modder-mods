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
        {mic.status === 'granted' && <button className="btn sm ghost" onClick={async () => setMic(await api.micStatus())}><Icon name="refresh" size={13} />Check</button>}
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
        <div className="row"><span className="secure-tag"><Icon name="lock" size={12} />Saved in Keychain</span><button className="btn sm" onClick={() => setEditing(true)}>Replace</button><button className="btn sm ghost" onClick={() => onSave(name, '')}>Remove</button></div>
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

export default function Settings({ app }) {
  const [section, setSection] = useState(app.params.section || 'general');
  const [info, setInfo] = useState({});
  const [signIn, setSignIn] = useState(false);
  const s = app.settings;
  const set = (patch) => app.saveSettings(patch);
  useEffect(() => { api.appInfo().then(setInfo); }, []);
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
            <div className="setting"><div className="label"><b>Glass intensity</b><span>Blur and translucency of panels.</span></div><Range value={s.glassIntensity} min={0.2} max={1} step={0.05} onChange={(v) => set({ glassIntensity: v })} format={(v) => `${Math.round(v * 100)}%`} /></div>
            <div className="setting"><div className="label"><b>Reduce motion</b><span>Turns off animations.</span></div><Switch on={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} /></div>
          </div>
          <div className="group-title">App icon & sidebar</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Dock icon</b><span>Shown in the Dock while Saturn runs.</span></div>
              <div className="row icon-picker">{APP_ICONS.map(([k, l, src]) => (
                <button key={k} className={`icon-choice ${(s.appIcon || 'saturn') === k ? 'on' : ''}`} title={l} onClick={async () => { await api.setAppIcon(k); set({ appIcon: k }); }}><img src={src} alt="" /><span>{l}</span></button>
              ))}</div></div>
            <div className="setting"><div className="label"><b>Collapse sidebar</b><span>Toggle any time with ⌘\.</span></div><Switch on={s.sidebarCollapsed} onChange={(v) => set({ sidebarCollapsed: v })} /></div>
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
            <div className="setting"><div className="label"><b>Java</b><span>Glass downloads the right Temurin build per version (Java 25 for 26.3).</span></div><span className="pill green"><Icon name="check" size={11} />Automatic</span></div>
            <div className="setting"><div className="label"><b>Custom Java path</b><span>Optional override.</span></div><div className="field" style={{ width: 300 }}><input placeholder="/Library/Java/JavaVirtualMachines/…/bin/java" defaultValue={s.javaPath} onBlur={(e) => set({ javaPath: e.target.value })} /></div></div>
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
          <div className="group-title"><Icon name="lock" size={13} />API keys · stored in the macOS Keychain</div>
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
