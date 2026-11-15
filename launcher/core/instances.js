'use strict';
// Instance (client profile) and server storage. Each lives in its own folder
// with an instance.json describing it.
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { exists, readJsonSafe } = require('./util');
const { DEFAULT_VERSION } = require('./mojang');

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'instance';
}

function instanceDir(dirs, id) {
  return path.join(dirs.instances, id);
}

function defaults(partial) {
  const loader = partial.loader || 'fabric';
  const server = loader === 'paper' || loader === 'purpur' || loader === 'fabric-server';
  return {
    id: partial.id,
    name: partial.name || 'New Instance',
    mcVersion: partial.mcVersion || DEFAULT_VERSION,
    loader,
    loaderVersion: partial.loaderVersion || null,
    type: server ? 'server' : 'client',
    versionId: null,
    accent: partial.accent || '#7aa8ff',
    icon: partial.icon || (server ? 'server' : 'grass'),
    background: partial.background || 'art',
    backgroundSolid: partial.backgroundSolid || null,
    customBackground: partial.customBackground || null,
    memoryMb: partial.memoryMb || 4096,
    jvmArgs: partial.jvmArgs || '',
    resolution: partial.resolution || null,
    companion: partial.companion !== false && (loader === 'fabric' || loader === 'quilt'),
    mods: [],
    createdAt: new Date().toISOString(),
    lastPlayed: null,
    playTimeSec: 0,
  };
}

async function list(dirs) {
  const out = [];
  let entries = [];
  try { entries = await fsp.readdir(dirs.instances); } catch { return out; }
  for (const e of entries) {
    const meta = await readJsonSafe(path.join(dirs.instances, e, 'instance.json'));
    if (meta) out.push(meta);
  }
  out.sort((a, b) => String(b.lastPlayed || b.createdAt).localeCompare(String(a.lastPlayed || a.createdAt)));
  return out;
}

async function get(dirs, id) {
  const meta = await readJsonSafe(path.join(instanceDir(dirs, id), 'instance.json'));
  if (!meta) throw new Error(`Instance ${id} not found`);
  return meta;
}

async function save(dirs, meta) {
  const dir = instanceDir(dirs, meta.id);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'instance.json'), JSON.stringify(meta, null, 2));
  return meta;
}

async function create(dirs, partial) {
  let id = slugify(partial.name || 'instance');
  while (await exists(instanceDir(dirs, id))) id = `${slugify(partial.name)}-${crypto.randomBytes(2).toString('hex')}`;
  const meta = defaults({ ...partial, id });
  const dir = instanceDir(dirs, id);
  const sub = meta.type === 'server' ? [meta.loader === 'fabric-server' ? 'mods' : 'plugins', 'config'] : ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves', 'screenshots', 'schematics'];
  for (const s of sub) await fsp.mkdir(path.join(dir, s), { recursive: true });
  return save(dirs, meta);
}

async function update(dirs, id, patch) {
  const meta = await get(dirs, id);
  const next = { ...meta, ...patch, id: meta.id };
  return save(dirs, next);
}

async function remove(dirs, id) {
  await fsp.rm(instanceDir(dirs, id), { recursive: true, force: true });
}

module.exports = { list, get, save, create, update, remove, instanceDir, slugify, defaults };
