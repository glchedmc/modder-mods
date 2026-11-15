'use strict';
// One-time move of user data from the old "Glass Launcher" folder to "Saturn Client".
const fs = require('fs');
const path = require('path');

const LEGACY_NAMES = ['Glass Launcher'];

/**
 * Moves legacy data into newDir when newDir has no settings yet. Returns
 * {migrated, from} or {migrated:false}. Never deletes anything: entries that
 * already exist in newDir are left in the old folder.
 */
function migrateDataDir(appDataDir, newDir, { names = LEGACY_NAMES, fsImpl = fs } = {}) {
  if (fsImpl.existsSync(path.join(newDir, 'settings.json'))) return { migrated: false };
  for (const name of names) {
    const old = path.join(appDataDir, name);
    if (old === newDir || !fsImpl.existsSync(path.join(old, 'settings.json'))) continue;
    fsImpl.mkdirSync(newDir, { recursive: true });
    const moved = [];
    for (const entry of fsImpl.readdirSync(old)) {
      const to = path.join(newDir, entry === 'secrets.bin' ? 'secrets-legacy.bin' : entry);
      if (fsImpl.existsSync(to)) continue;
      fsImpl.renameSync(path.join(old, entry), to);
      moved.push(entry);
    }
    fsImpl.writeFileSync(path.join(old, 'MOVED-TO-SATURN-CLIENT.txt'), `Your Glass Launcher data moved to ${newDir} on ${new Date().toISOString()}.\n`);
    return { migrated: true, from: old, moved };
  }
  return { migrated: false };
}

module.exports = { migrateDataDir, LEGACY_NAMES };
