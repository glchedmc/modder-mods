'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { classify, parseAppDetails, parseStoreTags, SteamMetaCache } = require('../core/games/filter');
const { GameLibrary } = require('../core/games/library');
const settings = require('../core/settings');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'saturn-filter-'));
const steamGame = (appid, name) => ({ id: `steam:${appid}`, source: 'steam', appid: String(appid), name });
const cat = (...ids) => ids.map((id) => ({ id, description: `cat ${id}` }));

// Store data as Steam returned it for these apps (genres, categories, descriptors, user tags).
const FIXTURES = {
  965680: { name: 'Boomerang Fu', genres: ['Action', 'Casual', 'Indie'], categories: cat(2, 1, 49, 37, 9, 39, 24), descriptors: [], tags: ['4 Player Local', 'Local Multiplayer', 'Party Game', 'Family Friendly', 'Fighting', 'Competitive', 'Martial Arts', 'Funny', 'Action', 'Casual'] },
  244210: { name: 'Assetto Corsa', genres: ['Indie', 'Racing', 'Simulation', 'Sports'], categories: cat(2, 1, 49, 36), descriptors: [], tags: ['Racing', 'Simulation', 'Driving', 'Automobile Sim'] },
  284160: { name: 'BeamNG.drive', genres: ['Racing', 'Simulation', 'Early Access'], categories: cat(2, 1, 9), descriptors: [], tags: ['Simulation', 'Driving', 'Physics', 'Sandbox'] },
  730: { name: 'Counter-Strike 2', genres: ['Action', 'Free To Play'], categories: cat(1, 27), descriptors: [2, 5], tags: ['FPS', 'Shooter', 'Multiplayer', 'Competitive'] },
  892970: { name: 'Valheim', genres: ['Action', 'Adventure', 'Indie', 'RPG'], categories: cat(2, 1, 9, 38), descriptors: [], tags: ['Open World Survival Craft', 'Survival', 'Online Co-Op'] },
  1145360: { name: 'Hades', genres: ['Action', 'Indie', 'RPG'], categories: cat(2, 22), descriptors: [], tags: ['Action Roguelike', 'Hack and Slash', 'Mythology'] },
};

test('Boomerang Fu (965680) is allowed even though it has Action/Fighting tags', () => {
  const r = classify(steamGame(965680, 'Boomerang Fu'), FIXTURES[965680]);
  assert.equal(r.show, true, r.reason);
});

test('racers pass: Assetto Corsa, BeamNG, a Gran Turismo-style racer and Live for Speed', () => {
  assert.equal(classify(steamGame(244210, 'Assetto Corsa'), FIXTURES[244210]).show, true);
  assert.equal(classify(steamGame(284160, 'BeamNG.drive'), FIXTURES[284160]).show, true);
  const gtLike = { genres: ['Racing', 'Simulation', 'Sports'], categories: cat(2, 36), descriptors: [], tags: ['Racing', 'Driving', 'Realistic'] };
  assert.equal(classify(steamGame(1, 'Grand Touring Pro'), gtLike).show, true);
  // Live for Speed: no Steam store info (sold outside Steam) — passes by name, and as a manual game.
  assert.equal(classify(steamGame(2, 'Live for Speed'), null).show, true);
  assert.equal(classify(steamGame(2, 'Live for Speed'), { genres: ['Indie'], categories: [], descriptors: [], tags: [] }).show, true);
  assert.equal(classify({ id: 'manual:abc', source: 'manual', name: 'Live for Speed' }, null).show, true);
});

test('violent and adult games are hidden: descriptors 1–4, shooter/FPS/horror/survival/battle royale tags', () => {
  assert.deepEqual(classify(steamGame(730, 'Counter-Strike 2'), FIXTURES[730]), { show: false, reason: 'Frequent violence or gore', source: 'blocked' });
  assert.equal(classify(steamGame(892970, 'Valheim'), FIXTURES[892970]).show, false, 'Survival tag beats Co-op');
  for (const id of [1, 3, 4]) assert.equal(classify(steamGame(9, 'X'), { genres: ['Casual'], categories: [], descriptors: [id], tags: [] }).show, false, `descriptor ${id}`);
  assert.equal(classify(steamGame(9, 'X'), { genres: ['Casual'], categories: [], descriptors: [5], tags: [] }).show, true, 'general mature content alone is not blocked');
  for (const t of ['Shooter', 'FPS', 'Gore', 'Violent', 'Horror', 'Survival', 'Battle Royale', 'Survival Horror', 'Third-Person Shooter']) {
    assert.equal(classify(steamGame(9, 'X'), { genres: ['Racing'], categories: cat(9), descriptors: [], tags: [t] }).show, false, t);
  }
  // Racing game that is also a shooter (car combat) stays hidden.
  assert.equal(classify(steamGame(9, 'Car Combat'), { genres: ['Racing'], categories: [], descriptors: [], tags: ['Car Combat', 'Shooter'] }).show, false);
});

