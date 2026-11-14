'use strict';
// Modrinth public API v2 (no key needed). https://docs.modrinth.com/api/
const { fetchJson } = require('../net');

const API = 'https://api.modrinth.com/v2';

const PROJECT_TYPES = ['mod', 'modpack', 'resourcepack', 'shader', 'datapack', 'plugin'];

function q(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`)
    .join('&');
}

function normalizeHit(h) {
  return {
    source: 'modrinth',
    id: h.project_id,
    slug: h.slug,
    title: h.title,
    author: h.author,
    summary: h.description,
    icon: h.icon_url || null,
    downloads: h.downloads,
    follows: h.follows,
    categories: h.display_categories || h.categories || [],
    versions: h.versions || [],
    latestVersion: h.latest_version,
    projectType: h.project_type,
    updated: h.date_modified,
    url: `https://modrinth.com/${h.project_type}/${h.slug}`,
  };
}

/**
 * Search projects. `versionFilter` false shows every game version (the UI uses
 * this to surface mods that need a Grok upgrade).
 */
async function search({ query = '', loader, gameVersion, projectType = 'mod', sort = 'relevance', offset = 0, limit = 20, versionFilter = true } = {}) {
  const facets = [[`project_type:${projectType}`]];
  if (loader && loader !== 'vanilla' && projectType === 'mod') facets.push([`categories:${loader}`]);
  if (loader && (loader === 'paper' || loader === 'purpur') && projectType === 'plugin') facets.push([`categories:${loader}`]);
  if (gameVersion && versionFilter) facets.push([`versions:${gameVersion}`]);
  const data = await fetchJson(`${API}/search?${q({ query, facets, index: sort, offset: String(offset), limit: String(limit) })}`);
  return { total: data.total_hits, hits: data.hits.map(normalizeHit) };
}

async function getProject(idOrSlug) {
  return fetchJson(`${API}/project/${encodeURIComponent(idOrSlug)}`);
}

async function getVersions(idOrSlug, { loaders, gameVersions } = {}) {
  return fetchJson(`${API}/project/${encodeURIComponent(idOrSlug)}/version?${q({ loaders, game_versions: gameVersions })}`);
}

async function getVersion(versionId) {
  return fetchJson(`${API}/version/${encodeURIComponent(versionId)}`);
}

/** Identify installed jars by sha1 -> {sha1: version}. */
async function versionsByHash(hashes) {
  if (!hashes.length) return {};
  return fetchJson(`${API}/version_files`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes, algorithm: 'sha1' }),
  });
}

/** Latest compatible version per installed jar hash, or nothing when none exists. */
async function latestForHashes(hashes, { loaders, gameVersions }) {
  if (!hashes.length) return {};
  return fetchJson(`${API}/version_files/update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes, algorithm: 'sha1', loaders, game_versions: gameVersions }),
  });
}

function primaryFile(version) {
  return version.files.find((f) => f.primary) || version.files[0];
}

module.exports = { API, PROJECT_TYPES, search, getProject, getVersions, getVersion, versionsByHash, latestForHashes, primaryFile, normalizeHit };
