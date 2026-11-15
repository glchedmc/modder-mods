'use strict';
// Performance pack: Sodium plus optimization mods that have builds for the
// instance's Minecraft version and are known to run together (checked for 26.3
// with the Saturn companion). Downloaded from Modrinth on the user's machine,
// never bundled. Mods in the pack carry `pack: 'performance'` in instance.json.
const installer = require('./mods/install');

const PACK = [
  { projectId: 'AANobbMI', slug: 'sodium', title: 'Sodium', why: 'Much faster chunk rendering' },
  { projectId: 'gvQqBUqZ', slug: 'lithium', title: 'Lithium', why: 'Faster game logic (singleplayer and LAN hosting)' },
  { projectId: 'uXXizFIs', slug: 'ferrite-core', title: 'FerriteCore', why: 'Lower memory use' },
  { projectId: '5ZwdcRci', slug: 'immediatelyfast', title: 'ImmediatelyFast', why: 'Faster HUD, text and entity drawing' },
  { projectId: 'NNAgCjsB', slug: 'entityculling', title: 'Entity Culling', why: 'Skips entities you cannot see' },
  { projectId: 'PtjYWJkn', slug: 'sodium-extra', title: 'Sodium Extra', why: 'More video settings (needs Sodium)' },
];
const PACK_IDS = new Set(PACK.map((p) => p.projectId));

function supports(instance) {
  return instance.type === 'client' && (instance.loader === 'fabric' || instance.loader === 'quilt');
}

function wanted(instance, settings) {
  if (!supports(instance)) return false;
  if (instance.performancePack === true || instance.performancePack === false) return instance.performancePack;
  return settings.performancePack !== false;
}

/**
 * Installs missing pack mods (skipping ones the user removed or that have no
 * build for this version) and enables/disables pack mods to match the toggle.
 * Network failures are reported, not thrown, so a launch never fails over it.
 * Returns {mods, added, skipped, errors}.
 */
async function sync(instanceDir, instance, settings, { plan = installer.planModrinth, apply = installer.applyPlan, setEnabled = installer.setEnabled, onLog = () => {} } = {}) {
  const result = { mods: instance.mods || [], added: [], skipped: [], errors: [] };
  if (!supports(instance)) return result;
  const on = wanted(instance, settings);
  const removed = new Set(instance.performancePackRemoved || []);
  let mods = [...result.mods];
  for (const m of mods) {
    if (m.pack === 'performance' && m.enabled !== on) {
      try { await setEnabled(instanceDir, m, on); m.enabled = on; } catch (e) { result.errors.push(`${m.title}: ${e.message}`); }
    }
  }
  if (on) {
    for (const p of PACK) {
      if (removed.has(p.projectId) || mods.some((m) => m.projectId === p.projectId)) continue;
      try {
        const r = await plan({ ...instance, mods }, p.projectId);
        if (!r.plan.length || r.missing.length) { result.skipped.push({ title: p.title, reason: `no build for ${instance.mcVersion}` }); continue; }
        onLog(`Performance pack: installing ${p.title}`);
        const added = await apply(instanceDir, instance, 'modrinth', r.plan, { titles: { [p.projectId]: p.title } });
        for (const a of added) { if (PACK_IDS.has(a.projectId)) a.pack = 'performance'; }
        mods = [...mods, ...added];
        result.added.push(...added.map((a) => a.title));
      } catch (e) {
        result.errors.push(`${p.title}: ${e.message}`);
      }
    }
  }
  result.mods = mods;
  return result;
}

module.exports = { PACK, PACK_IDS, supports, wanted, sync };
