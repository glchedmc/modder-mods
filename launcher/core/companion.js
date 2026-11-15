'use strict';
// The Saturn Client Companion Fabric mod (mod id glass-companion, kept for compatibility): feature catalog, config file, and install
// into instances. The launcher and the in-game menu share config/glass-companion.json.
const fsp = require('fs/promises');
const path = require('path');
const catalog = require('./companion-features.json');
const { readJsonSafe, exists } = require('./util');

const MOD_ID = 'glass-companion';
const CONFIG_FILE = 'glass-companion.json';
const DEFAULT_CONFIG = Object.fromEntries(catalog.features.map((f) => [f.key, f.default]));
const SUPPORTED_GAME_VERSIONS = ['26.3'];

function sanitize(config) {
  const out = { ...DEFAULT_CONFIG };
  for (const f of catalog.features) {
    const v = config ? config[f.key] : undefined;
    if (v === undefined) continue;
    if (f.type === 'bool') out[f.key] = Boolean(v);
    else if (f.type === 'number') {
      const n = Number(v);
      if (Number.isFinite(n)) out[f.key] = Math.min(f.max, Math.max(f.min, n));
    } else if (f.type === 'color') {
      if (/^#[0-9a-fA-F]{6}$/.test(String(v))) out[f.key] = String(v).toUpperCase();
    } else if (f.type === 'choice') {
      if (f.options.includes(String(v))) out[f.key] = String(v);
    } else if (f.type === 'layout') {
      // HUD editor positions: {element: [x, y]} as fractions of the screen.
      const lay = {};
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k, xy] of Object.entries(v)) {
          if (/^[a-z][a-zA-Z]{0,31}$/.test(k) && Array.isArray(xy) && xy.length === 2 && xy.every((n) => Number.isFinite(Number(n)))) {
            lay[k] = xy.map((n) => Math.min(1, Math.max(0, Number(n))));
          }
        }
      }
      out[f.key] = lay;
    }
  }
  return out;
}

async function readConfig(instanceDir) {
  return sanitize(await readJsonSafe(path.join(instanceDir, 'config', CONFIG_FILE), {}));
}

async function writeConfig(instanceDir, config) {
  const file = path.join(instanceDir, 'config', CONFIG_FILE);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const clean = sanitize(config);
  await fsp.writeFile(file, JSON.stringify(clean, null, 2));
  return clean;
}

function supports(instance) {
  return instance.type === 'client' && (instance.loader === 'fabric' || instance.loader === 'quilt') && SUPPORTED_GAME_VERSIONS.includes(instance.mcVersion);
}

/**
 * Copies the bundled companion jar into the instance (replacing older copies)
 * and seeds its config. Returns the mod entry, or null when not applicable.
 */
/**
 * Built-in modules that have a standalone Saturn mod: when that mod is in the
 * instance, the companion steps aside (it checks at runtime too).
 * Returns [{key, label, mods: [file...]}].
 */
function standaloneIn(mods) {
  const files = (mods || []).filter((m) => m.enabled !== false).map((m) => String(m.file || '').toLowerCase());
  const out = [];
  for (const f of catalog.features) {
    if (!f.standalone) continue;
    const hits = files.filter((file) => f.standalone.some((id) => file.startsWith(`${id}-`) || file === `${id}.jar`));
    if (hits.length) out.push({ key: f.key, label: f.label, mods: hits });
  }
  return out;
}

const MODULES = catalog.features.filter((f) => f.module).map((f) => ({ key: f.key, label: f.label, group: f.group, from: f.from || null, lunar: f.lunar || null, standalone: f.standalone || [] }));

async function install(instanceDir, instance, jarPath, config, overrides = {}) {
  if (!supports(instance) || !instance.companion) return null;
  if (!(await exists(jarPath))) throw new Error(`Companion jar missing at ${jarPath}`);
  const modsDir = path.join(instanceDir, 'mods');
  await fsp.mkdir(modsDir, { recursive: true });
  for (const f of await fsp.readdir(modsDir)) {
    if (f.startsWith(`${MOD_ID}-`) && f !== path.basename(jarPath)) await fsp.rm(path.join(modsDir, f), { force: true });
  }
  await fsp.copyFile(jarPath, path.join(modsDir, path.basename(jarPath)));
  // The in-game menu may have changed settings; the launcher copy only seeds missing keys.
  const existing = await readJsonSafe(path.join(instanceDir, 'config', CONFIG_FILE), null);
  // Launcher-owned keys (glass strength, accent) always follow the launcher.
  await writeConfig(instanceDir, { ...(existing ? { ...config, ...existing } : config), ...overrides });
  return {
    source: 'companion', projectId: MOD_ID, file: path.basename(jarPath), folder: 'mods',
    title: 'Saturn Client Companion', enabled: true, gameVersion: instance.mcVersion,
  };
}

module.exports = { MODULES, standaloneIn, MOD_ID, CONFIG_FILE, DEFAULT_CONFIG, catalog, sanitize, readConfig, writeConfig, install, supports };
