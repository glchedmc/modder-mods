'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const vdf = require('../core/games/vdf');
const steam = require('../core/games/steam');
const { GameLibrary } = require('../core/games/library');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'saturn-games-'));
const manifest = (appid, name, extra = '') => `"AppState"\n{\n\t"appid"\t\t"${appid}"\n\t"Universe"\t\t"1"\n\t"name"\t\t"${name}"\n\t"StateFlags"\t\t"4"\n\t"installdir"\t\t"${name}"\n\t"LastUpdated"\t\t"1700000000"\n\t"SizeOnDisk"\t\t"1073741824"\n${extra}}\n`;

function fakeSteam(dir, { libs = [], games = {} } = {}) {
  fs.mkdirSync(path.join(dir, 'steamapps'), { recursive: true });
  const entries = [dir, ...libs].map((p, i) => `\t"${i}"\n\t{\n\t\t"path"\t\t"${p.replace(/\\/g, '\\\\')}"\n\t\t"apps"\n\t\t{\n\t\t}\n\t}\n`).join('');
  fs.writeFileSync(path.join(dir, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"\n{\n${entries}}\n`);
  for (const [lib, list] of Object.entries(games)) {
    fs.mkdirSync(path.join(lib, 'steamapps'), { recursive: true });
    for (const [id, name, extra] of list) fs.writeFileSync(path.join(lib, 'steamapps', `appmanifest_${id}.acf`), manifest(id, name, extra));
  }
}

test('vdf: nested objects, escapes, comments, bare tokens, platform conditionals', () => {
  const doc = vdf.parse(`// top comment
"Root"
{
  "name"   "Say \\"hi\\" \\\\ there"   // trailing comment
  bare     value
  "Nested" { "deep" { "x" "1" } }
  "win"    "only" [$WIN32]
  "empty"  ""
}`);
  assert.equal(doc.Root.name, 'Say "hi" \\ there');
  assert.equal(doc.Root.bare, 'value');
  assert.equal(doc.Root.Nested.deep.x, '1');
  assert.equal(doc.Root.win, 'only');
  assert.equal(doc.Root.empty, '');
  assert.equal(vdf.get(doc.Root, 'NAME'), 'Say "hi" \\ there', 'case-insensitive get');
  assert.equal(vdf.get(doc.Root, 'missing'), undefined);
});

test('vdf: tolerates CRLF, tabs, unterminated input without throwing', () => {
  const doc = vdf.parse('"a"\r\n{\r\n\t"b"\t"c"\r\n');
  assert.equal(doc.a.b, 'c');
  assert.deepEqual(vdf.parse(''), {});
});

test('steam roots per OS: Mac Application Support; Linux native, Flatpak and snap', () => {
  assert.deepEqual(steam.steamRoots('darwin', '/Users/i'), ['/Users/i/Library/Application Support/Steam']);
  const l = steam.steamRoots('linux', '/home/i');
  for (const p of ['/home/i/.steam/steam', '/home/i/.local/share/Steam', '/home/i/.var/app/com.valvesoftware.Steam/.local/share/Steam']) assert.ok(l.includes(p), p);
});

test('manifest parsing: fields, size, tool filtering, install state', () => {
  const g = steam.parseManifest(manifest('413150', 'Stardew Valley', '\t"LastPlayed"\t\t"1700000100"\n'), '/lib');
  assert.equal(g.id, 'steam:413150');
  assert.equal(g.name, 'Stardew Valley');
  assert.equal(g.sizeBytes, 1073741824);
  assert.equal(g.installDir, path.join('/lib', 'steamapps', 'common', 'Stardew Valley'));
  assert.equal(g.lastPlayed, 1700000100000);
  assert.equal(g.installed, true);
  assert.equal(steam.parseManifest(manifest('1493710', 'Proton Experimental'), '/lib'), null);
  assert.equal(steam.parseManifest(manifest('999999', 'Steam Linux Runtime 3.0 (sniper)'), '/lib'), null);
  assert.equal(steam.parseManifest(manifest('228980', 'Steamworks Common Redistributables'), '/lib'), null);
  assert.equal(steam.parseManifest('"AppState" { "appid" "x" }', '/lib'), null);
  const updating = steam.parseManifest(manifest('5', 'Half').replace('"4"', '"1026"'), '/lib');
  assert.equal(updating.installed, false);
});

test('library folders: new {path} format, old string format, root always included', async () => {
  const root = tmp();
  const extra = tmp();
  fakeSteam(root, { libs: [extra] });
  assert.deepEqual(await steam.libraryFolders(root), [root, extra]);
  const old = tmp();
  fs.mkdirSync(path.join(old, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(old, 'steamapps', 'libraryfolders.vdf'), `"LibraryFolders"\n{\n\t"TimeNextStatsReport"\t"1"\n\t"ContentStatsID"\t"2"\n\t"1"\t"${extra}"\n}\n`);
  assert.deepEqual(await steam.libraryFolders(old), [old, extra]);
});

test('listGames: every library, de-duplicated roots (symlink), tools skipped', async () => {
  const home = tmp();
  const root = path.join(home, '.local', 'share', 'Steam');
  const ext = path.join(home, 'Games', 'SteamLibrary');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(home, '.steam'), { recursive: true });
  fs.symlinkSync(root, path.join(home, '.steam', 'steam'));
  fakeSteam(root, { libs: [ext], games: { [root]: [['413150', 'Stardew Valley'], ['1493710', 'Proton Experimental']], [ext]: [['1145360', 'Hades']] } });
  const r = await steam.listGames({ platform: 'linux', home });
  assert.equal(r.installed, true);
  assert.equal(r.roots.length, 1, 'symlinked ~/.steam/steam is the same install');
  assert.deepEqual(r.games.map((g) => g.name).sort(), ['Hades', 'Stardew Valley']);
  assert.equal(r.games.find((g) => g.name === 'Hades').library, fs.realpathSync(ext));
});

test('listGames: empty state when Steam is not installed', async () => {
  const r = await steam.listGames({ platform: 'linux', home: tmp() });
  assert.deepEqual(r, { installed: false, roots: [], libraries: [], games: [] });
  const mac = await steam.listGames({ platform: 'darwin', home: tmp() });
  assert.equal(mac.installed, false);
});

test('launch URLs and artwork candidates (local cache first, then CDN)', () => {
  assert.equal(steam.runUrl('413150'), 'steam://rungameid/413150');
  assert.equal(steam.runUrl('41;rm -rf'), 'steam://rungameid/41');
  assert.equal(steam.storeUrl(570), 'steam://nav/games/details/570');
  const a = steam.artCandidates('570', '/s');
  assert.ok(a.local[0].startsWith('/s/appcache/librarycache'));
  assert.ok(a.remote[0].endsWith('/570/library_600x900.jpg'));
  assert.ok(a.remote.some((u) => u.endsWith('/570/header.jpg')));
});

test('game library: favorites, manual games, launch targets, art cache', async () => {
  const home = tmp();
  const root = path.join(home, '.local', 'share', 'Steam');
  fs.mkdirSync(root, { recursive: true });
  fakeSteam(root, { games: { [root]: [['570', 'Dota 2']] } });
  fs.mkdirSync(path.join(root, 'appcache', 'librarycache'), { recursive: true });
  fs.writeFileSync(path.join(root, 'appcache', 'librarycache', '570_library_600x900.jpg'), 'jpg');
  const data = tmp();
  const exe = path.join(data, 'mygame.sh');
  fs.writeFileSync(exe, '#!/bin/sh\n', { mode: 0o755 });
  let fetched = 0;
  const lib = new GameLibrary({ dataDir: data, cacheDir: path.join(data, 'cache'), steamOptions: { platform: 'linux', home }, fetch: async () => { fetched++; return { ok: false }; } });
  let l = await lib.list();
  assert.equal(l.steamInstalled, true);
  assert.equal(l.games.length, 1);
  assert.equal(await lib.fetchArt('570'), '570_library_600x900.jpg');
  assert.equal(fetched, 0, 'local Steam cache used before CDN');
  assert.equal(await lib.fetchArt('99999'), null, 'offline: fallback tile');
  assert.ok(fetched >= 1);
  assert.throws(() => lib.artPath('../../etc/passwd'));
  assert.ok(lib.artPath('570_header.jpg').endsWith(path.join('game-art', '570_header.jpg')));

  const m = await lib.addManual({ path: exe, name: '' });
  assert.equal(m.name, 'mygame');
  assert.equal((await lib.addManual({ path: exe })).id, m.id, 'no duplicates');
  await assert.rejects(lib.addManual({ path: 'relative/thing' }));
  await lib.setFavorite(m.id, true);
  l = await lib.list();
  assert.equal(l.games.find((g) => g.id === m.id).favorite, true);
  assert.equal(l.games.find((g) => g.id === 'steam:570').art, '570_library_600x900.jpg');
  assert.deepEqual(await lib.launchTarget('steam:570'), { kind: 'url', url: 'steam://rungameid/570' });
  assert.deepEqual(await lib.launchTarget(m.id), { kind: 'path', path: exe });
  assert.ok((await lib.state()).lastPlayed[m.id] > 0);
  assert.deepEqual(lib.storeTarget('steam:570'), { kind: 'url', url: 'steam://nav/games/details/570' });
  assert.throws(() => lib.storeTarget(m.id));
  await lib.removeManual(m.id);
  assert.equal((await lib.list()).games.length, 1);
  await assert.rejects(lib.launchTarget(m.id));
});

test('renderer: Games tab wired into nav, preload, IPC, CSP and mock', () => {
  const r = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  assert.match(r('renderer/src/App.jsx'), /\['games', 'Games', 'gamepad'\]/);
  for (const m of ['listGames', 'gameArt', 'setGameFavorite', 'addManualGame', 'playGame', 'openGameInSteam', 'pickGameExecutable']) {
    assert.ok(r('electron/preload.js').includes(`'${m}'`), m);
    assert.ok(r('renderer/src/api.js').includes(`${m}:`), `mock ${m}`);
  }
  assert.match(r('electron/main.js'), /shell\.openExternal\(target\.url\)/);
  assert.match(r('renderer/index.html'), /img-src[^;]*glass-art:/);
});
