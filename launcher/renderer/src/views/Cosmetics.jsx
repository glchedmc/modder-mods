import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../icons';
import { api } from '../api';
import { Segmented, Switch } from '../components/ui';
import SkinViewer from '../components/SkinViewer';
import { toDataUrl, loadImageData } from '../lib/image';
import { CAPES, HATS, WINGS, capeTexture } from '../lib/cosmetics.mjs';

function CapeSwatch({ url }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!url) return;
    loadImageData(url, 512).then((img) => {
      const k = img.width / 64;
      const src = document.createElement('canvas'); src.width = img.width; src.height = img.height;
      src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
      const ctx = ref.current.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 60, 96);
      ctx.drawImage(src, 1 * k, 1 * k, 10 * k, 16 * k, 0, 0, 60, 96);
    }).catch(() => {});
  }, [url]);
  return <canvas ref={ref} width={60} height={96} className="cape-swatch" />;
}

const HAT_ICON = { halo: 'halo', crown: 'crown', 'top-hat': 'tophat', ring: 'orbit' };

export default function Cosmetics({ app }) {
  const [cos, setCos] = useState(null);
  const [tab, setTab] = useState(app.params.tab || 'cape');
  const [lib, setLib] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => { api.getCosmetics().then(setCos); api.listSkins().then(setLib); }, []);
  const urls = useMemo(() => Object.fromEntries(CAPES.map((c) => [c.id, toDataUrl(capeTexture(c.id))])), []);
  if (!cos) return null;
  const skin = lib && (lib.skins.find((s) => s.id === lib.selected) || lib.skins[0]);
  const capeUrl = cos.equipped.cape ? (urls[cos.equipped.cape] || (cos.customUrls || {})[cos.equipped.cape]) : null;

  const equip = async (slot, id) => {
    const next = cos.equipped[slot] === id ? null : id;
    const patch = { equipped: { [slot]: next } };
    if (slot === 'cape') patch.capePng = next ? (urls[next] || cos.customUrls[next]) : null;
    setCos(await api.setCosmetics(patch));
  };
  const upload = (f) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const img = await loadImageData(r.result, 1024);
        if (img.width !== img.height * 2 || img.width % 64) throw new Error(`Capes must be 64×32 PNGs (this one is ${img.width}×${img.height}).`);
        setCos(await api.addCustomCape(r.result, f.name.replace(/\.png$/i, '')));
        app.toast('Cape added', 'ok');
      } catch (e) { app.toast(e.message, 'error'); }
    };
    r.readAsDataURL(f);
  };

  return (
    <div className="skins-layout view-enter">
      <div className="skin-stage glass">
        <div className="stage-glow" />
        <SkinViewer skin={skin ? skin.dataUrl : null} variant={skin ? skin.variant : 'classic'} cape={capeUrl} hat={cos.equipped.hat} wings={cos.equipped.wings} animation="walk" width={340} height={440} />
        <div className="stage-name"><b>{skin ? skin.name : 'Default'}</b><span className="faint">{[cos.equipped.cape && 'Cape', cos.equipped.hat && 'Hat', cos.equipped.wings && 'Wings'].filter(Boolean).join(' · ') || 'Nothing equipped'}</span></div>
      </div>
      <div className="col" style={{ gap: 14, minWidth: 0 }}>
        <div className="notice glass flat visibility"><Icon name="info" size={16} />
          <div><b>Visible to you.</b> Capes (and your library skin, if on) show in game through Saturn Companion. Other players see your normal Minecraft look. Hats and wings preview here for now.</div></div>
        <div className="row between">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'cape', label: 'Capes', icon: 'wings' }, { value: 'hat', label: 'Hats', icon: 'crown' }, { value: 'wings', label: 'Wings', icon: 'sparkles' }]} />
          {tab === 'cape' && <button className="btn sm" onClick={() => fileRef.current.click()} title="64×32 PNG"><Icon name="upload" size={14} />Upload cape</button>}
          <input ref={fileRef} type="file" accept="image/png" hidden onChange={(e) => { const f = e.target.files[0]; if (f) upload(f); e.target.value = ''; }} />
        </div>
        <div className="cos-grid stagger" key={tab}>
          {tab === 'cape' && [...CAPES.map((c) => ({ ...c, url: urls[c.id] })), ...cos.customCapes.map((c) => ({ ...c, url: (cos.customUrls || {})[c.id], custom: true }))].map((c) => (
            <button key={c.id} className={`cos-card glass ${cos.equipped.cape === c.id ? 'active' : ''}`} onClick={() => equip('cape', c.id)}>
              <CapeSwatch url={c.url} />
              <b>{c.name}</b>
              <span className="pill green" title="Rendered by Saturn Companion">In game</span>
              {c.custom && <span className="del" title="Remove" onClick={async (e) => { e.stopPropagation(); setCos(await api.removeCustomCape(c.id)); }}><Icon name="trash" size={13} /></span>}
            </button>
          ))}
          {tab === 'hat' && HATS.map((h) => (
            <button key={h.id} className={`cos-card glass ${cos.equipped.hat === h.id ? 'active' : ''}`} onClick={() => equip('hat', h.id)}>
              <div className="cos-glyph"><Icon name={HAT_ICON[h.id]} size={34} /></div><b>{h.name}</b><span className="pill" title="Launcher preview only in this version">Preview</span>
            </button>
          ))}
          {tab === 'wings' && WINGS.map((w) => (
            <button key={w.id} className={`cos-card glass ${cos.equipped.wings === w.id ? 'active' : ''}`} onClick={() => equip('wings', w.id)}>
              <div className="cos-glyph"><Icon name="wings" size={34} /></div><b>{w.name}</b><span className="pill" title="Launcher preview only in this version">Preview</span>
            </button>
          ))}
        </div>
        {tab === 'cape' && (
          <div className="group glass">
            <div className="setting"><div className="label"><b>Show on elytra</b><span>Use the cape pattern on your elytra too.</span></div><Switch on={cos.capeOnElytra} onChange={async (v) => setCos(await api.setCosmetics({ capeOnElytra: v }))} /></div>
            <div className="setting"><div className="label"><b>Needs Saturn Companion</b><span>On for Fabric/Quilt 26.3 instances. Applied when you press Play.</span></div><span className="pill violet"><Icon name="sparkles" size={11} />0.1.1</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
