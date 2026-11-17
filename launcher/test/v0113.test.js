'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LauncherService } = require('../core/service');
const instances = require('../core/instances');
const launch = require('../core/launch');
const { LaunchLog, diagnose, ensureExecutable, summarizeCommand } = require('../core/launch-log');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const plainCipher = { encrypt: (s) => Buffer.from(s), decrypt: (b) => Buffer.from(b).toString() };

test('Play never starts a dedicated server, and the refusal is logged and visible', async () => {
  const dir = tmp('sat-013-');
  const events = [];
  const svc = await new LauncherService({ dataDir: dir, logsDir: path.join(dir, 'logs'), cipher: plainCipher, resourcesDir: dir, emit: (c, d) => events.push([c, d]), secretStorage: { mode: 'file', label: 'x' } }).init();
  const srv = await instances.create(svc.dirs, { name: 'Fabric Server 26.3', loader: 'fabric-server', mcVersion: '26.3' });
  assert.equal(srv.type, 'server');
  await assert.rejects(() => svc.launch(srv.id), (e) => e.code === 'SERVER_NOT_PLAYABLE' && /dedicated server/.test(e.message) && Boolean(e.logFile));
  assert.ok(!svc.running.has(srv.id));
  const main = fs.readFileSync(path.join(dir, 'logs', 'main.log'), 'utf8');
  assert.match(main, /launch\[.*\]: begin: "Fabric Server 26.3" type=server/);
  assert.match(main, /FAILED/);
  assert.ok(events.some(([c, d]) => c === 'launch:state' && d.state === 'error' && d.logFile));
  assert.ok(fs.existsSync(svc.launchLogInfo(srv.id).file));
});

test('main.log session header names the platform instead of [object Object]', async () => {
  const dir = tmp('sat-013h-');
  const svc = await new LauncherService({ dataDir: dir, logsDir: path.join(dir, 'logs'), cipher: plainCipher, resourcesDir: dir, platform: { name: 'osx', arch: 'arm64', version: '25' }, secretStorage: { mode: 'file', label: 'x' } }).init();
  svc.authLog.header({ app: '0.1.13' });
  const log = fs.readFileSync(path.join(dir, 'logs', 'auth.log'), 'utf8');
  assert.match(log, /platform=osx-arm64/);
  assert.ok(!/object Object/.test(log));
});

test('spawn failures surface (no uncaught exception) and output is captured', async () => {
  const errors = [];
  const c = launch.start({ java: '/nonexistent/java', args: [], cwd: os.tmpdir() }, { onError: (e) => errors.push(e), onExit: () => {} });
  await assert.rejects(c.ready, (e) => e.code === 'ENOENT');
  assert.equal(errors.length, 1);
  const lines = [];
  const code = await new Promise((res) => {
    const ch = launch.start({ java: process.execPath, args: ['-e', 'console.log("out");console.error("err");process.exit(3)'], cwd: os.tmpdir() }, { onLine: (l) => lines.push(l), onExit: res });
    ch.ready.catch(() => {});
  });
  assert.equal(code, 3);
  assert.deepEqual(lines.sort(), ['err', 'out']);
});

test('macOS launch args always carry -XstartOnFirstThread (arm64) and never leak the token in summaries', () => {
  const version = { id: 'v', mainClass: 'M', libraries: [], arguments: { jvm: ['-cp', '${classpath}'], game: ['--accessToken', '${auth_access_token}'] } };
  const dirs = { libraries: '/l', versions: '/v', assets: '/a' };
  const mk = (name) => launch.buildLaunch({ dirs, version, instance: { memoryMb: 2048 }, instanceDir: '/i', account: { name: 'n', uuid: 'u', accessToken: 'SECRET', type: 'msa' }, platform: { name, arch: 'arm64', version: '1' }, javaPath: '/j' });
  const mac = mk('osx');
  assert.ok(mac.args.includes('-XstartOnFirstThread'));
  assert.ok(mac.args.indexOf('-XstartOnFirstThread') < mac.args.indexOf('M'));
  assert.ok(!mk('linux').args.includes('-XstartOnFirstThread'));
  const summary = summarizeCommand(launch.redactedCommand(mac));
  assert.ok(!summary.includes('SECRET'));
});

