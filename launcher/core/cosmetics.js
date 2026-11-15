'use strict';
// Saturn cosmetics. The launcher owns the catalog and what is equipped; the
// companion mod renders the cape (and, optionally, the selected library skin)
// for the local player only. Nothing is uploaded, so other players see your
// normal Minecraft skin and cape: cosmetics are visible to you.
const fsp = require('fs/promises');
const path = require('path');
const { readJsonSafe } = require('./util');
const { validateCape, validateSkin, toBuffer } = require('./skins/png');

const SLOTS = ['cape', 'hat', 'wings'];
// Items rendered in game by the companion mod. Hats and wings preview in the launcher.
const IN_GAME = { cape: true, hat: false, wings: false };
const CONFIG = 'glass-companion-cosmetics.json';
const CAPE_FILE = 'glass-companion-cape.png';
const SKIN_FILE = 'glass-companion-skin.png';

const DEFAULT_STATE = { equipped: { cape: null, hat: null, wings: null }, capeOnElytra: true, localSkin: false, customCapes: [] };

function sanitizeState(s) {
  const out = { ...DEFAULT_STATE, ...(s || {}), equipped: { ...DEFAULT_STATE.equipped, ...((s && s.equipped) || {}) } };
  for (const k of Object.keys(out.equipped)) if (!SLOTS.includes(k)) delete out.equipped[k];
  for (const k of SLOTS) if (out.equipped[k] !== null && !/^[a-z0-9-]{1,40}$/.test(String(out.equipped[k]))) out.equipped[k] = null;
  out.capeOnElytra = out.capeOnElytra !== false;
  out.localSkin = Boolean(out.localSkin);
  out.customCapes = Array.isArray(out.customCapes) ? out.customCapes.filter((c) => c && /^custom-[a-f0-9]{8}$/.test(c.id)).slice(0, 24) : [];
  return out;
}

class CosmeticsStore {
  constructor(dir) { this.dir = dir; this.file = path.join(dir, 'cosmetics.json'); }
  async get() { return sanitizeState(await readJsonSafe(this.file, {})); }
  async save(state) {
    await fsp.mkdir(this.dir, { recursive: true });
    const clean = sanitizeState(state);
    await fsp.writeFile(this.file, JSON.stringify(clean, null, 2));
    return clean;
  }
  capePath() { return path.join(this.dir, 'equipped-cape.png'); }
  customPath(id) {
    if (!/^custom-[a-f0-9]{8}$/.test(id)) throw new Error('Bad cosmetic id');
    return path.join(this.dir, `${id}.png`);
  }

  /** The renderer draws built-in capes; the PNG of the equipped one is stored here. */
  async setCapeTexture(png) {
    if (!png) { await fsp.rm(this.capePath(), { force: true }); return; }
    const buf = toBuffer(png);
    validateCape(buf);
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(this.capePath(), buf);
  }

  async addCustomCape(png, name) {
    const buf = toBuffer(png);
    validateCape(buf);
    const id = `custom-${require('crypto').randomBytes(4).toString('hex')}`;
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(this.customPath(id), buf);
    const s = await this.get();
    s.customCapes.unshift({ id, name: String(name || 'My cape').slice(0, 40) });
    await this.save(s);
    return { id, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
  }

  async removeCustomCape(id) {
    const s = await this.get();
    s.customCapes = s.customCapes.filter((c) => c.id !== id);
    if (s.equipped.cape === id) { s.equipped.cape = null; await this.setCapeTexture(null); }
    await fsp.rm(this.customPath(id), { force: true });
    return this.save(s);
  }

  async customCapeUrls() {
    const s = await this.get();
    const out = {};
    for (const c of s.customCapes) {
      try { out[c.id] = `data:image/png;base64,${(await fsp.readFile(this.customPath(c.id))).toString('base64')}`; } catch { /* missing */ }
    }
    return out;
  }
}

/**
 * Writes the companion mod's cosmetics config (and textures) into an instance.
 * skin: optional {png, variant} for the "use my library skin in game" option.
 */
async function syncInstance(instanceDir, store, { skin } = {}) {
  const state = await store.get();
  const cfgDir = path.join(instanceDir, 'config');
  await fsp.mkdir(cfgDir, { recursive: true });
  const conf = { version: 1, visibility: 'local' };
  let capeBuf = null;
  try { capeBuf = state.equipped.cape ? await fsp.readFile(store.capePath()) : null; } catch { capeBuf = null; }
  if (capeBuf) {
    await fsp.writeFile(path.join(cfgDir, CAPE_FILE), capeBuf);
    conf.cape = { enabled: true, file: CAPE_FILE, elytra: state.capeOnElytra, id: state.equipped.cape };
  } else {
    await fsp.rm(path.join(cfgDir, CAPE_FILE), { force: true });
    conf.cape = { enabled: false };
  }
  if (state.localSkin && skin && skin.png) {
    validateSkin(skin.png);
    await fsp.writeFile(path.join(cfgDir, SKIN_FILE), skin.png);
    conf.skin = { enabled: true, file: SKIN_FILE, slim: skin.variant === 'slim' };
  } else {
    await fsp.rm(path.join(cfgDir, SKIN_FILE), { force: true });
    conf.skin = { enabled: false };
  }
  conf.hat = state.equipped.hat; conf.wings = state.equipped.wings;
  await fsp.writeFile(path.join(cfgDir, CONFIG), JSON.stringify(conf, null, 2));
  return conf;
}

module.exports = { CosmeticsStore, syncInstance, sanitizeState, SLOTS, IN_GAME, CONFIG, CAPE_FILE, SKIN_FILE, DEFAULT_STATE };
