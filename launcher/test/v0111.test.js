'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const companion = require('../core/companion');

const root = path.join(__dirname, '..');
const java = (p) => fs.readFileSync(path.join(root, 'companion-mod/src/main/java/mc/glched/glasscompanion', p), 'utf8');

const MODULE_ELEMENTS = {
  effectTimers: 'modules/EffectTimers.java',
  echoRing: 'modules/EchoArrow.java',
  subtitles: 'mixin/SubtitleOverlayMixin.java',
  minimap: 'waypoints/MinimapBridge.java',
};

test('built-in module overlays are HUD editor elements (effect timers, sound arrows, subtitles, Corner Atlas map)', () => {
  const hud = java('HudRenderer.java');
  for (const [id, file] of Object.entries(MODULE_ELEMENTS)) {
    assert.match(hud, new RegExp(`element\\("${id}"`), `${id} registered`);
    assert.match(java(file), new RegExp(`HudRenderer\\.anchor\\([^)]*"${id}"`), `${file} draws through anchor("${id}")`);
  }
  assert.match(hud, /ANCHORED = Set\.of\("effectTimers", "echoRing", "subtitles", "minimap"\)/);
});

test('anchored overlays stay put until moved, then follow the saved spot and scale; they ignore the global HUD scale', () => {
  const hud = java('HudRenderer.java');
  assert.match(hud, /if \(f == null\)[\s\S]*?return false;/, 'unmoved: draw untouched');
  assert.match(hud, /baseScale\(String id\) \{\s*return ANCHORED\.contains\(id\) \? 1f : scale\(\);/);
  assert.match(hud, /s \/ baseScale\(id\)/, 'saved scale is relative to the base scale');
  // The pose is popped by every caller that got true.
  for (const file of Object.values(MODULE_ELEMENTS)) assert.match(java(file), /popMatrix/, file);
});

test('HUD editor can drag, resize and reset every element, including module overlays', () => {
  const editor = java('HudEditorScreen.java');
  assert.match(editor, /mouseScrolled/);
  assert.match(editor, /MOUSE_BUTTON_RIGHT/);
  assert.match(editor, /handleAt/);
  assert.match(editor, /HudRenderer\.BOUNDS/);
  assert.match(editor, /HudRenderer\.ELEMENTS/);
  assert.match(editor, /editing/);
});

test('layout entries for the new elements are saved with position and scale (and clamped)', () => {
  const out = companion.sanitize({ hudLayout: {
    effectTimers: [1, 0, 1.5], echoRing: [0.5, 0.5, 9], subtitles: [1, 0.85, 0.1], minimap: [0, 0], notAnElement: [1, 2, 3, 4],
  } });
  assert.deepEqual(out.hudLayout.effectTimers, [1, 0, 1.5]);
  assert.deepEqual(out.hudLayout.echoRing, [0.5, 0.5, 3]);
  assert.deepEqual(out.hudLayout.subtitles, [1, 0.85, 0.5]);
  assert.deepEqual(out.hudLayout.minimap, [0, 0]);
  assert.equal(out.hudLayout.notAnElement, undefined);
});

test('companion jar 0.1.11 is bundled, versions agree, and no keys are inside', () => {
  const props = fs.readFileSync(path.join(root, 'companion-mod/gradle.properties'), 'utf8');
  assert.match(props, /mod_version=0\.1\.11/);
  const jars = fs.readdirSync(path.join(root, 'resources/companion')).filter((f) => f.endsWith('.jar'));
  assert.deepEqual(jars, ['glass-companion-0.1.11.jar']);
  const buf = fs.readFileSync(path.join(root, 'resources/companion', jars[0]));
  assert.ok(buf.length > 100000);
  const key = path.join(root, '..', 'secrets', 'curseforge.key');
  if (fs.existsSync(key)) assert.ok(!buf.includes(fs.readFileSync(key, 'utf8').trim()), 'no CurseForge key in the jar');
  assert.match(fs.readFileSync(path.join(root, 'scripts/build-companion.js'), 'utf8'), /Newest version wins \(numeric compare/);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /0\.1\.11/);
});
