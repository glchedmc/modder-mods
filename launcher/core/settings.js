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
  glassIntensity: 0.7,
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
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  }
  return out;
}

async function load(file) {
  return merge(DEFAULTS, await readJsonSafe(file, {}));
}

async function save(file, settings) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const clean = merge(DEFAULTS, settings);
  await fsp.writeFile(file, JSON.stringify(clean, null, 2));
  return clean;
}

module.exports = { DEFAULTS, load, save, merge };
