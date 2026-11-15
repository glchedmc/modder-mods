// Launch-tests the newest snapshot on vanilla and Fabric with the real LauncherService:
// checks the loader picker's availability answer, the Java major from the manifest,
// and that the game reaches the resource reload. Usage: node scripts/snapshot-test.js <dataDir> [seconds]
'use strict';
const path = require('path');
const { LauncherService } = require('../core/service');
const { plainCipher } = require('../core/secrets');
const mojang = require('../core/mojang');

(async () => {
  const dataDir = path.resolve(process.argv[2] || 'verify-data');
  const seconds = Number(process.argv[3] || 75);
  let lines = [];
  let exited = null;
  const svc = await new LauncherService({
    dataDir, cipher: plainCipher, resourcesDir: path.join(__dirname, '..', 'resources'),
    emit: (ch, d) => { if (ch === 'launch:log') lines.push(d.line); if (ch === 'launch:state' && d.state === 'exited') exited = d.code; },
  }).init();
  const versions = await svc.listVersions({ snapshots: true });
  const snap = versions.find((v) => v.type === 'snapshot');
  const avail = await svc.loadersFor(snap.id);
  const vanilla = await mojang.getVanillaVersion(svc.dirs, snap.id);
  console.log('snapshot', snap.id, 'java', mojang.javaMajorFor(vanilla), 'loaders', JSON.stringify(avail));
  const results = {};
  for (const loader of ['vanilla', 'fabric']) {
    if (!avail[loader]) { results[loader] = 'no build'; continue; }
    const name = `Snapshot ${loader} ${snap.id}`;
    let inst = (await svc.listInstances()).find((i) => i.name === name);
    if (!inst) inst = await svc.createInstance({ name, loader, mcVersion: snap.id, memoryMb: 3072 });
    // Headless test box only has llvmpipe; snapshots skip CPU Vulkan devices unless asked.
    if (process.env.ALLOW_CPU_VULKAN) inst = await svc.updateInstance(inst.id, { jvmArgs: '-Drenderpearl.vulkan.allowcpudevice=true' });
    lines = []; exited = null;
    const t0 = Date.now();
    const { pid } = await svc.launch(inst.id);
    while (Date.now() - t0 < seconds * 1000 && exited === null) await new Promise((r) => setTimeout(r, 1000));
    const child = svc.running.get(inst.id);
    if (child) child.kill('SIGTERM');
    const text = lines.join('\n');
    const ok = /Reloading ResourceManager|Created window|Sound engine started/.test(text) && !/Game crashed|Exception in thread "main"/.test(text);
    results[loader] = { pid, ok, backend: (text.match(/Using graphics backend [^,\n]*/) || [''])[0], fabric: (text.match(/Loading \d+ mods/) || [''])[0], exited };
    console.log(loader, JSON.stringify(results[loader]));
    await new Promise((r) => setTimeout(r, 3000));
  }
  setTimeout(() => process.exit(0), 500);
})().catch((e) => { console.error('SNAPSHOT TEST FAILED', e); process.exit(1); });
