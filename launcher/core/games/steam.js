'use strict';
// Installed Steam games from local files only: no Steam login, no Web API key.
// Finds Steam's install(s), reads steamapps/libraryfolders.vdf for every library,
// then each library's appmanifest_<appid>.acf (name, size, install dir).
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const vdf = require('./vdf');

/** Where Steam keeps its data on each OS (first match per real path wins). */
function steamRoots(platform = process.platform, home = os.homedir()) {
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Steam')];
  if (platform === 'linux') {
    return [
      path.join(home, '.steam', 'steam'),
      path.join(home, '.steam', 'root'),
      path.join(home, '.local', 'share', 'Steam'),
      // Flatpak Steam.
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
      // Snap Steam.
      path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
    ];
  }
  if (platform === 'win32') return ['C:\\Program Files (x86)\\Steam'];
  return [];
}

/** Steam runtimes, Proton and redistributables are not games. */
const TOOL_IDS = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '2180100', '2805730', '3810310', '1826330', '1161040', '1887720', '1420170', '1580130', '858280', '961940', '1054830', '1113280', '1245040', '1907320', '2348590']);
const TOOL_NAME = /^(proton\b|steam linux runtime|steamworks common redistributables|steamvr\b|steam audio)/i;

function isTool(appid, name) {
  return TOOL_IDS.has(String(appid)) || TOOL_NAME.test(String(name || ''));
}

async function realDir(p) {
  try {
    const st = await fsp.stat(p);
    if (!st.isDirectory()) return null;
    return await fsp.realpath(p);
  } catch { return null; }
}

/** Existing Steam roots, de-duplicated (~/.steam/steam is usually a symlink to ~/.local/share/Steam). */
async function findRoots(opts = {}) {
  const out = [];
  for (const r of opts.roots || steamRoots(opts.platform, opts.home)) {
    const real = await realDir(r);
    if (real && !out.includes(real) && (await realDir(path.join(real, 'steamapps')))) out.push(real);
  }
  return out;
}

/** Library folders listed by a Steam root (new and old libraryfolders.vdf formats), always including the root. */
async function libraryFolders(root) {
  const libs = [root];
  for (const file of [path.join(root, 'steamapps', 'libraryfolders.vdf'), path.join(root, 'config', 'libraryfolders.vdf')]) {
    let text;
    try { text = await fsp.readFile(file, 'utf8'); } catch { continue; }
    const doc = vdf.parse(text);
    const lf = vdf.get(doc, 'libraryfolders') || {};
    for (const [k, v] of Object.entries(lf)) {
      if (!/^\d+$/.test(k)) continue;
      const p = typeof v === 'string' ? v : vdf.get(v, 'path');
      if (p && !libs.includes(p)) libs.push(p);
    }
  }
  return libs;
}

/** One appmanifest → game record, or null for tools / broken files. */
function parseManifest(text, library) {
  const st = vdf.get(vdf.parse(text), 'AppState');
  if (!st) return null;
  const appid = String(vdf.get(st, 'appid') || '').trim();
  const name = String(vdf.get(st, 'name') || '').trim();
  if (!/^\d+$/.test(appid) || isTool(appid, name)) return null;
  const size = Number(vdf.get(st, 'SizeOnDisk') || 0);
  const flags = Number(vdf.get(st, 'StateFlags') || 0);
  const installdir = String(vdf.get(st, 'installdir') || '');
  return {
    id: `steam:${appid}`,
    source: 'steam',
    appid,
    name: name || `App ${appid}`,
    sizeBytes: Number.isFinite(size) ? size : 0,
    installDir: installdir ? path.join(library, 'steamapps', 'common', installdir) : null,
    library,
    lastUpdated: Number(vdf.get(st, 'LastUpdated') || 0) * 1000 || null,
    lastPlayed: Number(vdf.get(st, 'LastPlayed') || 0) * 1000 || null,
    // StateFlags 4 = fully installed; anything else is downloading/updating.
    installed: (flags & 4) === 4 || flags === 0,
  };
}

/** All installed Steam games across every library of every Steam install. */
async function listGames(opts = {}) {
  const roots = await findRoots(opts);
  const games = new Map();
  const libraries = [];
  for (const root of roots) {
    for (const lib of await libraryFolders(root)) {
      const real = await realDir(lib);
      if (!real || libraries.includes(real)) continue;
      libraries.push(real);
      let files = [];
      try { files = (await fsp.readdir(path.join(real, 'steamapps'))).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
      for (const f of files) {
        try {
          const g = parseManifest(await fsp.readFile(path.join(real, 'steamapps', f), 'utf8'), real);
          if (g && !games.has(g.appid)) games.set(g.appid, { ...g, root });
        } catch { /* unreadable manifest */ }
      }
    }
  }
  return { installed: roots.length > 0, roots, libraries, games: [...games.values()] };
}

const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
/** Artwork candidates: Steam's own local library cache first, then the public CDN. */
function artCandidates(appid, root) {
  const id = String(appid);
  const local = root ? [
    path.join(root, 'appcache', 'librarycache', id, 'library_600x900.jpg'),
    path.join(root, 'appcache', 'librarycache', `${id}_library_600x900.jpg`),
    path.join(root, 'appcache', 'librarycache', id, 'header.jpg'),
    path.join(root, 'appcache', 'librarycache', `${id}_header.jpg`),
  ] : [];
  return { local, remote: [`${CDN}/${id}/library_600x900.jpg`, `${CDN}/${id}/library_600x900_2x.jpg`, `${CDN}/${id}/header.jpg`] };
}

function runUrl(appid) { return `steam://rungameid/${String(appid).replace(/\D/g, '')}`; }
function storeUrl(appid) { return `steam://nav/games/details/${String(appid).replace(/\D/g, '')}`; }

module.exports = { steamRoots, findRoots, libraryFolders, parseManifest, listGames, artCandidates, runUrl, storeUrl, isTool };
