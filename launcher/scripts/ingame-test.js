// Real in-game check: builds a "modder-test" Fabric 26.3 instance with the real
// LauncherService (companion + Performance pack from Modrinth), drops in a test
// world and starts the game on $DISPLAY with the Vulkan backend.
// Usage: node scripts/ingame-test.js <dataDir> <worldDir> [javaDir]
'use strict';
const path = require('path');
const fs = require('fs');
const { LauncherService } = require('../core/service');
const { plainCipher } = require('../core/secrets');

(async () => {
  const dataDir = path.resolve(process.argv[2] || 'verify-data');
  const worldSrc = process.argv[3];
  const javaDir = process.argv[4];
  const out = fs.createWriteStream(path.join(dataDir, 'ingame-output.log'));
  const svc = await new LauncherService({
    dataDir, cipher: plainCipher, resourcesDir: path.join(__dirname, '..', 'resources'), extraJavaDirs: javaDir ? [javaDir] : [],
    emit: (ch, d) => {
      if (ch === 'launch:log') out.write(d.line + '\n');
      else if (ch === 'launch:state') { console.log('[state]', JSON.stringify(d)); if (d.state === 'exited') setTimeout(() => process.exit(0), 500); }
      else if (ch === 'launch:progress') { if (d.done === d.total) console.log(`[${d.phase}]`); }
    },
  }).init();
  // Local test only: an offline profile so the dev world allows commands (shipped
  // builds use the Microsoft account, or demo mode without one).
  if (process.env.OFFLINE_NAME) svc.launchAccount = async () => ({ type: 'offline', name: process.env.OFFLINE_NAME, uuid: '5a7e2b1c9d0f4e3a8b6c1d2e3f405162', accessToken: '0' });
  let inst = (await svc.listInstances()).find((i) => i.name === 'modder-test');
  if (!inst) inst = await svc.createInstance({ name: 'modder-test', loader: 'fabric', mcVersion: '26.3', memoryMb: 4096 });
  const dir = svc.instanceDir(inst.id);
  fs.mkdirSync(path.join(dir, 'saves'), { recursive: true });
  const world = path.join(dir, 'saves', 'saturn-test');
  if (worldSrc && !fs.existsSync(world)) fs.cpSync(worldSrc, world, { recursive: true });
  const opts = path.join(dir, 'options.txt');
  const keep = fs.existsSync(opts) ? fs.readFileSync(opts, 'utf8').split('\n').filter((l) => l && !/^(preferredGraphicsBackend|showSubtitles|onboardAccessibility|narrator|tutorialStep|guiScale|pauseOnLostFocus|skipMultiplayerWarning|joinedFirstServer|soundCategory_music):/.test(l)) : [];
  fs.writeFileSync(opts, [...keep, 'preferredGraphicsBackend:"vulkan"', 'showSubtitles:true', 'onboardAccessibility:false', 'narrator:0', 'tutorialStep:none', 'guiScale:2', 'pauseOnLostFocus:false', 'skipMultiplayerWarning:true', 'joinedFirstServer:true', 'soundCategory_music:0.0'].join('\n') + '\n');
  const pp = await svc.perfPackInfo(inst.id);
  console.log('perf pack', JSON.stringify(pp.mods.map((m) => [m.title, m.installed, m.version])));
  const { pid } = await svc.launch(inst.id, process.env.WORLD === '0' ? {} : { world: process.env.WORLD || 'saturn-test' });
  const meta = (await svc.listInstances()).find((i) => i.id === inst.id);
  console.log('started pid', pid, 'mods', JSON.stringify(meta.mods.map((m) => `${m.file}${m.enabled === false ? ' (off)' : ''}`)));
})().catch((e) => { console.error('INGAME FAILED', e); process.exit(1); });
