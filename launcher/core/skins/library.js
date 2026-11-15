'use strict';
// Saved skins on disk: <data>/skins/index.json plus one <id>.png per skin.
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { readJsonSafe } = require('../util');
const { validateSkin, toBuffer } = require('./png');

const VARIANTS = ['classic', 'slim'];

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 48) || 'Untitled skin';
}

class SkinLibrary {
  constructor(dir) { this.dir = dir; this.index = path.join(dir, 'index.json'); }

  async read() { return readJsonSafe(this.index, { skins: [], selected: null }); }

  async write(data) {
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(this.index, JSON.stringify(data, null, 2));
  }

  fileFor(id) {
    if (!/^[a-f0-9]{12}$/.test(String(id))) throw new Error('Bad skin id');
    return path.join(this.dir, `${id}.png`);
  }

  /** Lists skins with their PNG as a data URL (each is only a few KB). */
  async list() {
    const data = await this.read();
    const out = [];
    for (const s of data.skins) {
      try { out.push({ ...s, dataUrl: `data:image/png;base64,${(await fsp.readFile(this.fileFor(s.id))).toString('base64')}` }); } catch { /* file missing */ }
    }
    return { skins: out, selected: data.selected };
  }

  async add({ png, name, variant = 'classic', source = 'upload', prompt } = {}) {
    const buf = toBuffer(png);
    const info = validateSkin(buf);
    const id = crypto.randomBytes(6).toString('hex');
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(this.fileFor(id), buf);
    const data = await this.read();
    const entry = { id, name: cleanName(name), variant: VARIANTS.includes(variant) ? variant : 'classic', source, legacy: info.legacy, createdAt: new Date().toISOString() };
    if (prompt) entry.prompt = String(prompt).slice(0, 400);
    data.skins.unshift(entry);
    if (!data.selected) data.selected = id;
    await this.write(data);
    return entry;
  }

  async update(id, patch = {}) {
    const data = await this.read();
    const s = data.skins.find((x) => x.id === id);
    if (!s) throw new Error('Skin not found');
    if (patch.name !== undefined) s.name = cleanName(patch.name);
    if (patch.variant !== undefined && VARIANTS.includes(patch.variant)) s.variant = patch.variant;
    if (patch.png !== undefined) {
      const buf = toBuffer(patch.png);
      s.legacy = validateSkin(buf).legacy;
      await fsp.writeFile(this.fileFor(id), buf);
      s.editedAt = new Date().toISOString();
    }
    await this.write(data);
    return s;
  }

  async select(id) {
    const data = await this.read();
    if (id && !data.skins.some((x) => x.id === id)) throw new Error('Skin not found');
    data.selected = id || null;
    await this.write(data);
    return data.selected;
  }

  async remove(id) {
    const data = await this.read();
    data.skins = data.skins.filter((x) => x.id !== id);
    if (data.selected === id) data.selected = data.skins[0] ? data.skins[0].id : null;
    await fsp.rm(this.fileFor(id), { force: true });
    await this.write(data);
  }

  async get(id) {
    const data = await this.read();
    const s = data.skins.find((x) => x.id === id);
    if (!s) throw new Error('Skin not found');
    return { ...s, png: await fsp.readFile(this.fileFor(id)) };
  }
}

module.exports = { SkinLibrary, VARIANTS, cleanName };
