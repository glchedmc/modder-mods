import { MOD, SHIFT_MOD } from '../lib/platform.mjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../icons';
import { api } from '../api';
import { Segmented } from '../components/ui';
import SkinViewer from '../components/SkinViewer';
import { loadImageData, toDataUrl } from '../lib/image';
import { normalizeSkin } from '../lib/skinmap.mjs';
import {
  SIZE, PART_LABELS, LAYER_LABELS, PALETTE, pixelMap, pixelInfo, paint, line, floodFill, getRGBA,
  hexToRgba, rgbaToHex, History, cloneImage,
} from '../lib/skinEditor.mjs';

const PX = 9; // canvas pixels per skin pixel
const TOOLS = [
  { id: 'pencil', icon: 'brush', label: 'Paint (B)', key: 'b' },
  { id: 'eraser', icon: 'eraser', label: 'Erase (E)', key: 'e' },
  { id: 'fill', icon: 'bucket', label: 'Fill one face (G)', key: 'g' },
  { id: 'picker', icon: 'dropper', label: 'Pick color (I)', key: 'i' },
];

function blankSkin() { return { width: SIZE, height: SIZE, data: new Uint8ClampedArray(SIZE * SIZE * 4) }; }

/**
 * Full skin editor: paints on the flat 64x64 texture (base or outer layer),
 * with mirror, fill, eyedropper, undo/redo and a live 3D preview.
 * props.skin: {id?, name, dataUrl?, variant}
 */
