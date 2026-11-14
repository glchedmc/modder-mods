'use strict';
// Installs mods into an instance with dependency resolution and keeps the
// instance's mod list in instance.json in sync with the mods folder.
const fsp = require('fs/promises');
const path = require('path');
const modrinth = require('./modrinth');
const curseforge = require('./curseforge');
const { download, sha1File } = require('../net');

function loaderCandidates(loader) {
  // Quilt runs most Fabric mods; NeoForge does not run Forge mods on modern versions.
  if (loader === 'quilt') return ['quilt', 'fabric'];
  return [loader];
}

function contentFolder(instance, projectType) {
  if (instance.type === 'server') return 'plugins';
  return { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' }[projectType] || 'mods';
}

/** Picks the best Modrinth version for the instance (release > beta > alpha, newest first). */
function pickVersion(versions) {
  const rank = { release: 0, beta: 1, alpha: 2 };
  return [...versions].sort((a, b) => (rank[a.version_type] - rank[b.version_type]) || b.date_published.localeCompare(a.date_published))[0] || null;
}

/**
 * Plans a Modrinth install: the project plus all required dependencies,
 * recursively, skipping ones already installed. Returns {plan, missing}.
 */
async function planModrinth(instance, projectId, { versionId, api = modrinth } = {}) {
  const loaders = instance.type === 'server' ? [instance.loader] : loaderCandidates(instance.loader);
  const gameVersions = [instance.mcVersion];
  const installed = new Set((instance.mods || []).filter((m) => m.source === 'modrinth').map((m) => m.projectId));
  const plan = [];
  const missing = [];
  const seen = new Set();

  async function visit(pid, vid, requiredBy) {
    if (seen.has(pid) || installed.has(pid)) return;
    seen.add(pid);
    let version;
    if (vid) version = await api.getVersion(vid);
    else version = pickVersion(await api.getVersions(pid, { loaders, gameVersions }));
    if (!version) { missing.push({ projectId: pid, requiredBy }); return; }
    plan.push({ projectId: pid, version, requiredBy });
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== 'required') continue;
      const depPid = dep.project_id || (dep.version_id && (await api.getVersion(dep.version_id)).project_id);
      if (depPid) await visit(depPid, dep.version_id || null, pid);
    }
  }
  await visit(projectId, versionId || null, null);
  return { plan, missing };
}

async function planCurseForge(instance, modId, apiKey, { fileId, api = curseforge } = {}) {
  const installed = new Set((instance.mods || []).filter((m) => m.source === 'curseforge').map((m) => m.projectId));
  const plan = [];
  const missing = [];
  const seen = new Set();
  async function visit(id, requiredBy, fid) {
    if (seen.has(id) || installed.has(id)) return;
    seen.add(id);
    const files = await api.getFiles(apiKey, id, { gameVersion: instance.mcVersion, loader: instance.loader });
    const file = fid ? files.find((f) => String(f.id) === String(fid)) : files.sort((a, b) => (a.releaseType - b.releaseType) || b.fileDate.localeCompare(a.fileDate))[0];
    if (!file) { missing.push({ projectId: id, requiredBy }); return; }
    plan.push({ projectId: id, file, requiredBy });
    for (const dep of api.requiredDependencies(file)) await visit(dep, id);
  }
  await visit(String(modId), null, fileId);
  return { plan, missing };
}

/** Downloads planned files into the instance and returns the new mod entries. */
async function applyPlan(instanceDir, instance, source, plan, { projectType = 'mod', titles = {}, onLog = () => {} } = {}) {
  const folder = path.join(instanceDir, contentFolder(instance, projectType));
  await fsp.mkdir(folder, { recursive: true });
  const added = [];
  for (const item of plan) {
    let fileName; let url; let sha1; let versionName; let versionId;
    if (source === 'modrinth') {
      const f = modrinth.primaryFile(item.version);
      fileName = f.filename; url = f.url; sha1 = f.hashes && f.hashes.sha1;
      versionName = item.version.version_number; versionId = item.version.id;
    } else {
      fileName = item.file.fileName; url = curseforge.fileDownloadUrl(item.file);
      const h = (item.file.hashes || []).find((x) => x.algo === 1); sha1 = h && h.value;
      versionName = item.file.displayName; versionId = String(item.file.id);
    }
    onLog(`Downloading ${fileName}`);
    await download(url, path.join(folder, fileName), { sha1 });
    added.push({
      source, projectId: item.projectId, versionId, versionName, file: fileName, folder: path.basename(folder),
      title: titles[item.projectId] || fileName.replace(/\.jar$/, ''), enabled: true, dependencyOf: item.requiredBy,
      gameVersion: instance.mcVersion, installedAt: new Date().toISOString(),
    });
  }
  return added;
}

/** Toggle a mod on/off by renaming to .disabled (the convention all loaders skip). */
async function setEnabled(instanceDir, mod, enabled) {
  const dir = path.join(instanceDir, mod.folder || 'mods');
  const on = path.join(dir, mod.file);
  const off = `${on}.disabled`;
  if (enabled) await fsp.rename(off, on).catch(() => {});
  else await fsp.rename(on, off).catch(() => {});
  return { ...mod, enabled };
}

async function removeMod(instanceDir, mod) {
  const dir = path.join(instanceDir, mod.folder || 'mods');
  await fsp.rm(path.join(dir, mod.file), { force: true });
  await fsp.rm(path.join(dir, `${mod.file}.disabled`), { force: true });
}

/**
 * Checks each installed Modrinth mod against the instance's game version.
 * status: 'ok' | 'update' (newer compatible build) | 'needs-port' (no build
 * for this game version: offer the Grok upgrade) | 'unknown'.
 */
async function checkCompatibility(instanceDir, instance, { api = modrinth } = {}) {
  const mods = (instance.mods || []).filter((m) => (m.folder || 'mods') === 'mods');
  const loaders = loaderCandidates(instance.loader);
  const byHash = {};
  for (const m of mods) {
    if (m.source === 'grok-port' || m.source === 'companion') continue;
    const file = path.join(instanceDir, 'mods', m.enabled === false ? `${m.file}.disabled` : m.file);
    try { byHash[await sha1File(file)] = m; } catch { /* missing file */ }
  }
  const hashes = Object.keys(byHash);
  const [known, latest] = await Promise.all([
    api.versionsByHash(hashes).catch(() => ({})),
    api.latestForHashes(hashes, { loaders, gameVersions: [instance.mcVersion] }).catch(() => ({})),
  ]);
  const results = {};
  for (const h of hashes) {
    const m = byHash[h];
    const cur = known[h];
    const next = latest[h];
    if (!cur && m.source !== 'modrinth') { results[m.file] = { status: 'unknown' }; continue; }
    const curSupports = cur && cur.game_versions.includes(instance.mcVersion) && cur.loaders.some((l) => loaders.includes(l));
    if (next && cur && next.id !== cur.id) results[m.file] = { status: 'update', latestName: next.version_number, latestVersionId: next.id, projectId: next.project_id };
    else if (curSupports || next) results[m.file] = { status: 'ok' };
    else results[m.file] = { status: 'needs-port', projectId: (cur && cur.project_id) || m.projectId, gameVersions: cur ? cur.game_versions : [] };
  }
  for (const m of mods) {
    if (m.source === 'grok-port') results[m.file] = { status: 'ported' };
    if (m.source === 'companion') results[m.file] = { status: 'ok' };
  }
  return results;
}

module.exports = { planModrinth, planCurseForge, applyPlan, setEnabled, removeMod, checkCompatibility, pickVersion, loaderCandidates, contentFolder };