test('allow rules: genres/tags Racing, Sports, Casual, Simulation, Family Friendly, Party; co-op categories', () => {
  for (const g of ['Racing', 'Sports', 'Casual', 'Simulation']) assert.equal(classify(steamGame(9, 'X'), { genres: [g], categories: [], descriptors: [], tags: [] }).show, true, g);
  for (const t of ['Family Friendly', 'Party', 'Party Game', 'Local Co-Op', 'Driving']) assert.equal(classify(steamGame(9, 'X'), { genres: ['Indie'], categories: [], descriptors: [], tags: [t] }).show, true, t);
  for (const c of [9, 24, 38, 39, 44, 48]) assert.equal(classify(steamGame(9, 'X'), { genres: ['Indie'], categories: cat(c), descriptors: [], tags: [] }).show, true, `category ${c}`);
  const hades = classify(steamGame(1145360, 'Hades'), FIXTURES[1145360]);
  assert.equal(hades.show, false, 'single-player action game is not in the allowed set');
});

test('unknown store info (offline / not fetched yet) shows the game; manual games always show', () => {
  assert.equal(classify(steamGame(123, 'Mystery'), null).show, true);
  assert.equal(classify(steamGame(123, 'Mystery'), null).source, 'unknown');
  assert.equal(classify({ id: 'manual:x', source: 'manual', name: 'Doom-like' }, { genres: [], categories: [], descriptors: [2], tags: ['Shooter'] }).show, true);
});

test('user allowlist and blocklist override everything', () => {
  const cs = steamGame(730, 'Counter-Strike 2');
  assert.equal(classify(cs, FIXTURES[730], { allow: ['steam:730'] }).show, true);
  const bf = steamGame(965680, 'Boomerang Fu');
  assert.deepEqual(classify(bf, FIXTURES[965680], { block: ['steam:965680'] }), { show: false, reason: 'Hidden by you', source: 'user' });
  assert.equal(classify({ id: 'manual:a', source: 'manual', name: 'Z' }, null, { block: ['manual:a'] }).show, false);
});

test('appdetails and store-page tag parsing', () => {
  const json = { 965680: { success: true, data: { name: 'Boomerang Fu', genres: [{ id: '1', description: 'Action' }, { id: '4', description: 'Casual' }], categories: [{ id: 9, description: 'Co-op' }], content_descriptors: { ids: [], notes: null } } } };
  const m = parseAppDetails(json, 965680);
  assert.deepEqual(m.genres, ['Action', 'Casual']);
  assert.deepEqual(m.categories, [{ id: 9, description: 'Co-op' }]);
  assert.deepEqual(m.descriptors, []);
  assert.equal(parseAppDetails({ 5: { success: false } }, 5), null);
  assert.deepEqual(parseAppDetails({ 730: { success: true, data: { content_descriptors: { ids: [2, 5], notes: 'x' } } } }, 730).descriptors, [2, 5]);
  const html = '<a href="x" class="app_tag" style="display: none;">\n\t\t\t\t\t\t\t\t\t\t\t\tParty Game\t\t\t\t\t\t\t\t\t\t\t\t</a><a class="app_tag">Family Friendly</a><a class="app_tag">Rock &amp; Roll</a><div class="app_tag add_button">+</div>';
  assert.deepEqual(parseStoreTags(html), ['Party Game', 'Family Friendly', 'Rock & Roll']);
});

