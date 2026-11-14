'use strict';
// Public, committed defaults. The CurseForge API key is loaded from the
// git-ignored file core/builtin-private.js, which scripts/inject-defaults.js
// writes at build time so the key is packaged into the app but never committed.
// electron-builder omits gitignored files from the asar, so the packaged app
// also looks next to the asar in process.resourcesPath (see extraResources).
const path = require('path');
const PUBLIC_MSA_CLIENT_ID = '8e130755-4b0b-4252-bc49-40cfa995f0d3';

function loadPrivate() {
  const files = [path.join(__dirname, 'builtin-private.js')];
  if (process.resourcesPath) files.push(path.join(process.resourcesPath, 'builtin-private.js'));
  for (const file of files) {
    try { return require(file); } catch { /* try the next location */ }
  }
  return {};
}

const priv = loadPrivate();
const builtinCurseforgeKey = typeof priv.curseforgeApiKey === 'string' && priv.curseforgeApiKey ? priv.curseforgeApiKey : null;

module.exports = {
  PUBLIC_MSA_CLIENT_ID,
  msaClientId: PUBLIC_MSA_CLIENT_ID,
  hasBuiltinCurseforgeKey: Boolean(builtinCurseforgeKey),
  /** Built-in CurseForge key, or null. Do not log the return value. */
  curseforgeApiKey: () => builtinCurseforgeKey,
};