test('java binaries regain their exec bit', async () => {
  if (process.platform === 'win32') return;
  const d = tmp('sat-013x-');
  const bin = path.join(d, 'java');
  fs.writeFileSync(bin, '#!/bin/sh\n'); fs.chmodSync(bin, 0o644);
  assert.equal(await ensureExecutable(bin), true);
  fs.accessSync(bin, fs.constants.X_OK);
});

test('diagnosis explains common crashes and per-launch logs redact secrets and prune', () => {
  assert.match(diagnose(['java.lang.UnsupportedClassVersionError: x'], { code: 1 }), /too old/);
  assert.match(diagnose(['GLFW error 65542: failed'], { code: 1 }), /graphics/);
  assert.match(diagnose([], { code: 1, ranMs: 2000 }), /seconds/);
  const d = tmp('sat-013l-');
  const l = new LaunchLog(d, 'my inst');
  l.write('accessToken: abcdef123456789');
  const text = fs.readFileSync(l.file, 'utf8');
  assert.ok(!text.includes('abcdef123456789'));
  assert.match(path.basename(l.file), /^my_inst-\d{8}-\d{6}\.log$/);
  for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(l.dir, `x${i}.log`), 'x');
  new LaunchLog(d, 'again');
  assert.ok(fs.readdirSync(l.dir).length <= 26);
});

test('renderer: Play only targets client instances and failures show a log button', () => {
  const app = fs.readFileSync(path.join(__dirname, '../renderer/src/App.jsx'), 'utf8');
  assert.match(app, /clients\.find\(\(i\) => i\.id === settings\.selectedInstance\) \|\| clients\[0\]/);
  assert.match(app, /Show log/);
  assert.match(app, /asServer: inst\.type === 'server'/);
});

test('rename to Saturn: visible names say Saturn, data folder and Keychain name stay compatible', () => {
  const root = path.join(__dirname, '..');
  const pkg = require('../package.json');
  assert.equal(pkg.productName, 'Saturn');
  assert.equal(pkg.build.productName, 'Saturn');
  assert.equal(pkg.build.mac.artifactName, 'Saturn-${version}-${arch}.${ext}');
  assert.equal(pkg.build.linux.artifactName, 'Saturn-${version}-${arch}.${ext}');
  assert.equal(pkg.build.mac.extendInfo.CFBundleDisplayName, 'Saturn');
  const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
  assert.match(main, /app\.setName\('Saturn Client'\)/, 'internal name keeps the old Keychain entry');
  assert.match(main, /app\.setPath\('userData', path\.join\(app\.getPath\('appData'\), 'Saturn Client'\)\)/);
  assert.match(main, /title: 'Saturn',/);
  assert.match(main, /label: 'Quit Saturn'/);
  assert.match(fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8'), /<title>Saturn<\/title>/);
  const app = fs.readFileSync(path.join(root, 'renderer/src/App.jsx'), 'utf8');
  assert.ok(!/<small>Client<\/small>/.test(app), 'sidebar subtitle removed');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /xattr -cr \/Applications\/Saturn\.app/);
  assert.match(readme, /Saturn\.app/);
  const lang = fs.readFileSync(path.join(root, 'companion-mod/src/main/resources/assets/glass-companion/lang/en_us.json'), 'utf8');
  assert.ok(!/Saturn Client/.test(lang));
});

test('logo has a planet and ring only: no cube or crystal anywhere', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['build/icon.svg', 'build/dock/night.svg', 'build/dock/dawn.svg', 'scripts/planet-art.mjs', 'renderer/src/components/brand.jsx']) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/crystal|wireframe|cube|M-220 -120|points="0,-230/i.test(t.replace(/\/\/[^\n]*|<!--[\s\S]*?-->/g, '')), `${f} still draws a cube or crystal`);
    assert.match(t, /ellipse/);
    assert.match(t, /circle/);
  }
  const settings = fs.readFileSync(path.join(root, 'renderer/src/views/Settings.jsx'), 'utf8');
  assert.ok(!/crystal|wireframe/i.test(settings), 'app icon picker no longer offers the cube/crystal icons');
  assert.ok(!/crystal|wireframe|cube/i.test(fs.readFileSync(path.join(root, 'companion-mod/art/logo-mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')));
  const png = Buffer.from(fs.readFileSync(path.join(root, 'companion-mod/saturn_logo.png.b64'), 'utf8'), 'base64');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 256);
});
