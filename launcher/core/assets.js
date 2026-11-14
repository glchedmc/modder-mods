'use strict';
// Asset index + object downloads.
const path = require('path');
const fsp = require('fs/promises');
const { download } = require('./net');

const RESOURCES = 'https://resources.download.minecraft.net/';

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

module.exports = { assetFiles, RESOURCES };
