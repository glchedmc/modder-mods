'use strict';
// CurseForge Core API v1. Needs an API key from https://console.curseforge.com/
const { fetchJson } = require('../net');

const API = 'https://api.curseforge.com/v1';
const GAME_MINECRAFT = 432;
const CLASS_IDS = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552, plugin: 5, datapack: 6945 };
const LOADER_TYPES = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const LOADER_NAMES = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' };
const RELATION_REQUIRED = 3;
const SORT = { relevance: 1, downloads: 6, updated: 3, follows: 2, newest: 11 };

function client(apiKey) {
  if (!apiKey) {
    const e = new Error('CurseForge needs an API key. Add one in Settings → Accounts & Keys.');
    e.code = 'NO_KEY';
    throw e;
  }
  const headers = { 'x-api-key': apiKey, Accept: 'application/json' };
  const get = (p) => fetchJson(`${API}${p}`, { headers });
  const post = (p, body) => fetchJson(`${API}${p}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { get, post };
}

function normalizeMod(m) {
  return {
    source: 'curseforge',
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    author: (m.authors && m.authors[0] && m.authors[0].name) || '',
    summary: m.summary,
    icon: (m.logo && (m.logo.thumbnailUrl || m.logo.url)) || null,
    downloads: m.downloadCount,
    follows: m.thumbsUpCount || 0,
    categories: (m.categories || []).map((c) => c.name),
    versions: [...new Set((m.latestFilesIndexes || []).map((f) => f.gameVersion))],
    updated: m.dateModified,
    sourceUrl: m.links && m.links.sourceUrl,
    url: m.links && m.links.websiteUrl,
  };
}

async function search(apiKey, { query = '', loader, gameVersion, projectType = 'mod', sort = 'relevance', offset = 0, limit = 20, versionFilter = true } = {}) {
  const c = client(apiKey);
  const params = new URLSearchParams({
    gameId: String(GAME_MINECRAFT), classId: String(CLASS_IDS[projectType] || 6),
    searchFilter: query, sortField: String(SORT[sort] || 2), sortOrder: 'desc',
    index: String(offset), pageSize: String(limit),
  });
  if (gameVersion && versionFilter) params.set('gameVersion', gameVersion);
  if (LOADER_TYPES[loader] && projectType === 'mod') params.set('modLoaderType', String(LOADER_TYPES[loader]));
  const data = await c.get(`/mods/search?${params}`);
  return { total: data.pagination ? data.pagination.totalCount : data.data.length, hits: data.data.map(normalizeMod) };
}

async function getMod(apiKey, id) { return (await client(apiKey).get(`/mods/${id}`)).data; }

async function getFiles(apiKey, id, { gameVersion, loader } = {}) {
  const params = new URLSearchParams({ pageSize: '50' });
  if (gameVersion) params.set('gameVersion', gameVersion);
  if (LOADER_TYPES[loader]) params.set('modLoaderType', String(LOADER_TYPES[loader]));
  return (await client(apiKey).get(`/mods/${id}/files?${params}`)).data;
}

/**
 * CurseForge omits downloadUrl when an author disables third-party downloads.
 * The CDN path is predictable from the file id, but we only use it when the
 * API gives us nothing and tell the user, since it may be refused.
 */
function fileDownloadUrl(file) {
  if (file.downloadUrl) return file.downloadUrl;
  const id = String(file.id);
  return `https://edge.forgecdn.net/files/${id.slice(0, 4)}/${Number(id.slice(4))}/${encodeURIComponent(file.fileName)}`;
}

function requiredDependencies(file) {
  return (file.dependencies || []).filter((d) => d.relationType === RELATION_REQUIRED).map((d) => String(d.modId));
}

module.exports = { API, CLASS_IDS, LOADER_TYPES, LOADER_NAMES, search, getMod, getFiles, fileDownloadUrl, requiredDependencies, normalizeMod };
