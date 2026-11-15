'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const perfpack = require('../core/perfpack');
const companion = require('../core/companion');
const mojang = require('../core/mojang');
const assets = require('../core/assets');
const { availableLoaders } = require('../core/loaders');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'saturn16-'));
const fabric = (extra = {}) => ({ id: 't', type: 'client', loader: 'fabric', mcVersion: '26.3', mods: [], ...extra });

test('performance pack: on by default, per-instance override, only Fabric/Quilt clients', () => {
  assert.equal(perfpack.wanted(fabric(), {}), true);
  assert.equal(perfpack.wanted(fabric(), { performancePack: false }), false);
  assert.equal(perfpack.wanted(fabric({ performancePack: true }), { performancePack: false }), true);
  assert.equal(perfpack.wanted(fabric({ performancePack: false }), {}), false);
  assert.equal(perfpack.wanted(fabric({ loader: 'neoforge' }), {}), false);
  assert.equal(perfpack.wanted(fabric({ type: 'server' }), {}), false);
  assert.deepEqual(perfpack.PACK.map((p) => p.slug), ['sodium', 'lithium', 'ferrite-core', 'immediatelyfast', 'entityculling', 'sodium-extra']);
});

test('performance pack sync: installs what has a build, skips the rest, respects removals, toggles off', async () => {
  const dir = tmp();
  const planned = [];
  const plan = async (inst, projectId) => { planned.push(projectId); return projectId === 'PtjYWJkn' ? { plan: [], missing: ['no build'] } : { plan: [{ projectId }], missing: [] }; };
  const apply = async (_d, _i, _s, p) => p.map((x) => ({ projectId: x.projectId, title: x.projectId, file: `${x.projectId}.jar`, enabled: true }));
  const toggled = [];
  const setEnabled = async (_d, m, on) => { toggled.push([m.projectId, on]); };
  const inst = fabric({ performancePackRemoved: ['uXXizFIs'] });
  const r = await perfpack.sync(dir, inst, {}, { plan, apply, setEnabled });
  assert.ok(!planned.includes('uXXizFIs'), 'removed mod is not reinstalled');
  assert.deepEqual(r.skipped.map((s) => s.title), ['Sodium Extra']);
  assert.equal(r.added.length, 4);
  assert.ok(r.mods.every((m) => m.pack === 'performance'));
  const off = await perfpack.sync(dir, { ...inst, mods: r.mods, performancePack: false }, {}, { plan, apply, setEnabled });
  assert.equal(toggled.length, 4);
  assert.ok(off.mods.every((m) => m.enabled === false));
  const neo = await perfpack.sync(dir, fabric({ loader: 'neoforge' }), {}, { plan, apply, setEnabled });
  assert.equal(neo.added.length, 0);
  // Network errors are reported, never thrown.
  const bad = await perfpack.sync(dir, fabric(), {}, { plan: async () => { throw new Error('offline'); }, apply, setEnabled });
  assert.equal(bad.errors.length, 6);
});

test('built-in mods catalog: modules, Lunar names, choices, Echo Arrow off by default, no ESP mods', () => {
  const f = Object.fromEntries(companion.catalog.features.map((x) => [x.key, x]));
  for (const k of ['shulkerPreview', 'armorHud', 'echoArrow', 'freelook', 'blockInfo', 'effectTimers', 'inventorySort', 'furnaceGauge', 'chunkBorders', 'clearWeather']) assert.ok(f[k] && f[k].module, k);
  assert.equal(f.echoArrow.default, false);
  assert.deepEqual(f.echoArrowMode.options, ['ring', 'subtitles', 'both']);
  assert.deepEqual(f.armorHudStyle.options, ['number', 'percent', 'bar']);
  assert.deepEqual(f.armorHudLayout.options, ['vertical', 'horizontal']);
  const all = JSON.stringify(companion.catalog);
  assert.ok(!/crate-glow|wall-peek/.test(all), 'Crate Glow / Wall Peek are not built in');
  const s = companion.sanitize({ echoArrowMode: 'subtitles', armorHudStyle: 'nope', hudLayout: { armor: [0.5, 2], 'bad key': [0, 0], keys: 'x' } });
  assert.equal(s.echoArrowMode, 'subtitles');
  assert.equal(s.armorHudStyle, f.armorHudStyle.default);
  assert.deepEqual(s.hudLayout, { armor: [0.5, 1] });
  // The jar's copy matches the launcher's.
  const jarCopy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'companion-mod/src/main/resources/assets/glass-companion/features.json'), 'utf8'));
  assert.deepEqual(jarCopy, companion.catalog);
});

