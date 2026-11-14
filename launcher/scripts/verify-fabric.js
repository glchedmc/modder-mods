// End-to-end check on a dev machine: creates a Fabric 26.3 instance with the real
// LauncherService, downloads everything, prints the launch command, and starts the
// game for up to N seconds. Usage: node scripts/verify-fabric.js <dataDir> [javaDir] [seconds]
'use strict';
const path = require('path');
const fs = require('fs');
const { LauncherService } = require('../core/service');
const { plainCipher } = require('../core/secrets');
const launch = require('../core/launch');
const mojang = require('../core/mojang');

(async () => {
  const dataDir = path.resolve(process.argv[2] || 'verify-data');
  const javaDir = process.argv[3];
  const seconds = Number(process.argv[4] || 90);
  const lines = [];
  const svc = await new LauncherService({
    dataDir, cipher: plainCipher, resourcesDir: path.join(__dirname, '..', 'resources'), extraJavaDirs: javaDir ? [javaDir] : [],
    emit: (ch, d) => {
      if (ch === 'launch:log') { lines.push(d.line); if (lines.length < 400) console.log('[game]', d.line); }
      else if (ch === 'launch:progress') { if (d.done === d.total || d.done % 500 === 0) console.log(`[${d.phase}] ${d.done}/${d.total}`); }
      else console.log(`[${ch}]`, JSON.stringify(d));
    },
  }).init();
  let inst = (await svc.listInstances()).find((i) => i.name === 'Verify Fabric 26.3');
  if (!inst) inst = await svc.createInstance({ name: 'Verify Fabric 26.3', loader: 'fabric', mcVersion: '26.3', memoryMb: 3072 });
  console.log('instance', JSON.stringify({ id: inst.id, versionId: inst.versionId, loaderVersion: inst.loaderVersion, mods: inst.mods.map((m) => m.file) }));

  // Also show what the macOS (Apple silicon) command would be for this instance.
  const version = await mojang.resolveVersion(svc.dirs, inst.versionId);
  const macSpec = launch.buildLaunch({ dirs: svc.dirs, version, instance: inst, instanceDir: svc.instanceDir(inst.id), account: { type: 'msa', name: 'Izak', uuid: 'uuid', accessToken: 'TOKEN' }, platform: { name: 'osx', arch: 'arm64', version: '25.0' }, javaPath: '/Applications/Glass Launcher.app/…/java' });
  fs.writeFileSync(path.join(dataDir, 'macos-launch-command.txt'), launch.redactedCommand(macSpec).join('\n'));
  console.log('macOS command written; classpath entries:', macSpec.classpath.length);

  const { pid } = await svc.launch(inst.id);
  console.log('started pid', pid);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const child = svc.running.get(inst.id);
  if (child) { console.log('still running after', seconds, 's; stopping'); child.kill('SIGTERM'); }
  fs.writeFileSync(path.join(dataDir, 'game-output.log'), lines.join('\n'));
  setTimeout(() => process.exit(0), 1500);
})().catch((e) => { console.error('VERIFY FAILED', e); process.exit(1); });
