'use strict';
// Live check: CurseForge search through the same helper the app uses.
// Never prints the API key.
const curseforge = require('../core/mods/curseforge');
const defaults = require('../core/defaults');

(async () => {
  const key = defaults.curseforgeApiKey();
  if (!key) {
    console.error('No built-in CurseForge key. Run npm run inject first.');
    process.exit(1);
  }
  const r = await curseforge.search(key, { query: 'jei', projectType: 'mod', limit: 5, versionFilter: false });
  if (!r.hits || !r.hits.length) {
    console.error(`CurseForge search for "jei" returned no hits (total=${r.total})`);
    process.exit(1);
  }
  console.log(`CurseForge search for "jei": ${r.total} total, first "${r.hits[0].title}" by ${r.hits[0].author}`);
})().catch((e) => {
  console.error('CurseForge search failed:', e && e.message);
  process.exit(1);
});
