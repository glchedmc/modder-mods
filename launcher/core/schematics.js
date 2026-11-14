'use strict';
// Per-instance schematic library: list/add/remove local files, and search
// MineMev's public API (https://minemev.com/developers/) for downloads.
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { fetchJson, download, exists } = require('./net');

const EXTENSIONS = new Set(['.litematic', '.schem', '.schematic', '.nbt']);
const ARCHIVE_EXT = new Set(['.zip']);
const DANGEROUS_EXT = new Set(['.jar', '.exe', '.bat', '.cmd', '.msi', '.sh', '.command', '.app', '.dmg', '.pkg']);
const LITEMATICA_IDS = new Set(['litematica', 'bepr0arc']);
const MINEMEV = 'https://minemev.com/api/v2';
const VENDOR_PAGES = {
  minemev: (id) => `https://minemev.com/`,
  choculaterie: (id) => `https://choculaterie.com/schematics/${id}`,
  redenmc: (id) => `https://redenmc.com/`,
  MCodex: (id) => `https://mcodex.org/`,
};

const STANDARD_FOLDERS = ['schematics', path.join('minecraft', 'schematics')];
const OPTIONAL_FOLDERS = [
  path.join('config', 'worldedit', 'schematics'),
  path.join('plugins', 'WorldEdit', 'schematics'),
];

function isSchematicName(name) {
  return EXTENSIONS.has(path.extname(String(name || '')).toLowerCase());
}

function safeBase(name) {
  const base = path.basename(String(name || 'schematic')).replace(/[^\w.+()-]+/g, '_');
  return base || 'schematic';
}

function folders(instanceDir) {
  const roots = STANDARD_FOLDERS.map((rel) => path.join(instanceDir, rel));
  for (const rel of OPTIONAL_FOLDERS) {
    const abs = path.join(instanceDir, rel);
    roots.push(abs);
  }
  return roots;
}

async function existingFolders(instanceDir) {
  const out = [];
  for (const dir of folders(instanceDir)) {
    if (await exists(dir)) out.push(dir);
  }
  return out;
}

function underAllowed(instanceDir, abs) {
  const resolved = path.resolve(abs);
  return folders(instanceDir).some((root) => {
    const r = path.resolve(root);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
}

function resolveSafe(instanceDir, rel) {
  const abs = path.resolve(instanceDir, rel);
  if (!underAllowed(instanceDir, abs)) throw new Error('That path is outside this instance’s schematic folders.');
  if (!isSchematicName(abs)) throw new Error('Only .litematic, .schem, .schematic and .nbt files can be managed here.');
  return abs;
}

async function uniqueDest(dir, fileName) {
  await fsp.mkdir(dir, { recursive: true });
  const base = safeBase(fileName);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length) || 'schematic';
  let dest = path.join(dir, base);
  let n = 1;
  while (await exists(dest)) {
    dest = path.join(dir, `${stem}-${n}${ext}`);
    n += 1;
  }
  return dest;
}

async function walk(dir, { depth = 0, maxDepth = 4, instanceDir } = {}) {
  const out = [];
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth < maxDepth) out.push(...await walk(abs, { depth: depth + 1, maxDepth, instanceDir }));
      continue;
    }
    if (!e.isFile() || !isSchematicName(e.name)) continue;
    const st = await fsp.stat(abs);
    out.push({
      name: e.name,
      rel: path.relative(instanceDir, abs),
      folder: path.relative(instanceDir, dir) || '.',
      size: st.size,
      mtime: st.mtime.toISOString(),
      ext: path.extname(e.name).toLowerCase().slice(1),
    });
  }
  return out;
}

async function list(instanceDir) {
  const found = [];
  const seen = new Set();
  for (const dir of await existingFolders(instanceDir)) {
    for (const item of await walk(dir, { instanceDir })) {
      if (seen.has(item.rel)) continue;
      seen.add(item.rel);
      found.push(item);
    }
  }
  found.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return found;
}

function defaultDestDir(instanceDir, { server = false } = {}) {
  if (server) return path.join(instanceDir, 'config', 'worldedit', 'schematics');
  return path.join(instanceDir, 'schematics');
}

