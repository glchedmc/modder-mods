'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const companion = require('../core/companion');
const catalog = require('../core/companion-features.json');

const root = path.join(__dirname, '..');
const java = (p) => fs.readFileSync(path.join(root, 'companion-mod/src/main/java/mc/glched/glasscompanion', p), 'utf8');
const feature = (k) => catalog.features.find((f) => f.key === k);

test('waypoints module: own group, Lunar mapping, beams/tags/death/minimap toggles on by default', () => {
  assert.ok(catalog.groups.some((g) => g.id === 'waypoints'));
  const w = feature('waypoints');
  assert.equal(w.module, true);
  assert.equal(w.lunar, 'Waypoints');
  assert.equal(w.default, true);
  for (const k of ['waypointBeams', 'waypointLabels', 'waypointDeath', 'waypointMinimap']) {
    assert.equal(feature(k).type, 'bool', k);
    assert.equal(feature(k).default, true, k);
    assert.equal(feature(k).group, 'waypoints', k);
  }
});

test('waypoints: B adds, J lists, saved per world/server and dimension, death auto-adds, Corner Atlas markers', () => {
  const keys = java('waypoints/WaypointKeys.java');
  assert.match(keys, /KEY_B/);
  assert.match(keys, /KEY_J/);
  const store = java('waypoints/Waypoints.java');
  assert.match(store, /"sp:"/);
  assert.match(store, /"mp:"/);
  assert.match(store, /dimension/);
  assert.match(java('modules/DeathPoint.java'), /Waypoints\.addDeath/);
  const bridge = java('waypoints/MinimapBridge.java');
  assert.match(bridge, /isModLoaded\("corner-atlas"\)/);
  assert.match(bridge, /mc\.glched\.corneratlas\.AtlasConfig/);
  const renderer = java('waypoints/WaypointRenderer.java');
  assert.match(renderer, /Gizmos\.cuboid/);
  assert.match(renderer, /getViewRotationProjectionMatrix/);
});

test('HUD layout keeps a per-element scale and clamps it; old [x, y] entries still load', () => {
  const out = companion.sanitize({ hudLayout: { armor: [0.6, 1, 1.75], info: [0, 0], itemCounter: [0.5, 2, 9], bad: [1, 2, 3, 4] } });
  assert.deepEqual(out.hudLayout.armor, [0.6, 1, 1.75]);
  assert.deepEqual(out.hudLayout.info, [0, 0]);
  assert.deepEqual(out.hudLayout.itemCounter, [0.5, 1, 3]);
  assert.equal(out.hudLayout.bad, undefined);
  const editor = java('HudEditorScreen.java');
  assert.match(editor, /mouseScrolled/);
  assert.match(editor, /MOUSE_BUTTON_RIGHT/);
  assert.match(editor, /handleAt/);
});

test('held item count: on by default with tool durability; counts the whole inventory', () => {
  assert.equal(feature('itemCounter').default, true);
  assert.equal(feature('itemCounterDurability').default, true);
  const src = java('modules/ItemCounter.java');
  assert.match(src, /getContainerSize/);
  assert.match(src, /getMaxDamage/);
});

test('title screen: SATURN title with the logo, no "Client", panorama pack and transparent logo', () => {
  const title = java('ui/SaturnTitleScreen.java');
  assert.ok(!/Client"/.test(title) && !/CLIENT/.test(title), 'no "Client" on the title screen');
  assert.match(title, /"SATURN"/);
  assert.match(title, /Glass\.logo\(g, lx/);
  assert.match(java('GlassCompanion.java'), /registerBuiltinPack\(\s*id\("saturn_panorama"\)/);
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'companion-mod/src/main/resources/resourcepacks/saturn_panorama/pack.mcmeta'), 'utf8'));
  assert.ok(meta.pack.min_format <= 97 && meta.pack.max_format >= 97);
  const png = Buffer.from(fs.readFileSync(path.join(root, 'companion-mod/saturn_logo.png.b64'), 'utf8'), 'base64');
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png[25], 6, 'logo is RGBA');
});

test('panorama renderer writes six seamless-ready cube faces', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-'));
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, [path.join(root, 'scripts/make-panorama.js'), out, '16']);
  for (let i = 0; i < 6; i++) {
    const buf = fs.readFileSync(path.join(out, `panorama_${i}.png`));
    assert.equal(buf.readUInt32BE(16), 16);
    assert.ok(zlib.inflateSync(buf.subarray(41, buf.length - 16)).length === 16 * (16 * 3 + 1));
  }
});
