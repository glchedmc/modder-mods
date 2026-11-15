import { useEffect, useState } from 'react';
import Icon from '../icons';
import { api } from '../api';
import { Sheet, Segmented } from '../components/ui';
import SkinViewer from '../components/SkinViewer';
import { mapCharacterToSkin, mapAtlasToSkin } from '../lib/skinmap.mjs';
import { loadImageData, toDataUrl } from '../lib/image';

const IDEAS = ['Astronaut with a glass helmet', 'Desert explorer', 'Cyberpunk hacker, neon jacket', 'Knight in silver armor', 'Cozy hoodie and headphones', 'Ocean diver'];

/** Generate a skin from a prompt with Grok or ChatGPT, map it to 64x64, preview, save. */
export default function AiSkinSheet({ app, onClose, onSaved }) {
  const [providers, setProviders] = useState(null);
  const [provider, setProvider] = useState(app.settings.skinAiProvider || 'grok');
  const [mode, setMode] = useState('character');
  const [variant, setVariant] = useState('classic');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null);
  const [skin, setSkin] = useState(null);
  const [name, setName] = useState('');
  useEffect(() => { api.skinAiProviders().then(setProviders); }, []);
  const p = providers && providers[provider];
  const hasKey = p && app.secrets[p.secret];

  const remap = async (src, m = mode, v = variant) => {
    const img = await loadImageData(src, 768);
    const out = m === 'texture' ? mapAtlasToSkin(img, { variant: v }) : mapCharacterToSkin(img, { variant: v });
    setSkin(toDataUrl(out));
  };

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      app.saveSettings({ skinAiProvider: provider });
      const r = await api.generateSkinImage({ provider, prompt, mode });
      const src = `data:${r.mime};base64,${r.b64}`;
      setSource(src);
      await remap(src);
      if (!name) setName(prompt.slice(0, 32));
    } catch (e) { setError(e); }
    setBusy(false);
  };

  return (
    <Sheet onClose={onClose} width={860}>
      <div className="row between"><h2 className="row" style={{ gap: 10 }}><Icon name="sparkles" size={20} style={{ color: 'var(--accent)' }} />Generate a skin</h2>
        <Segmented value={provider} onChange={(v) => { setProvider(v); setError(null); }} options={[{ value: 'grok', label: 'Grok', icon: 'grok' }, { value: 'openai', label: 'ChatGPT', icon: 'sparkles' }]} /></div>
      <div className="ai-grid">
        <div className="col" style={{ gap: 12 }}>
          <div className="field textarea"><textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your character…" /></div>
          <div className="chips">{IDEAS.map((i) => <button key={i} className="chip" onClick={() => setPrompt(i)}>{i}</button>)}</div>
          <div className="row between">
            <Segmented value={mode} onChange={(v) => { setMode(v); if (source) remap(source, v); }} options={[{ value: 'character', label: 'Character → skin' }, { value: 'texture', label: 'Skin sheet (beta)' }]} />
            <Segmented value={variant} onChange={(v) => { setVariant(v); if (source) remap(source, mode, v); }} options={[{ value: 'classic', label: 'Classic' }, { value: 'slim', label: 'Slim' }]} />
          </div>
          <div className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {mode === 'character' ? 'Draws a front-view character, then maps it onto the 64×64 skin layout.' : 'Asks the model for a skin sheet directly. Results vary.'} Uses {p ? p.model : '…'} with your own key.
          </div>
          {!hasKey && p && (
            <div className="notice amber"><Icon name="key" size={15} /><div style={{ flex: 1 }}>Add your {p.label} API key to generate. It stays in the macOS Keychain.</div>
              <button className="btn sm" onClick={() => { onClose(); app.go('settings', { section: 'keys' }); }}>Add key</button></div>
          )}
          {error && <div className="notice red"><Icon name="info" size={15} /><div style={{ flex: 1 }}>{error.message}</div>{(error.code === 'NO_KEY' || error.code === 'BAD_KEY') && <button className="btn sm" onClick={() => { onClose(); app.go('settings', { section: 'keys' }); }}>Settings</button>}</div>}
          <button className="btn primary grok-cta" disabled={busy || !prompt.trim() || !hasKey} onClick={generate}>
            {busy ? <><span className="spinner" />Generating…</> : <><Icon name="sparkles" size={16} />Generate with {p ? p.label : '…'}</>}
          </button>
          {source && <div className="ai-source"><img src={source} alt="Generated character" /><span className="faint">Model output</span></div>}
        </div>
        <div className="ai-preview glass flat">
          {skin ? <SkinViewer skin={skin} variant={variant} width={300} height={380} animation="walk" /> : (
            <div className="empty-preview"><Icon name="shirt" size={34} /><span>Your skin previews here in 3D</span></div>
          )}
          {skin && (
            <div className="col" style={{ gap: 8, width: '100%' }}>
              <div className="field"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skin name" /></div>
              <div className="row" style={{ gap: 8 }}>
                <a className="btn sm" href={skin} download={`${(name || 'skin').replace(/[^a-z0-9-_ ]/gi, '')}.png`}><Icon name="download" size={14} />PNG</a>
                <button className="btn primary sm" style={{ flex: 1 }} onClick={async () => { const s = await api.addSkin({ png: skin, name: name || 'AI skin', variant, source: provider, prompt }); onSaved(s); onClose(); }}><Icon name="check" size={14} />Save to library</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