test('built-in mods step aside for standalone copies', () => {
  const hits = companion.standaloneIn([{ file: 'echo-arrow-1.0.0.jar' }, { file: 'tidy-key-1.0.0.jar', enabled: false }, { file: 'brew-clock-1.0.0.jar' }]);
  assert.deepEqual(hits.map((h) => h.key).sort(), ['echoArrow', 'effectTimers']);
});

test('companion install: in-game changes win, launcher glass/accent always follow the launcher', async () => {
  const dir = tmp();
  const jar = path.join(dir, 'glass-companion-0.1.6.jar');
  fs.writeFileSync(jar, 'jar');
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config', companion.CONFIG_FILE), JSON.stringify({ armorHudLayout: 'horizontal', menuGlass: 0.1 }));
  await companion.install(dir, fabric({ companion: true }), jar, { armorHudLayout: 'vertical' }, { menuGlass: 0.8, menuAccent: '#7AA8FF' });
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config', companion.CONFIG_FILE), 'utf8'));
  assert.equal(cfg.armorHudLayout, 'horizontal');
  assert.equal(cfg.menuGlass, 0.8);
  assert.ok(fs.existsSync(path.join(dir, 'mods', 'glass-companion-0.1.6.jar')));
});

test('versions: snapshots and old versions filter; Java major comes from the manifest (8 when missing)', async () => {
  assert.equal(mojang.javaMajorFor({ javaVersion: { majorVersion: 25 } }), 25);
  assert.equal(mojang.javaMajorFor({ javaVersion: { majorVersion: 8 } }), 8);
  assert.equal(mojang.javaMajorFor({}), 8);
  assert.equal(mojang.javaMajorFor(null), 8);
});

test('loader picker: only loaders with a build for the version; timeouts count as unavailable', async () => {
  const list = async (l) => {
    if (l === 'fabric') return [{ version: '0.20.1' }];
    if (l === 'quilt') return new Promise(() => {});
    if (l === 'forge') throw new Error('404');
    return [];
  };
  const a = await availableLoaders('26.4-snapshot-8', { list, timeoutMs: 50 });
  assert.deepEqual(a, { vanilla: true, fabric: true, quilt: false, forge: false, neoforge: false });
});

test('legacy assets: virtual and map_to_resources indexes are laid out for old versions', async () => {
  const root = tmp();
  const assetsDir = path.join(root, 'assets');
  const gameDir = path.join(root, 'game');
  fs.mkdirSync(path.join(assetsDir, 'indexes'), { recursive: true });
  const hash = 'ab'.padEnd(40, '0');
  fs.mkdirSync(path.join(assetsDir, 'objects', 'ab'), { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'objects', 'ab', hash), 'ogg');
  fs.writeFileSync(path.join(assetsDir, 'indexes', 'pre-1.6.json'), JSON.stringify({ map_to_resources: true, objects: { 'sound/step/grass1.ogg': { hash, size: 3 } } }));
  const v = { id: 'b1.7.3', assets: 'pre-1.6', assetIndex: { id: 'pre-1.6' } };
  assert.equal(assets.legacyAssetDir(v, assetsDir), path.join(assetsDir, 'virtual', 'pre-1.6'));
  assert.equal(assets.legacyAssetDir({ assetIndex: { id: '30' } }, assetsDir), null);
  await assets.materializeLegacyAssets(v, assetsDir, gameDir);
  assert.equal(fs.readFileSync(path.join(gameDir, 'resources', 'sound', 'step', 'grass1.ogg'), 'utf8'), 'ogg');
  assert.ok(fs.existsSync(path.join(assetsDir, 'virtual', 'pre-1.6', 'sound', 'step', 'grass1.ogg')));
});

test('companion jar 0.1.6 ships subtitle arrows, HUD editor and menus; no keys inside', () => {
  const jar = path.join(__dirname, '..', 'resources', 'companion', 'glass-companion-0.1.6.jar');
  if (!fs.existsSync(jar)) return; // built by scripts/build-companion.js
  const buf = fs.readFileSync(jar);
  for (const cls of ['SubtitleOverlayMixin', 'HudEditorScreen', 'SaturnTitleScreen', 'SaturnPauseScreen', 'ShulkerPreview']) assert.ok(buf.includes(Buffer.from(cls)), cls);
  const keyFile = path.join(__dirname, '..', '..', 'secrets', 'curseforge.key');
  if (fs.existsSync(keyFile)) {
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    assert.ok(key.length > 0 && !buf.includes(Buffer.from(key)), 'no CurseForge key in the jar');
  }
});