export default function SkinEditor({ app, skin, onClose, onSaved }) {
  const [img, setImg] = useState(null);
  const [model, setModel] = useState(skin.variant === 'slim' ? 'slim' : 'classic');
  const [layer, setLayer] = useState('base');
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#7aa8ff');
  const [recent, setRecent] = useState([]);
  const [mirror, setMirror] = useState(false);
  const [grid, setGrid] = useState(true);
  const [showOther, setShowOther] = useState(true);
  const [hover, setHover] = useState(null);
  const [preview, setPreview] = useState(skin.dataUrl || null);
  const [name, setName] = useState(skin.name || 'My skin');
  const [dirty, setDirty] = useState(false);
  const [, force] = useState(0);
  const hist = useRef(new History());
  const canvas = useRef(null);
  const drawing = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!skin.dataUrl) { setImg(blankSkin()); return; }
    loadImageData(skin.dataUrl, 64).then((d) => setImg(normalizeSkin(d))).catch(() => setImg(blankSkin()));
  }, [skin.dataUrl]);

  // Draw the flat texture: checkerboard, the other layer dimmed, the active
  // layer on top, areas outside the active layer shaded, then the grid.
  const render = useCallback(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const map = pixelMap(model);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const p = map[y * SIZE + x];
        ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.13)';
        ctx.fillRect(x * PX, y * PX, PX, PX);
        if (!p) { ctx.fillStyle = 'rgba(6,8,30,0.55)'; ctx.fillRect(x * PX, y * PX, PX, PX); continue; }
        const [r, g, b, a] = getRGBA(img, x, y);
        const active = p.layer === layer;
        if (a > 0 && (active || showOther)) {
          ctx.globalAlpha = (a / 255) * (active ? 1 : 0.4);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x * PX, y * PX, PX, PX);
          ctx.globalAlpha = 1;
        }
        if (!active) { ctx.fillStyle = 'rgba(6,8,30,0.45)'; ctx.fillRect(x * PX, y * PX, PX, PX); }
      }
    }
    if (grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= SIZE; i++) { ctx.moveTo(i * PX + 0.5, 0); ctx.lineTo(i * PX + 0.5, SIZE * PX); ctx.moveTo(0, i * PX + 0.5); ctx.lineTo(SIZE * PX, i * PX + 0.5); }
      ctx.stroke();
    }
    if (hover) {
      const p = pixelInfo(hover[0], hover[1], model);
      if (p) {
        ctx.strokeStyle = 'rgba(122,168,255,0.9)'; ctx.lineWidth = 2;
        ctx.strokeRect(p.x0 * PX + 1, p.y0 * PX + 1, p.fw * PX - 2, p.fh * PX - 2);
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(hover[0] * PX + 1, hover[1] * PX + 1, PX - 2, PX - 2);
    }
  }, [img, model, layer, grid, showOther, hover]);
  useEffect(() => { render(); }, [render]);

  // Live 3D preview, throttled so painting stays smooth.
  useEffect(() => {
    if (!img) return undefined;
    const t = setTimeout(() => setPreview(toDataUrl(img)), 120);
    return () => clearTimeout(t);
  }, [img]);

  const cell = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const k = (SIZE * PX) / r.width;
    return [Math.floor(((e.clientX - r.left) * k) / PX), Math.floor(((e.clientY - r.top) * k) / PX)];
  };
  const rgba = () => (tool === 'eraser' ? [0, 0, 0, 0] : hexToRgba(color));
  const remember = (hex) => setRecent((r) => [hex, ...r.filter((x) => x !== hex)].slice(0, 8));
  const change = (next) => { setImg(next); setDirty(true); force((n) => n + 1); };

  const down = (e) => {
    if (!img || e.button !== 0) return;
    const [x, y] = cell(e);
    const info = pixelInfo(x, y, model);
    if (tool === 'picker') {
      if (info) { const c = getRGBA(img, x, y); if (c[3] > 0) { const hex = rgbaToHex(c); setColor(hex); remember(hex); setTool('pencil'); } }
      return;
    }
    if (info && info.layer !== layer) { setLayer(info.layer); return; } // click the other layer to switch to it
    hist.current.push(img);
    const next = cloneImage(img);
    if (tool === 'fill') { floodFill(next, x, y, rgba(), { model, layer, mirror }); change(next); if (tool !== 'eraser') remember(color); return; }
    paint(next, x, y, rgba(), { model, layer, mirror });
    drawing.current = { img: next, last: [x, y] };
    change(next);
    if (tool === 'pencil') remember(color);
  };
  const move = (e) => {
    const [x, y] = cell(e);
    setHover(x >= 0 && y >= 0 && x < SIZE && y < SIZE ? [x, y] : null);
    const d = drawing.current;
    if (!d) return;
    const next = cloneImage(d.img);
    for (const [px, py] of line(d.last[0], d.last[1], x, y)) paint(next, px, py, rgba(), { model, layer, mirror });
    drawing.current = { img: next, last: [x, y] };
    change(next);
  };
  const up = () => { drawing.current = null; };
  useEffect(() => { window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up); }, []);

  const undo = useCallback(() => { const p = hist.current.undo(img); if (p) change(p); }, [img]);
  const redo = useCallback(() => { const p = hist.current.redo(img); if (p) change(p); }, [img]);

  useEffect(() => {
    const k = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod) return;
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) setTool(t.id);
      if (e.key.toLowerCase() === 'm') setMirror((v) => !v);
      if (e.key === 'Tab') { e.preventDefault(); setLayer((l) => (l === 'base' ? 'over' : 'base')); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [undo, redo]);

  const importPng = (file) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const d = await loadImageData(r.result, 64);
        if (d.width !== 64 || (d.height !== 64 && d.height !== 32)) throw new Error(`Skins must be 64×64 (this is ${d.width}×${d.height}).`);
        hist.current.push(img); change(normalizeSkin(d));
        app.toast('Imported', 'ok');
      } catch (e) { app.toast(e.message, 'error'); }
    };
    r.readAsDataURL(file);
  };
  const exportPng = () => {
    const a = document.createElement('a');
    a.href = toDataUrl(img); a.download = `${(name || 'skin').replace(/[^\w.-]+/g, '_')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const save = async (asNew) => {
    try {
      const png = toDataUrl(img);
      let saved;
      if (skin.id && !asNew) { saved = await api.updateSkin(skin.id, { png, variant: model, name }); }
      else { saved = await api.addSkin({ png, name, variant: model, source: skin.source === 'player' ? 'player' : 'editor' }); }
      setDirty(false);
      onSaved && onSaved(saved);
      app.toast(`Saved ${saved.name || name}`, 'ok');
    } catch (e) { app.toast(e.message, 'error'); }
  };
  const close = () => { if (!dirty || window.confirm('Close without saving your changes?')) onClose(); };
  const clearLayer = () => {
    hist.current.push(img);
    const next = cloneImage(img);
    pixelMap(model).forEach((p, i) => { if (p && p.layer === layer) next.data.fill(0, i * 4, i * 4 + 4); });
    change(next);
  };

  const hoverInfo = useMemo(() => (hover ? pixelInfo(hover[0], hover[1], model) : null), [hover, model]);

  return createPortal(
    <div className="scrim editor-scrim">
      <div className="skin-editor glass strong" onMouseLeave={() => setHover(null)}>
        <div className="se-head">
          <Icon name="pencil" size={18} />
          <input className="se-name" value={name} maxLength={48} onChange={(e) => { setName(e.target.value); setDirty(true); }} title="Skin name" />
          {skin.source === 'player' && skin.owner && <span className="pill" title="Loaded from this player's profile">from {skin.owner}</span>}
          <div className="grow" />
          <button className="btn sm ghost icon-btn" title={`Undo (${MOD}Z)`} disabled={!hist.current.canUndo} onClick={undo}><Icon name="undo" size={15} /></button>
          <button className="btn sm ghost icon-btn" title={`Redo (${SHIFT_MOD}Z)`} disabled={!hist.current.canRedo} onClick={redo}><Icon name="redo" size={15} /></button>
          <button className="btn sm" title="Load a 64×64 PNG" onClick={() => fileRef.current.click()}><Icon name="upload" size={14} />Import</button>
          <button className="btn sm" title="Download as PNG" disabled={!img} onClick={exportPng}><Icon name="download" size={14} />Export</button>
          <input ref={fileRef} type="file" accept="image/png" hidden onChange={(e) => { const f = e.target.files[0]; if (f) importPng(f); e.target.value = ''; }} />
          <button className="btn ghost sm icon-btn" title="Close" onClick={close}><Icon name="x" size={15} /></button>
        </div>
        <div className="se-body">
          <div className="se-tools glass flat">
            {TOOLS.map((t) => <button key={t.id} className={`se-tool ${tool === t.id ? 'on' : ''}`} title={t.label} onClick={() => setTool(t.id)}><Icon name={t.icon} size={18} /></button>)}
            <div className="se-sep" />
            <button className={`se-tool ${mirror ? 'on' : ''}`} title="Mirror left/right (M)" onClick={() => setMirror(!mirror)}><Icon name="mirror" size={18} /></button>
            <button className={`se-tool ${grid ? 'on' : ''}`} title="Grid" onClick={() => setGrid(!grid)}><Icon name="grid" size={18} /></button>
            <button className={`se-tool ${showOther ? 'on' : ''}`} title="Show the other layer" onClick={() => setShowOther(!showOther)}><Icon name="layers" size={18} /></button>
            <div className="se-sep" />
            <button className="se-tool" title="Clear this layer" onClick={clearLayer}><Icon name="trash" size={17} /></button>
          </div>
          <div className="se-canvas-wrap">
            <canvas ref={canvas} width={SIZE * PX} height={SIZE * PX} className={`se-canvas tool-${tool}`} onMouseDown={down} onMouseMove={move} />
            <div className="se-status faint">
              {hoverInfo ? <>{PART_LABELS[hoverInfo.part]} · {hoverInfo.face} · {LAYER_LABELS[hoverInfo.layer]}{hoverInfo.layer !== layer ? ' (click to switch)' : ''}</> : 'Paint on the flat skin; the model updates live.'}
              <span className="grow" />{hover ? `${hover[0]}, ${hover[1]}` : ''}
            </div>
          </div>
          <div className="se-side">
            <div className="se-preview">
              <div className="stage-glow" />
              {preview && <SkinViewer skin={preview} variant={model} animation="idle" width={250} height={300} rotate={false} zoom={0.9} />}
            </div>
            <Segmented value={layer} onChange={setLayer} options={[{ value: 'base', label: 'Base' }, { value: 'over', label: 'Outer layer' }]} />
            <Segmented value={model} onChange={(v) => { setModel(v); setDirty(true); }} options={[{ value: 'classic', label: 'Classic' }, { value: 'slim', label: 'Slim' }]} />
            <div className="se-color">
              <label className="se-swatch-big" title="Pick any color" style={{ background: color }}><input type="color" value={color} onChange={(e) => setColor(e.target.value)} onBlur={() => remember(color)} /></label>
              <div className="field" style={{ flex: 1 }}><input className="mono" value={color} maxLength={7} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setColor(e.target.value)} title="Hex color" /></div>
            </div>
            <div className="se-palette">{PALETTE.map((c) => <button key={c} title={c} style={{ background: c }} className={color === c ? 'on' : ''} onClick={() => { setColor(c); if (tool === 'eraser' || tool === 'picker') setTool('pencil'); }} />)}</div>
            {recent.length > 0 && <><div className="form-label" style={{ margin: '2px 0 0' }}>Recent</div><div className="se-palette">{recent.map((c) => <button key={c} title={c} style={{ background: c }} onClick={() => setColor(c)} />)}</div></>}
            <div className="grow" />
            <div className="row" style={{ gap: 8 }}>
              {skin.id && <button className="btn grow" disabled={!img} title="Keep the original and save a copy" onClick={() => save(true)}>Save copy</button>}
              <button className="btn primary grow" disabled={!img} title={skin.id ? 'Overwrite this skin' : 'Add to your library'} onClick={() => save(false)}><Icon name="check" size={15} />{skin.id ? 'Save' : 'Save to library'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
