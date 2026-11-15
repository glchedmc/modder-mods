'use strict';
// Non-secret launcher settings (secrets live in SecretStore).
const fsp = require('fs/promises');
const path = require('path');
const { readJsonSafe } = require('./util');
const companion = require('./companion');
const defaults = require('./defaults');

const DEFAULTS = {
  defaultVersion: '26.3',
  defaultLoader: 'fabric',
  memoryMb: 4096,
  javaPath: '',
  closeOnLaunch: false,
  showSnapshots: false,
  theme: 'auto', // auto | light | dark
  accent: '#7aa8ff',
  glassStrength: process.platform === 'linux' ? 0.45 : 0.75, // 0 = solid panels, no blur
  reduceTransparency: false,
  reduceMotion: false,
  backgroundId: 'highlands',
  backgroundSolid: '#1b1e52',
  customBackground: null,
  backgroundBlur: 0,
  backgroundDim: 0.2,
  backgroundParallax: 0.35,
  msaClientId: defaults.msaClientId,
  grokModel: 'grok-4.7',
  grokReasoning: 'high',
  grokMaxAttempts: 5,
  modSources: { modrinth: true, curseforge: true },
  companion: companion.DEFAULT_CONFIG,
  selectedInstance: null,
  sidebarCollapsed: false,
  sidebarMode: 'icons', // icons | hidden (what "collapsed" means)
  appIcon: 'saturn', // saturn | wireframe | crystal (dock icon)
  micPrompted: false,
  skinAiProvider: 'grok', // grok | openai
  skinAiGrokModel: 'grok-imagine-image-2.0',
  skinAiOpenaiModel: 'gpt-image-1',
  hostProvider: 'p2p', // p2p | tailscale | direct | e4mc
  hostDdnsName: '',
  socialEnabled: true, // Friends & chat over Nostr relays
  socialDisplayName: '', // shown until Microsoft sign-in gives a Minecraft name
  socialDiscoverable: true, // publish a profile so friend codes can be looked up
  socialRelays: [], // empty = built-in list
  socialNotifications: true,
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  }
  return out;
}

/** Older builds stored a 0.2–1 "glassIntensity"; carry it over once. */
function upgrade(raw) {
  const r = { ...(raw || {}) };
  if (r.glassStrength === undefined && typeof r.glassIntensity === 'number') r.glassStrength = r.glassIntensity;
  delete r.glassIntensity;
  if (typeof r.glassStrength === 'number') r.glassStrength = Math.min(1, Math.max(0, r.glassStrength));
  return r;
}

async function load(file) {
  return merge(DEFAULTS, upgrade(await readJsonSafe(file, {})));
}

async function save(file, settings) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const clean = merge(DEFAULTS, upgrade(settings));
  await fsp.writeFile(file, JSON.stringify(clean, null, 2));
  return clean;
}

module.exports = { DEFAULTS, load, save, merge, upgrade };
