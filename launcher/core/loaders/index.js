'use strict';
// Mod loader installers. Each loader returns the version id to launch, after
// writing versions/<id>/<id>.json (inheriting from the vanilla version).
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const AdmZip = require('adm-zip');
const { fetchJson, download, exists } = require('../net');
const { writeJson } = require('../mojang');

const run = promisify(execFile);

const LOADERS = {
  vanilla: { label: 'Vanilla', kind: 'client' },
  fabric: { label: 'Fabric', kind: 'client' },
  quilt: { label: 'Quilt', kind: 'client' },
  forge: { label: 'Forge', kind: 'client' },
  neoforge: { label: 'NeoForge', kind: 'client' },
  paper: { label: 'Paper', kind: 'server' },
  purpur: { label: 'Purpur', kind: 'server' },
};

// ---------- Fabric / Quilt (meta servers serve ready-made launcher profiles) ----------
const META = {
  fabric: 'https://meta.fabricmc.net/v2',
  quilt: 'https://meta.quiltmc.org/v3',
};

async function listMetaLoaderVersions(loader, mc) {
  const list = await fetchJson(`${META[loader]}/versions/loader/${encodeURIComponent(mc)}`);
  return list.map((e) => ({ version: e.loader.version, stable: e.loader.stable !== false && !/beta|alpha/.test(e.loader.version) }));
}

async function installMetaLoader(loader, dirs, mc, loaderVersion) {
  if (!loaderVersion) {
    const versions = await listMetaLoaderVersions(loader, mc);
    if (!versions.length) throw new Error(`${LOADERS[loader].label} has no loader for Minecraft ${mc} yet`);
    loaderVersion = (versions.find((v) => v.stable) || versions[0]).version;
  }
  const profile = await fetchJson(`${META[loader]}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(loaderVersion)}/profile/json`);
  await writeJson(path.join(dirs.versions, profile.id, `${profile.id}.json`), profile);
  return { versionId: profile.id, loaderVersion };
}

// ---------- Forge / NeoForge (run the official installer headlessly) ----------
async function listForgeVersions(mc) {
  const promos = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
  const out = [];
  for (const tag of ['recommended', 'latest']) {
    const v = promos.promos[`${mc}-${tag}`];
    if (v && !out.some((o) => o.version === v)) out.push({ version: v, stable: tag === 'recommended' });
  }
  return out;
}

/** NeoForge versions are "<mc minor>.<mc patch>.<build>" e.g. 26.3.0.103 for MC 26.3. */
function neoforgePrefix(mc) {
  const parts = mc.split('.');
  if (parts[0] === '1') return `${parts[1]}.${parts[2] || 0}.`; // 1.21.1 -> 21.1.
  return `${parts[0]}.${parts[1]}.${parts[2] || 0}.`; // 26.3 -> 26.3.0.
}

async function listNeoForgeVersions(mc) {
  const data = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
  const prefix = neoforgePrefix(mc);
  return data.versions.filter((v) => v.startsWith(prefix)).reverse().map((v) => ({ version: v, stable: !/beta|alpha/.test(v) }));
}