function fakeStore(byId, calls) {
  return async (url) => {
    calls.push(url);
    const id = (url.match(/appids=(\d+)/) || url.match(/\/app\/(\d+)\//))[1];
    const fx = byId[id];
    if (url.includes('appdetails')) {
      if (!fx) return { ok: true, json: async () => ({ [id]: { success: false } }) };
      return { ok: true, json: async () => ({ [id]: { success: true, data: { name: fx.name, genres: fx.genres.map((d) => ({ description: d })), categories: fx.categories, content_descriptors: { ids: fx.descriptors } } } }) };
    }
    return { ok: true, text: async () => fx.tags.map((t) => `<a class="app_tag">${t}</a>`).join('') };
  };
}

test('meta cache: downloads once, saves to disk, reuses it', async () => {
  const calls = [];
  const dir = tmp();
  const c = new SteamMetaCache({ dir, fetch: fakeStore(FIXTURES, calls) });
  const m = await c.get('965680');
  assert.ok(m.tags.includes('Party Game'));
  assert.equal(calls.length, 2);
  assert.ok(fs.existsSync(path.join(dir, '965680.json')));
  const again = new SteamMetaCache({ dir, fetch: fakeStore(FIXTURES, calls) });
  await again.get('965680');
  assert.equal(calls.length, 2, 'served from disk');
  const unknown = await c.get('42');
  assert.equal(unknown.missing, true);
  assert.equal(unknown.partial, true);
});

test('meta cache: offline → null and backs off (no request storm); stale cache still used', async () => {
  let n = 0;
  let t = 1000;
  const dir = tmp();
  const c = new SteamMetaCache({ dir, now: () => t, fetch: async () => { n++; throw new Error('ENOTFOUND'); } });
  assert.equal(await c.get('1'), null);
  assert.equal(await c.get('2'), null);
  assert.equal(n, 1, 'second lookup skipped while offline');
  fs.writeFileSync(path.join(dir, '3.json'), JSON.stringify({ genres: ['Racing'], categories: [], descriptors: [], tags: [], fetchedAt: 0 }));
  t = 40 * 86400e3; // stale, and the store still unreachable
  const stale = await c.get('3');
  assert.deepEqual(stale.genres, ['Racing']);
  const limited = new SteamMetaCache({ dir: tmp(), now: () => 0, fetch: async () => ({ ok: false, status: 429 }) });
  assert.equal(await limited.get('4'), null);
  assert.equal(limited.offlineUntil, 5 * 60e3);
});

test('game library with the filter: hides violent games, keeps the rest, handles offline, remembers picks', async () => {
  const home = tmp();
  const root = path.join(home, '.local', 'share', 'Steam');
  fs.mkdirSync(path.join(root, 'steamapps'), { recursive: true });
  for (const [id, fx] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(root, 'steamapps', `appmanifest_${id}.acf`), `"AppState"\n{\n"appid" "${id}"\n"name" "${fx.name}"\n"StateFlags" "4"\n"SizeOnDisk" "100"\n}\n`);
  }
  const data = tmp();
  const calls = [];
  const lib = new GameLibrary({ dataDir: data, cacheDir: path.join(data, 'cache'), steamOptions: { platform: 'linux', home }, fetch: fakeStore(FIXTURES, calls), metaWaitMs: 5000 });
  let r = await lib.list({ filter: true });
  assert.deepEqual(r.games.map((g) => g.name).sort(), ['Assetto Corsa', 'BeamNG.drive', 'Boomerang Fu']);
  assert.deepEqual(r.hidden.map((h) => h.name).sort(), ['Counter-Strike 2', 'Hades', 'Valheim']);
  assert.equal(r.hiddenCount, 3);
  assert.equal(r.metaPending, 0);

  await lib.setVisibility('steam:892970', 'show');
  await lib.setVisibility('steam:244210', 'hide');
  r = await lib.list({ filter: true });
  assert.ok(r.games.some((g) => g.name === 'Valheim'));
  assert.ok(!r.games.some((g) => g.name === 'Assetto Corsa'));
  await lib.setVisibility('steam:244210', 'auto');
  assert.ok((await lib.list({ filter: true })).games.some((g) => g.name === 'Assetto Corsa'));
  await assert.rejects(lib.setVisibility('steam:1', 'maybe'));

  const off = await lib.list({ filter: false });
  assert.equal(off.games.length, 6, 'filter off shows everything');
  assert.equal(off.games.find((g) => g.appid === '730').filter.show, false, 'verdict still attached for the badge');

  // A fresh install with the store offline: nothing is hidden.
  const data2 = tmp();
  const offline = new GameLibrary({ dataDir: data2, cacheDir: path.join(data2, 'cache'), steamOptions: { platform: 'linux', home }, fetch: async () => { throw new Error('offline'); }, metaWaitMs: 2000 });
  const o = await offline.list({ filter: true });
  assert.equal(o.games.length, 6);
  assert.equal(o.hiddenCount, 0);
  assert.equal(o.storeOffline, true);
  assert.equal(o.metaPending, 0);
});

test('filter setting is on by default; Games tab has the chip, context menu and settings toggle', () => {
  assert.equal(settings.DEFAULTS.gameFilter, true);
  const r = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const games = r('renderer/src/views/Games.jsx');
  assert.match(games, /filter-chip/);
  assert.match(games, /onContextMenu/);
  assert.match(games, /Always show/);
  assert.match(games, />Hide</);
  assert.match(r('renderer/src/views/Settings.jsx'), /gameFilter/);
  assert.ok(r('electron/preload.js').includes("'setGameVisibility'"));
  assert.ok(r('electron/main.js').includes("'setGameVisibility'"));
});
