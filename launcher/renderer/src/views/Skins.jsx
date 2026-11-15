import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons';
import { api } from '../api';
import { Segmented, Switch } from '../components/ui';
import SkinViewer from '../components/SkinViewer';
import AiSkinSheet from './AiSkin';
import { loadImageData, toDataUrl, skinFrontDataUrl } from '../lib/image';
import { normalizeSkin } from '../lib/skinmap.mjs';
import { starterSkin, STARTERS } from '../lib/starterSkins.mjs';
import { capeTexture } from '../lib/cosmetics.mjs';

function Thumb({ skin }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { skinFrontDataUrl(skin.dataUrl, skin.variant, 6).then(setSrc).catch(() => {}); }, [skin.dataUrl, skin.variant]);
  return <div className="skin-thumb">{src && <img src={src} alt="" />}</div>;
}

export default function Skins({ app }) {
  const [lib, setLib] = useState({ skins: [], selected: null });
  const [anim, setAnim] = useState('idle');
  const [showCape, setShowCape] = useState(true);
  const [cos, setCos] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ai, setAi] = useState(app.params.ai === '1');
  const [drag, setDrag] = useState(false);
  const [applying, setApplying] = useState(false);
  const fileRef = useRef(null);

  const reload = () => api.listSkins().then(setLib);
  useEffect(() => { reload(); api.getCosmetics().then(setCos); api.accountProfile().then(setProfile).catch(() => setProfile({ signedIn: false, skins: [], capes: [] })); }, []);
  const sel = lib.skins.find((s) => s.id === lib.selected) || lib.skins[0] || null;
  const capeUrl = useMemo(() => {
    if (!cos || !cos.equipped.cape) return null;
    if (cos.customUrls && cos.customUrls[cos.equipped.cape]) return cos.customUrls[cos.equipped.cape];
    try { return toDataUrl(capeTexture(cos.equipped.cape)); } catch { return null; }
  }, [cos]);

  const addFromDataUrl = async (dataUrl, name) => {
    try {
      const img = await loadImageData(dataUrl, 64);
      if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) throw new Error(`Skins must be 64×64 PNGs (this one is ${img.width}×${img.height}).`);
      const png = toDataUrl(normalizeSkin(img));
      const s = await api.addSkin({ png, name: name.replace(/\.png$/i, ''), variant: 'classic', source: 'upload' });
      await api.selectSkin(s.id); await reload();
      app.toast(`Added ${s.name}`, 'ok');
    } catch (e) { app.toast(e.message, 'error'); }
  };
  const readFile = (f) => { const r = new FileReader(); r.onload = () => addFromDataUrl(r.result, f.name); r.readAsDataURL(f); };

  const select = async (id) => { await api.selectSkin(id); reload(); };
  const setVariant = async (v) => { if (!sel) return; await api.updateSkin(sel.id, { variant: v }); reload(); };
  const apply = async () => {
    if (!sel) return;
    setApplying(true);
    try { await api.applySkin(sel.id); app.toast(`${sel.name} is now your Minecraft skin`, 'ok'); } catch (e) { app.toast(e.code === 'SIGNED_OUT' ? 'Saved locally. Applying to your account needs Microsoft sign-in, which is waiting on Mojang approval.' : e.message, e.code === 'SIGNED_OUT' ? 'info' : 'error'); }
    setApplying(false);
  };
  const addStarter = async (id) => { const s = starterSkin(id); const e = await api.addSkin({ png: toDataUrl(s.image), name: s.name, variant: s.variant, source: 'starter' }); await api.selectSkin(e.id); reload(); };

  return (
    <div className="skins-layout view-enter">
      <div className={`skin-stage glass ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = [...e.dataTransfer.files].find((x) => /\.png$/i.test(x.name)); if (f) readFile(f); }}>
        <div className="stage-glow" />
        {sel ? <SkinViewer skin={sel.dataUrl} variant={sel.variant} cape={showCape ? capeUrl : null} hat={cos && cos.equipped.hat} wings={cos && cos.equipped.wings} animation={anim} width={340} height={440} /> : <div className="empty-preview"><Icon name="shirt" size={36} /><span>Add a skin to preview it</span></div>}
        <div className="stage-bar">
          <Segmented value={anim} onChange={setAnim} options={[{ value: 'idle', label: 'Idle' }, { value: 'walk', label: 'Walk' }, { value: 'run', label: 'Run' }]} />
          <Segmented value={sel ? sel.variant : 'classic'} onChange={setVariant} options={[{ value: 'classic', label: 'Classic' }, { value: 'slim', label: 'Slim' }]} />
          <button className={`btn sm icon-btn ${showCape ? 'on' : ''}`} title="Show cape" onClick={() => setShowCape(!showCape)}><Icon name="wings" size={15} /></button>
        </div>
        {sel && <div className="stage-name"><b>{sel.name}</b><span className="faint">{sel.source === 'grok' ? 'Made with Grok' : sel.source === 'openai' ? 'Made with ChatGPT' : sel.source === 'starter' ? 'Starter skin' : 'Uploaded'}</span></div>}
      </div>

      <div className="col" style={{ gap: 14, minWidth: 0 }}>
        <div className="skin-actions glass">
          <button className="btn grok-cta" onClick={() => setAi(true)}><Icon name="sparkles" size={16} />Generate with AI</button>
          <button className="btn" onClick={() => fileRef.current.click()} title="64×64 PNG"><Icon name="upload" size={15} />Upload PNG</button>
          <input ref={fileRef} type="file" accept="image/png" hidden onChange={(e) => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ''; }} />
          <div className="grow" />
          <button className="btn primary" disabled={!sel || applying} onClick={apply} title={profile && profile.signedIn ? 'Upload to your Minecraft profile' : 'Needs Microsoft sign-in'}><Icon name="check" size={15} />{applying ? 'Applying…' : 'Apply to account'}</button>
        </div>
        <div className="group glass">
          <div className="setting"><div className="label"><b>Wear in game</b><span>Saturn Companion shows this skin to you. Others see your account skin.</span></div>
            <Switch on={Boolean(cos && cos.localSkin)} onChange={async (v) => setCos(await api.setCosmetics({ localSkin: v }))} /></div>
          <div className="setting"><div className="label"><b>Minecraft account</b><span>{profile && profile.signedIn ? `Signed in as ${profile.name}` : 'Not signed in. Sign-in is waiting on Mojang approval.'}</span></div>
            <span className={`pill ${profile && profile.signedIn ? 'green' : 'amber'}`}><span className="dot" />{profile && profile.signedIn ? 'Online' : 'Local only'}</span></div>
        </div>

        <div className="group-title">Library</div>
        <div className="skin-grid stagger">
          {lib.skins.map((s) => (
            <div key={s.id} className={`skin-card glass ${sel && sel.id === s.id ? 'active' : ''}`} onClick={() => select(s.id)}>
              <Thumb skin={s} />
              <div className="skin-meta"><b className="truncate">{s.name}</b><span className="pill">{s.variant === 'slim' ? 'Slim' : 'Classic'}</span></div>
              <button className="btn ghost sm icon-btn del" title="Delete" onClick={async (e) => { e.stopPropagation(); if (window.confirm(`Delete ${s.name}?`)) { await api.removeSkin(s.id); reload(); } }}><Icon name="trash" size={14} /></button>
            </div>
          ))}
          {lib.skins.length === 0 && <div className="empty">No skins yet. Generate one, upload a PNG or add a starter.</div>}
        </div>

        <div className="group-title">Starter skins</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {STARTERS.map((id) => <button key={id} className="chip" onClick={() => addStarter(id)}><Icon name="plus" size={13} />{starterSkin(id).name}</button>)}
        </div>

        <div className="group-title">Capes on your account</div>
        <div className="group glass">
          {profile && profile.signedIn && profile.capes.length ? profile.capes.map((c) => (
            <div key={c.id} className="setting"><div className="label"><b>{c.alias}</b><span>{c.state === 'ACTIVE' ? 'Showing' : 'Hidden'}</span></div>
              <button className="btn sm" onClick={async () => setProfile(await api.setAccountCape(c.state === 'ACTIVE' ? null : c.id))}>{c.state === 'ACTIVE' ? 'Hide' : 'Show'}</button></div>
          )) : <div className="setting"><div className="label"><b>No account capes</b><span>Official capes appear here after sign-in. Try Saturn capes in Cosmetics.</span></div><button className="btn sm" onClick={() => app.go('cosmetics')}><Icon name="crown" size={14} />Cosmetics</button></div>}
        </div>
      </div>
      {ai && <AiSkinSheet app={app} onClose={() => setAi(false)} onSaved={async (s) => { await api.selectSkin(s.id); reload(); app.toast(`Saved ${s.name}`, 'ok'); }} />}
    </div>
  );
}