async function addFiles(instanceDir, sources, { server = false } = {}) {
  const destDir = defaultDestDir(instanceDir, { server });
  const added = [];
  for (const src of sources) {
    const ext = path.extname(src).toLowerCase();
    if (DANGEROUS_EXT.has(ext)) throw new Error(`Refusing to add ${path.basename(src)} — that is not a schematic.`);
    if (ARCHIVE_EXT.has(ext)) {
      added.push(...await addArchive(instanceDir, src, destDir));
      continue;
    }
    if (!isSchematicName(src)) throw new Error(`${path.basename(src)} is not a .litematic, .schem, .schematic or .nbt file.`);
    const dest = await uniqueDest(destDir, path.basename(src));
    await fsp.copyFile(src, dest);
    added.push(path.relative(instanceDir, dest));
  }
  return added;
}

async function addArchive(instanceDir, zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const added = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = path.basename(entry.entryName);
    if (name.startsWith('.') || name.includes('..')) continue;
    const ext = path.extname(name).toLowerCase();
    if (DANGEROUS_EXT.has(ext)) continue;
    if (!EXTENSIONS.has(ext)) continue;
    const dest = await uniqueDest(destDir, name);
    await fsp.writeFile(dest, entry.getData());
    added.push(path.relative(instanceDir, dest));
  }
  if (!added.length) throw new Error(`${path.basename(zipPath)} didn’t contain any schematic files.`);
  return added;
}

async function remove(instanceDir, rel) {
  const abs = resolveSafe(instanceDir, rel);
  await fsp.unlink(abs);
}

function hasLitematica(meta) {
  return (meta.mods || []).some((m) => {
    const id = String(m.projectId || m.slug || '').toLowerCase();
    const title = String(m.title || m.file || '').toLowerCase();
    return LITEMATICA_IDS.has(id) || title.includes('litematica');
  });
}

function normalizePost(p, files = []) {
  const preferred = files.find((f) => isSchematicName(f.default_file_name || '')) || files[0] || null;
  return {
    source: 'minemev',
    id: p.uuid,
    vendor: p.vendor,
    title: p.post_name,
    author: p.User || p.creators || '',
    summary: p.description || '',
    icon: p.thumbnail_url || (p.images && p.images[0]) || null,
    downloads: p.downloads || 0,
    tags: p.tags || [],
    versions: p.versions || [],
    published: p.published_at || null,
    pageUrl: (VENDOR_PAGES[p.vendor] || VENDOR_PAGES.minemev)(p.uuid),
    files: files.map((f) => ({
      id: f.id,
      name: f.default_file_name,
      url: f.file,
      size: f.file_size || 0,
      type: f.file_type,
      versions: f.versions || [],
      verified: Boolean(f.is_verified),
    })),
    file: preferred && {
      id: preferred.id,
      name: preferred.default_file_name,
      url: preferred.file,
      size: preferred.file_size || 0,
      type: preferred.file_type,
    },
  };
}

async function search(query = '', { page = 1, pageSize = 20 } = {}) {
  const params = new URLSearchParams({
    search: query, page: String(page), pagesize: String(pageSize), sort: query ? '' : 'downloads',
  });
  const data = await fetchJson(`${MINEMEV}/search?${params}`);
  const posts = data.posts || [];
  const hits = await Promise.all(posts.map(async (p) => {
    let files = [];
    try { files = await fetchJson(`${MINEMEV}/files/${encodeURIComponent(p.vendor)}/${encodeURIComponent(p.uuid)}/`); } catch { files = []; }
    if (!Array.isArray(files)) files = [];
    return normalizePost(p, files);
  }));
  return { total: data.total_items || hits.length, page: data.page || page, pages: data.total_pages || 1, hits, source: 'MineMev', sourceUrl: 'https://minemev.com/' };
}

function allowedDownloadUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return host === 'minemev.com' || host.endsWith('.minemev.com')
    || host === 'choculaterie.com' || host.endsWith('.choculaterie.com')
    || host === 'redenmc.com' || host.endsWith('.redenmc.com')
    || host === 'mcodex.org' || host.endsWith('.mcodex.org');
}

async function downloadToInstance(instanceDir, { url, fileName, server = false } = {}) {
  if (!allowedDownloadUrl(url)) throw new Error('That download is not from a known schematic host.');
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'glass-schem-'));
  try {
    const tmp = path.join(tmpDir, safeBase(fileName || 'download.bin'));
    await download(url, tmp);
    const added = await addFiles(instanceDir, [tmp], { server });
    return added;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

module.exports = {
  EXTENSIONS, STANDARD_FOLDERS, OPTIONAL_FOLDERS, LITEMATICA_IDS, MINEMEV,
  isSchematicName, folders, list, addFiles, remove, hasLitematica,
  search, downloadToInstance, normalizePost, allowedDownloadUrl, defaultDestDir, resolveSafe, uniqueDest,
};
