'use strict';
// Mojang version manifest and version JSON handling, including inheritsFrom merging.
const fsp = require('fs/promises');
const path = require('path');
const { fetchJson, download, exists } = require('./net');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const DEFAULT_VERSION = '26.3';

let manifestCache = null;

async function getManifest({ force = false } = {}) {
  if (manifestCache && !force) return manifestCache;
  manifestCache = await fetchJson(MANIFEST_URL);
  return manifestCache;
}

/** Version list for the picker: releases first, optional snapshots. */
async function listVersions({ snapshots = false } = {}) {
  const m = await getManifest();
  return m.versions
    .filter((v) => v.type === 'release' || (snapshots && v.type === 'snapshot'))
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
}

/** Fetches (or reads the cached) vanilla version JSON into versions/<id>/<id>.json. */
async function getVanillaVersion(dirs, id) {
  const file = path.join(dirs.versions, id, `${id}.json`);
  if (await exists(file)) return readJson(file);
  const m = await getManifest();
  const entry = m.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Minecraft version ${id} was not found in Mojang's manifest`);
  await download(entry.url, file, { sha1: entry.sha1 });
  return readJson(file);
}

/**
 * Merge a loader profile (child) onto its parent vanilla JSON the way the
 * official launcher does: child libraries come first (so loader libraries
 * win classpath conflicts), arguments are concatenated, scalar fields override.
 */
function mergeVersions(parent, child) {
  const merged = { ...parent, ...child };
  delete merged.inheritsFrom;
  // De-duplicate libraries by group:artifact(:classifier), child wins.
  const keyOf = (lib) => {
    const parts = lib.name.split(':');
    return [parts[0], parts[1], parts[3] || ''].join(':');
  };
  const seen = new Set();
  const libs = [];
  for (const lib of [...(child.libraries || []), ...(parent.libraries || [])]) {
    const k = keyOf(lib);
    if (seen.has(k)) continue;
    seen.add(k);
    libs.push(lib);
  }
  merged.libraries = libs;
  if (parent.arguments || child.arguments) {
    merged.arguments = {
      game: [...((parent.arguments && parent.arguments.game) || []), ...((child.arguments && child.arguments.game) || [])],
      jvm: [...((parent.arguments && parent.arguments.jvm) || []), ...((child.arguments && child.arguments.jvm) || [])],
    };
    if (parent.arguments && parent.arguments['default-user-jvm']) {
      merged.arguments['default-user-jvm'] = parent.arguments['default-user-jvm'];
    }
  }
  if (child.minecraftArguments) merged.minecraftArguments = child.minecraftArguments;
  merged.downloads = parent.downloads;
  merged.assetIndex = parent.assetIndex;
  merged.assets = parent.assets;
  merged.javaVersion = child.javaVersion || parent.javaVersion;
  merged.logging = parent.logging;
  merged.jar = child.jar || parent.id;
  return merged;
}

/** Reads versions/<id>/<id>.json and resolves inheritsFrom chains. */
async function resolveVersion(dirs, id) {
  const file = path.join(dirs.versions, id, `${id}.json`);
  let json;
  if (await exists(file)) json = await readJson(file);
  else json = await getVanillaVersion(dirs, id);
  if (json.inheritsFrom) {
    const parent = await resolveVersion(dirs, json.inheritsFrom);
    return mergeVersions(parent, json);
  }
  return json;
}

module.exports = {
  MANIFEST_URL, DEFAULT_VERSION, getManifest, listVersions, getVanillaVersion,
  mergeVersions, resolveVersion, readJson, writeJson,
};
