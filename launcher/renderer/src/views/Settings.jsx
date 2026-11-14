import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api } from '../api';
import { Switch, Range, Segmented, Sheet } from '../components/ui';
import CompanionSettings from './CompanionSettings';

const SECTIONS = [
  ['general', 'General', 'settings'],
  ['appearance', 'Appearance', 'palette'],
  ['game', 'Java & Memory', 'java'],
  ['companion', 'Companion Mod', 'sparkles'],
  ['keys', 'Accounts & Keys', 'key'],
  ['about', 'About', 'info'],
];

function KeyRow({ name, label, hint, link, isSet, onSave }) {
  const [val, setVal] = useState('');
  const [editing, setEditing] = useState(false);
  return (
    <div className="setting">
      <div className="label"><b>{label}</b><span>{hint} {link && <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Get a key</a>}</span></div>
      {isSet && !editing ? (
        <div className="row"><span className="secure-tag"><Icon name="lock" size={12} />Saved in Keychain</span><button className="btn sm" onClick={() => setEditing(true)}>Replace</button><button className="btn sm ghost" onClick={() => onSave(name, '')}>Remove</button></div>
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
  useEffect(() => { api.startSignIn().then(setInfo).catch((e) => setInfo({ error: e.message })); }, []);
  return (
    <Sheet onClose={onClose} width={480}>
      <h2>Sign in with Microsoft</h2>
      {!info && <div className="muted" style={{ marginTop: 12 }}>Contacting Microsoft…</div>}
      {info && info.error && <div className="muted" style={{ marginTop: 12 }}>{info.error}</div>}
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
            <div className="setting"><div className="label"><b>CurseForge</b><span>{app.secrets.curseforgeApiKey ? 'Connected.' : 'Needs an API key (Accounts & Keys).'}</span></div><Switch on={s.modSources.curseforge} onChange={(v) => set({ modSources: { ...s.modSources, curseforge: v } })} /></div>
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
        </>}

        {section === 'game' && <>
          <div className="group-title">Java runtime</div>
          <div className="group glass">
            <div className="setting"><div className="label"><b>Java</b><span>Glass downloads the right Temurin build per version (Java 25 for 26.3).</span></div><span className="pill green"><Icon name="check" size={11} />Automatic</span></div>
            <div className="setting"><div className="label"><b>Custom Java path</b><span>Optional override.</span></div><div className="field" style={{ width: 300 }}><input placeholder="/Library/Java/JavaVirtualMachines/…/bin/java" defaultValue={s.javaPath} onBlur={(e) => set({ javaPath: e.target.value })} /></div></div>
            <div className="setting"><div className="label"><b>Default memory</b><span>For new instances.</span></div><Range value={s.memoryMb} min={1024} max={16384} step={512} onChange={(v) => set({ memoryMb: v })} format={(v) => `${(v / 1024).toFixed(1)} GB`} /></div>
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
            <div className="setting"><div className="label"><b>Azure client ID</b><span>Your own Azure app, approved for Minecraft services. Not a secret, stored in settings.</span></div>
              <div className="field key-field"><input placeholder="00000000-0000-0000-0000-000000000000" defaultValue={s.msaClientId} onBlur={(e) => set({ msaClientId: e.target.value.trim() })} spellCheck={false} /></div></div>
          </div>
          <div className="group-title"><Icon name="lock" size={13} />API keys · stored in the macOS Keychain</div>
          <div className="group glass">
            <KeyRow name="xaiApiKey" label="xAI (Grok) API key" hint="Powers Upgrade to 26.3." link="https://console.x.ai" isSet={app.secrets.xaiApiKey} onSave={app.setSecret} />
            <KeyRow name="curseforgeApiKey" label="CurseForge API key" hint="Enables CurseForge in Discover." link="https://console.curseforge.com" isSet={app.secrets.curseforgeApiKey} onSave={app.setSecret} />
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
            <div className="setting"><div className="label"><b>Glass Launcher</b><span>Version {info.version} · {info.platform} {info.arch}</span></div></div>
            <div className="setting"><div className="label"><b>Data folder</b><span>{info.dataDir}</span></div></div>
            <div className="setting"><div className="label"><b>Source</b><span>github.com/glchedmc/modder-mods/tree/main/launcher</span></div></div>
            <div className="setting"><div className="label"><b>Not affiliated with Mojang or Microsoft.</b><span>Minecraft is a trademark of Mojang Synergies AB.</span></div></div>
          </div>
        )}
      </div>
      {signIn && <SignInSheet app={app} onClose={() => setSignIn(false)} />}
    </div>
  );
}