function installerUrl(loader, mc, version) {
  if (loader === 'forge') {
    const full = `${mc}-${version}`;
    return `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
  }
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
}

async function installForgeLike(loader, dirs, mc, loaderVersion, { java, onLog } = {}) {
  if (!loaderVersion) {
    const list = loader === 'forge' ? await listForgeVersions(mc) : await listNeoForgeVersions(mc);
    if (!list.length) throw new Error(`${LOADERS[loader].label} has no build for Minecraft ${mc} yet`);
    loaderVersion = (list.find((v) => v.stable) || list[0]).version;
  }
  if (!java) throw new Error('A Java runtime is required to run the installer');
  const url = installerUrl(loader, mc, loaderVersion);
  const jar = path.join(dirs.cache, path.basename(url));
  await download(url, jar);
  const versionJson = JSON.parse(new AdmZip(jar).readAsText('version.json'));
  const id = versionJson.id;
  if (await exists(path.join(dirs.versions, id, `${id}.json`))) return { versionId: id, loaderVersion };
  // The installers expect an official-launcher layout with launcher_profiles.json.
  const profiles = path.join(dirs.root, 'launcher_profiles.json');
  if (!(await exists(profiles))) await writeJson(profiles, { profiles: {}, settings: {}, version: 3 });
  if (onLog) onLog(`Running ${path.basename(jar)} --installClient`);
  const { stdout, stderr } = await run(java, ['-jar', jar, '--installClient', dirs.root], {
    cwd: dirs.cache, maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000,
  });
  if (onLog) onLog((stdout + stderr).split('\n').slice(-20).join('\n'));
  if (!(await exists(path.join(dirs.versions, id, `${id}.json`)))) {
    throw new Error(`${LOADERS[loader].label} installer finished but versions/${id} is missing`);
  }
  return { versionId: id, loaderVersion };
}

// ---------- Paper / Purpur servers ----------
async function listPaperBuilds(mc) {
  const data = await fetchJson(`https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(mc)}/builds`);
  return data.map((b) => ({ version: String(b.id), stable: b.channel === 'STABLE', url: b.downloads && b.downloads['server:default'] && b.downloads['server:default'].url, sha256: b.downloads && b.downloads['server:default'] && b.downloads['server:default'].checksums.sha256 }));
}

async function listPurpurBuilds(mc) {
  const data = await fetchJson(`https://api.purpurmc.org/v2/purpur/${encodeURIComponent(mc)}`);
  return (data.builds.all || []).slice().reverse().map((b) => ({ version: b, stable: true }));
}

async function installServer(loader, serverDir, mc, build) {
  let url;
  if (loader === 'paper') {
    const builds = await listPaperBuilds(mc);
    if (!builds.length) throw new Error(`Paper has no builds for ${mc} yet`);
    const pick = (build && builds.find((b) => b.version === String(build))) || builds.find((b) => b.stable) || builds[0];
    url = pick.url; build = pick.version;
  } else if (loader === 'purpur') {
    if (!build) { const b = await listPurpurBuilds(mc); if (!b.length) throw new Error(`Purpur has no builds for ${mc}`); build = b[0].version; }
    url = `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(mc)}/${build}/download`;
  } else {
    throw new Error(`${loader} is not a server platform`);
  }
  const jar = path.join(serverDir, 'server.jar');
  await download(url, jar);
  await fsp.writeFile(path.join(serverDir, 'start.command'),
    '#!/bin/sh\ncd "$(dirname "$0")"\nexec java -Xms2G -Xmx4G -jar server.jar --nogui\n', { mode: 0o755 });
  return { build, jar };
}

async function listLoaderVersions(loader, mc) {
  switch (loader) {
    case 'vanilla': return [];
    case 'fabric': case 'quilt': return listMetaLoaderVersions(loader, mc);
    case 'forge': return listForgeVersions(mc);
    case 'neoforge': return listNeoForgeVersions(mc);
    case 'paper': return listPaperBuilds(mc);
    case 'purpur': return listPurpurBuilds(mc);
    default: throw new Error(`Unknown loader ${loader}`);
  }
}

/** Installs the loader profile for a client instance and returns the version id to launch. */
async function installClientLoader(loader, dirs, mc, loaderVersion, opts = {}) {
  switch (loader) {
    case 'vanilla': return { versionId: mc, loaderVersion: null };
    case 'fabric': case 'quilt': return installMetaLoader(loader, dirs, mc, loaderVersion);
    case 'forge': case 'neoforge': return installForgeLike(loader, dirs, mc, loaderVersion, opts);
    default: throw new Error(`${loader} is not a client loader`);
  }
}

module.exports = {
  LOADERS, listLoaderVersions, installClientLoader, installServer, neoforgePrefix, installerUrl,
};
