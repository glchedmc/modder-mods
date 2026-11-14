'use strict';
// Writes git-ignored core/builtin-private.js from a local secrets file or env.
// Never prints the key itself.
const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, '..', 'core', 'builtin-private.js');
const candidates = [
  process.env.CURSEFORGE_KEY_FILE,
  path.join(__dirname, '..', '..', 'secrets', 'curseforge.key'),
  path.join(__dirname, '..', 'secrets', 'curseforge.key'),
].filter(Boolean);

function findKey() {
  if (process.env.CURSEFORGE_API_KEY) return String(process.env.CURSEFORGE_API_KEY).trim();
  for (const file of candidates) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value) return value;
    } catch { /* try the next path */ }
  }
  return null;
}

const key = findKey();
if (!key) {
  console.log('inject-defaults: no CurseForge key found; the app will ship without a built-in key');
  process.exit(0);
}
if (key.length < 20) {
  console.error('inject-defaults: key is unexpectedly short; refusing to write');
  process.exit(1);
}
const body = `'use strict';\n// Generated at build time. Do not commit.\nmodule.exports = { curseforgeApiKey: ${JSON.stringify(key)} };\n`;
fs.writeFileSync(dest, body, { mode: 0o600 });
console.log(`inject-defaults: wrote built-in CurseForge key (${key.length} chars)`);
