'use strict';
// Asset index + object downloads.
const path = require('path');
const fsp = require('fs/promises');
const { download } = require('./net');

const RESOURCES = 'https://resources.download.minecraft.net/';

/** Asset indexes from before 1.7 want files by name: "virtual" in assets/virtual/<id>, "map_to_resources" in <game>/resources. */
function legacyAssetDir(version, assetsDir) {
  const id = version.assetIndex ? version.assetIndex.id : version.assets;
  return id === 'legacy' || id === 'pre-1.6' ? path.join(assetsDir, 'virtual', id) : null;
}

async function materializeLegacyAssets(version, assetsDir, gameDir) {
  const idx = version.assetIndex;
  if (!idx) return null;
  const index = JSON.parse(await fsp.readFile(path.join(assetsDir, 'indexes', `${idx.id}.json`), 'utf8'));
  if (!index.virtual && !index.map_to_resources) return null;
  const targets = [];
  if (index.virtual || index.map_to_resources) targets.push(path.join(assetsDir, 'virtual', idx.id));
  if (index.map_to_resources) targets.push(path.join(gameDir, 'resources'));
  for (const [name, { hash, size }] of Object.entries(index.objects)) {
    const src = path.join(assetsDir, 'objects', hash.slice(0, 2), hash);
    for (const root of targets) {
      const dest = path.join(root, ...name.split('/'));
      if (!dest.startsWith(root + path.sep)) continue; // ignore odd names
      try { if ((await fsp.stat(dest)).size === size) continue; } catch { /* missing */ }
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(src, dest);
    }
  }
  return targets;
}

async function assetFiles(version, assetsDir) {
  const idx = version.assetIndex;
  if (!idx) return [];
  const indexFile = path.join(assetsDir, 'indexes', `${idx.id}.json`);
  await download(idx.url, indexFile, { sha1: idx.sha1 });
  const index = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
  return Object.values(index.objects).map(({ hash, size }) => ({
    url: `${RESOURCES}${hash.slice(0, 2)}/${hash}`,
    path: path.join(assetsDir, 'objects', hash.slice(0, 2), hash),
    sha1: hash,
    size,
    quick: true,
  }));
}

module.exports = { assetFiles, legacyAssetDir, materializeLegacyAssets, RESOURCES };
