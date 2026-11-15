'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { rulesAllow } = require('../core/rules');
const { mavenPath, resolveLibraries } = require('../core/libraries');
const { mergeVersions } = require('../core/mojang');
const { buildLaunch, substitute, redactedCommand } = require('../core/launch');
const { layout } = require('../core/paths');
const { SecretStore, plainCipher } = require('../core/secrets');
const companion = require('../core/companion');
const { parseFileBlocks, safeRel, summarizeBuildErrors, githubRepo } = require('../core/grok/porter');
const { outputText } = require('../core/grok/xai');
const installer = require('../core/mods/install');
const { neoforgePrefix } = require('../core/loaders');
const { redact } = require('../core/util');
const instances = require('../core/instances');

const mac = { name: 'osx', arch: 'arm64', version: '25.0' };
const linux = { name: 'linux', arch: 'x86_64', version: '6.1' };

test('rules: os allow lists and features', () => {
  assert.equal(rulesAllow([{ action: 'allow', os: { name: 'osx' } }], mac), true);
  assert.equal(rulesAllow([{ action: 'allow', os: { name: 'osx' } }], linux), false);
  assert.equal(rulesAllow([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }], mac), false);
  assert.equal(rulesAllow([{ action: 'allow', features: { is_demo_user: true } }], mac, { is_demo_user: true }), true);
  assert.equal(rulesAllow([{ action: 'allow', features: { is_demo_user: true } }], mac, {}), false);
  assert.equal(rulesAllow(undefined, mac), true);
});

test('maven paths', () => {
  assert.equal(mavenPath('net.fabricmc:fabric-loader:0.20.1'), 'net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar');
  assert.equal(mavenPath('org.lwjgl:lwjgl:3.4.3:natives-macos-arm64'), 'org/lwjgl/lwjgl/3.4.3/lwjgl-3.4.3-natives-macos-arm64.jar');
  assert.equal(mavenPath('a.b:c:1@zip'), 'a/b/c/1/c-1.zip');
});

const vanilla = {
  id: '26.3', type: 'release', mainClass: 'net.minecraft.client.main.Main', assetIndex: { id: '34' }, assets: '34',
  javaVersion: { majorVersion: 25 },
  downloads: { client: { url: 'https://x/client.jar', sha1: 'aa', size: 1 } },
  arguments: {
    game: ['--username', '${auth_player_name}', '--version', '${version_name}', '--gameDir', '${game_directory}', '--accessToken', '${auth_access_token}', { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' }],
    jvm: [{ rules: [{ action: 'allow', os: { name: 'osx' } }], value: ['-XstartOnFirstThread'] }, '-Djava.library.path=${natives_directory}/java', '-cp', '${classpath}'],
    'default-user-jvm': [{ value: ['-Xms2G', '-Xmx4G', '-XX:+UseCompactObjectHeaders'] }],
  },
  libraries: [
    { name: 'org.lwjgl:lwjgl:3.4.3', downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.4.3/lwjgl-3.4.3.jar', url: 'https://l/lwjgl.jar', sha1: 'b', size: 2 } } },
    { name: 'org.lwjgl:lwjgl:3.4.3:natives-macos-arm64', rules: [{ action: 'allow', os: { name: 'osx' } }], downloads: { artifact: { path: 'org/lwjgl/lwjgl/3.4.3/lwjgl-3.4.3-natives-macos-arm64.jar', url: 'https://l/n.jar', sha1: 'c', size: 3 } } },
    { name: 'org.ow2.asm:asm:9.1', downloads: { artifact: { path: 'org/ow2/asm/asm/9.1/asm-9.1.jar', url: 'https://l/asm-old.jar', sha1: 'd', size: 4 } } },
  ],
};
const fabric = {
  id: 'fabric-loader-0.20.1-26.3', inheritsFrom: '26.3', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  arguments: { game: [], jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '] },
  libraries: [
    { name: 'org.ow2.asm:asm:9.10.1', url: 'https://maven.fabricmc.net/', sha1: 'e', size: 5 },
    { name: 'net.fabricmc:fabric-loader:0.20.1', url: 'https://maven.fabricmc.net/' },
  ],
};

test('mergeVersions: loader wins duplicate libraries, args concatenate', () => {
  const m = mergeVersions(vanilla, fabric);
  assert.equal(m.mainClass, 'net.fabricmc.loader.impl.launch.knot.KnotClient');
  assert.equal(m.jar, '26.3');
  const asm = m.libraries.filter((l) => l.name.startsWith('org.ow2.asm:asm:'));
  assert.equal(asm.length, 1);
  assert.equal(asm[0].name, 'org.ow2.asm:asm:9.10.1');
  assert.ok(m.arguments.jvm.includes('-DFabricMcEmu= net.minecraft.client.main.Main '));
  assert.ok(m.arguments['default-user-jvm']);
});

test('resolveLibraries: platform filtering and maven URLs', () => {
  const m = mergeVersions(vanilla, fabric);
  const onMac = resolveLibraries(m, '/libs', mac).classpath.map((l) => l.name);
  const onLinux = resolveLibraries(m, '/libs', linux).classpath.map((l) => l.name);
  assert.ok(onMac.includes('org.lwjgl:lwjgl:3.4.3:natives-macos-arm64'));
  assert.ok(!onLinux.includes('org.lwjgl:lwjgl:3.4.3:natives-macos-arm64'));
  const loader = resolveLibraries(m, '/libs', mac).classpath.find((l) => l.name === 'net.fabricmc:fabric-loader:0.20.1');
  assert.equal(loader.url, 'https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar');
  assert.equal(loader.path, path.join('/libs', 'net/fabricmc/fabric-loader/0.20.1/fabric-loader-0.20.1.jar'));
});

test('buildLaunch: full macOS command for a Fabric 26.3 instance', () => {
  const dirs = layout('/data');
  const m = mergeVersions(vanilla, fabric);
  const spec = buildLaunch({
    dirs, version: { ...m, id: fabric.id }, instance: { memoryMb: 6144, jvmArgs: '-Dfoo=bar' }, instanceDir: '/data/instances/x',
    account: { type: 'msa', name: 'Izak', uuid: 'u1', accessToken: 'SECRET', xuid: '9' }, platform: mac, javaPath: '/j/bin/java',
  });
  const a = spec.args;
  assert.equal(a[0], '-Xms2048M');
  assert.equal(a[1], '-Xmx6144M');
  assert.ok(a.includes('-XX:+UseCompactObjectHeaders'));
  assert.ok(!a.includes('-Xmx4G'), 'version default heap must not override the user setting');
  assert.ok(a.includes('-Dfoo=bar'));
  assert.ok(a.includes('-XstartOnFirstThread'));
  assert.ok(a.includes('-Djava.library.path=/data/instances/x/.natives/java'));
  assert.ok(a.includes('-DFabricMcEmu= net.minecraft.client.main.Main'));
  const cp = a[a.indexOf('-cp') + 1].split(':');
  assert.equal(cp[cp.length - 1], '/data/versions/26.3/26.3.jar');
  assert.ok(cp.some((p) => p.endsWith('fabric-loader-0.20.1.jar')));
  assert.ok(a.indexOf('net.fabricmc.loader.impl.launch.knot.KnotClient') > a.indexOf('-cp'));
  assert.deepEqual(a.slice(a.indexOf('--username'), a.indexOf('--username') + 2), ['--username', 'Izak']);
  assert.ok(a.includes('fabric-loader-0.20.1-26.3'));
  assert.ok(!a.includes('--demo'));
  assert.ok(!redactedCommand(spec).includes('SECRET'));
  assert.ok(spec.downloads.some((d) => d.path === '/data/versions/26.3/26.3.jar'));
});

test('buildLaunch: demo account adds --demo; linux has no -XstartOnFirstThread', () => {
  const spec = buildLaunch({ dirs: layout('/d'), version: vanilla, instance: { memoryMb: 2048 }, instanceDir: '/d/i', account: { type: 'demo', name: 'P', uuid: '0', accessToken: '0' }, platform: linux, javaPath: 'java' });
  assert.ok(spec.args.includes('--demo'));
  assert.ok(!spec.args.includes('-XstartOnFirstThread'));
});

test('substitute leaves unknown placeholders', () => {
  assert.equal(substitute('${a}-${b}', { a: 1 }), '1-${b}');
});

test('secret store encrypts through the cipher and never reports values', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-'));
  let encrypted = 0;
  const cipher = { ...plainCipher, encryptString: (s) => { encrypted++; return Buffer.from(s).reverse(); }, decryptString: (b) => Buffer.from(b).reverse().toString() };
  const s = new SecretStore(path.join(dir, 's.bin'), cipher);
  await s.set('xaiApiKey', 'xai-abc');
  assert.equal(encrypted, 1);
  assert.ok(!fs.readFileSync(path.join(dir, 's.bin'), 'utf8').includes('xai-abc'));
  const s2 = new SecretStore(path.join(dir, 's.bin'), cipher);
  assert.equal(await s2.get('xaiApiKey'), 'xai-abc');
  assert.deepEqual(await s2.status(['xaiApiKey', 'curseforgeApiKey']), { xaiApiKey: true, curseforgeApiKey: false });
});

test('companion config sanitizes values and install seeds config', async () => {
  const c = companion.sanitize({ zoomFactor: 99, fpsHud: 0, crosshairColor: '#ff0000', bogus: 1, hudColor: 'red' });
  assert.equal(c.zoomFactor, 10);
  assert.equal(c.fpsHud, false);
  assert.equal(c.crosshairColor, '#FF0000');
  assert.equal(c.hudColor, '#FFFFFF');
  assert.ok(!('bogus' in c));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-'));
  const jar = path.join(dir, 'glass-companion-0.1.0.jar');
  fs.writeFileSync(jar, 'jar');
  fs.mkdirSync(path.join(dir, 'inst', 'mods'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'inst', 'mods', 'glass-companion-0.0.9.jar'), 'old');
  const inst = { type: 'client', loader: 'fabric', mcVersion: '26.3', companion: true };
  const entry = await companion.install(path.join(dir, 'inst'), inst, jar, { ...companion.DEFAULT_CONFIG, fullbright: true });
  assert.equal(entry.file, 'glass-companion-0.1.0.jar');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'inst', 'mods')), ['glass-companion-0.1.0.jar']);
  assert.equal((await companion.readConfig(path.join(dir, 'inst'))).fullbright, true);
  assert.equal(await companion.install(dir, { ...inst, loader: 'forge' }, jar, {}), null);
});

test('porter: parses file blocks and rejects unsafe paths', () => {
  const { files, deletes } = parseFileBlocks('junk\n<file path="src/main/java/A.java">\nclass A {}\n</file>\n<delete path="src/main/java/Old.java"/>\n<file path="../evil">x</file>');
  assert.equal(files.length, 2);
  assert.equal(files[0].content, 'class A {}');
  assert.deepEqual(deletes, ['src/main/java/Old.java']);
  assert.equal(safeRel('../evil'), null);
  assert.equal(safeRel('/etc/passwd'), null);
  assert.equal(safeRel('gradle.properties'), null);
  assert.equal(safeRel('src/main/java/../java/A.java'), 'src/main/java/A.java');
  assert.match(summarizeBuildErrors('ok\n/x/A.java:3: error: cannot find symbol\n  sym\nmore\n\nBUILD FAILED'), /cannot find symbol/);
  assert.deepEqual(githubRepo('https://github.com/LambdAurora/LambDynamicLights.git'), { owner: 'LambdAurora', repo: 'LambDynamicLights' });
  assert.equal(githubRepo('https://gitlab.com/x/y'), null);
});

test('xai: output_text extraction', () => {
  assert.equal(outputText({ output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: 'a' }, { type: 'output_text', text: 'b' }] }] }), 'ab');
});

test('mods: dependency planning picks versions and recurses into required deps', async () => {
  const versions = {
    mod: [{ id: 'v1', project_id: 'mod', version_type: 'release', date_published: '2026-11-01', dependencies: [{ project_id: 'lib', dependency_type: 'required' }, { project_id: 'opt', dependency_type: 'optional' }], files: [] }],
    lib: [{ id: 'l2', project_id: 'lib', version_type: 'beta', date_published: '2026-11-02', dependencies: [], files: [] }, { id: 'l1', project_id: 'lib', version_type: 'release', date_published: '2026-10-01', dependencies: [], files: [] }],
  };
  const calls = [];
  const api = { getVersions: async (pid, q) => { calls.push([pid, q]); return versions[pid] || []; }, getVersion: async () => null };
  const inst = { loader: 'quilt', mcVersion: '26.3', type: 'client', mods: [] };
  const { plan, missing } = await installer.planModrinth(inst, 'mod', { api });
  assert.deepEqual(plan.map((p) => p.version.id), ['v1', 'l1']);
  assert.deepEqual(missing, []);
  assert.deepEqual(calls[0][1], { loaders: ['quilt', 'fabric'], gameVersions: ['26.3'] });
  const r2 = await installer.planModrinth({ ...inst, mods: [{ source: 'modrinth', projectId: 'lib' }] }, 'mod', { api });
  assert.deepEqual(r2.plan.map((p) => p.version.id), ['v1']);
  const r3 = await installer.planModrinth(inst, 'nothing', { api });
  assert.equal(r3.missing.length, 1);
});

test('mods: compatibility check flags mods that need a Grok port', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-'));
  fs.mkdirSync(path.join(dir, 'mods'));
  fs.writeFileSync(path.join(dir, 'mods', 'old.jar'), 'old');
  fs.writeFileSync(path.join(dir, 'mods', 'new.jar'), 'new');
  const { sha1File } = require('../core/net');
  const ho = await sha1File(path.join(dir, 'mods', 'old.jar'));
  const hn = await sha1File(path.join(dir, 'mods', 'new.jar'));
  const api = {
    versionsByHash: async () => ({ [ho]: { id: 'o', project_id: 'P1', game_versions: ['1.21.4'], loaders: ['fabric'] }, [hn]: { id: 'n1', project_id: 'P2', game_versions: ['26.2'], loaders: ['fabric'] } }),
    latestForHashes: async () => ({ [hn]: { id: 'n2', version_number: '2.0', project_id: 'P2' } }),
  };
  const inst = { loader: 'fabric', mcVersion: '26.3', mods: [{ source: 'modrinth', file: 'old.jar', projectId: 'P1' }, { source: 'modrinth', file: 'new.jar', projectId: 'P2' }] };
  const r = await installer.checkCompatibility(dir, inst, { api });
  assert.equal(r['old.jar'].status, 'needs-port');
  assert.equal(r['new.jar'].status, 'update');
  assert.equal(r['new.jar'].latestName, '2.0');
});

test('neoforge version prefix', () => {
  assert.equal(neoforgePrefix('26.3'), '26.3.0.');
  assert.equal(neoforgePrefix('1.21.1'), '21.1.');
});

test('redact hides tokens and keys', () => {
  const s = redact('Authorization: Bearer abc.def --accessToken eyJ123 key xai-ABCDEFGHIJKLMNOP');
  assert.ok(!s.includes('abc.def') && !s.includes('eyJ123') && !s.includes('ABCDEFGHIJKLMNOP'));
});

test('instances: create/list/update/remove', async () => {
  const dirs = layout(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-')));
  const a = await instances.create(dirs, { name: 'My Pack!', loader: 'fabric' });
  assert.equal(a.id, 'my-pack');
  assert.equal(a.mcVersion, '26.3');
  assert.equal(a.companion, true);
  const b = await instances.create(dirs, { name: 'My Pack!', loader: 'paper' });
  assert.notEqual(b.id, a.id);
  assert.equal(b.type, 'server');
  assert.ok(fs.existsSync(path.join(dirs.instances, b.id, 'plugins')));
  await instances.update(dirs, a.id, { memoryMb: 8192 });
  assert.equal((await instances.get(dirs, a.id)).memoryMb, 8192);
  await instances.remove(dirs, b.id);
  assert.equal((await instances.list(dirs)).length, 1);
});

const settingsStore = require('../core/settings');
const defaults = require('../core/defaults');
const schematics = require('../core/schematics');
const { LauncherService } = require('../core/service');
const AdmZip = require('adm-zip');

test('settings default to the public Azure client ID', () => {
  assert.equal(settingsStore.DEFAULTS.msaClientId, '8e130755-4b0b-4252-bc49-40cfa995f0d3');
  assert.equal(defaults.msaClientId, '8e130755-4b0b-4252-bc49-40cfa995f0d3');
});

test('curseforge key: user value overrides built-in; status never reveals secrets', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-'));
  const svc = await new LauncherService({ dataDir, cipher: plainCipher, resourcesDir: dataDir }).init();
  const st = await svc.secretStatus();
  assert.equal(typeof st.curseforgeApiKey, 'boolean');
  assert.equal(typeof st.curseforgeApiKeyBuiltin, 'boolean');
  assert.equal(st.curseforgeApiKey, Boolean(st.curseforgeApiKeyCustom || st.curseforgeApiKeyBuiltin));
  const builtin = await svc.curseforgeKey();
  assert.equal(Boolean(builtin), st.curseforgeApiKeyBuiltin || st.curseforgeApiKeyCustom);
  assert.equal(JSON.stringify(st).includes(builtin || 'no-key'), false);
  await svc.setSecret('curseforgeApiKey', 'user-override-key-for-test');
  assert.equal(await svc.curseforgeKey(), 'user-override-key-for-test');
  const st2 = await svc.secretStatus();
  assert.equal(st2.curseforgeApiKeyCustom, true);
  assert.equal(st2.curseforgeApiKey, true);
  await svc.setSecret('curseforgeApiKey', '');
  const back = await svc.curseforgeKey();
  assert.ok(back === defaults.curseforgeApiKey());
});

test('schematics: list, add, zip extract, remove, and reject path traversal', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-schem-'));
  const inst = path.join(root, 'inst');
  fs.mkdirSync(path.join(inst, 'schematics'), { recursive: true });
  fs.mkdirSync(path.join(inst, 'config', 'worldedit', 'schematics'), { recursive: true });
  fs.writeFileSync(path.join(inst, 'schematics', 'house.litematic'), 'lite');
  fs.writeFileSync(path.join(inst, 'config', 'worldedit', 'schematics', 'farm.schem'), 'we');
  fs.writeFileSync(path.join(inst, 'schematics', 'notes.txt'), 'nope');
  const listed = await schematics.list(inst);
  assert.deepEqual(listed.map((f) => f.name).sort(), ['farm.schem', 'house.litematic']);
  assert.ok(listed.find((f) => f.folder.includes('worldedit')));

  const src = path.join(root, 'castle.nbt');
  fs.writeFileSync(src, 'struct');
  const added = await schematics.addFiles(inst, [src]);
  assert.equal(added.length, 1);
  assert.ok(fs.existsSync(path.join(inst, added[0])));

  const zipPath = path.join(root, 'pack.zip');
  const zip = new AdmZip();
  zip.addFile('builds/tower.litematic', Buffer.from('tower'));
  zip.addFile('readme.txt', Buffer.from('no'));
  zip.addFile('evil.jar', Buffer.from('pk'));
  zip.addFile('../escape.litematic', Buffer.from('x'));
  zip.writeZip(zipPath);
  const fromZip = await schematics.addFiles(inst, [zipPath]);
  assert.ok(fromZip.some((f) => f.endsWith('tower.litematic')));
  assert.ok(!fromZip.some((f) => f.endsWith('evil.jar') || f.endsWith('readme.txt')));

  await schematics.remove(inst, 'schematics/house.litematic');
  assert.ok(!fs.existsSync(path.join(inst, 'schematics', 'house.litematic')));
  await assert.rejects(() => schematics.remove(inst, '../instance.json'), /outside/);
  await assert.rejects(() => schematics.addFiles(inst, [path.join(root, 'malware.exe')]), /not a schematic/);
  assert.equal(schematics.hasLitematica({ mods: [{ projectId: 'bEpr0Arc', title: 'Litematica' }] }), true);
  assert.equal(schematics.hasLitematica({ mods: [{ projectId: 'sodium', title: 'Sodium' }] }), false);
  assert.equal(schematics.allowedDownloadUrl('https://minemev.com/api/minemev/download/x/a.litematic'), true);
  assert.equal(schematics.allowedDownloadUrl('https://evil.example/a.litematic'), false);
  assert.equal(schematics.allowedDownloadUrl('http://minemev.com/a.litematic'), false);
});

test('microsoft unapproved app uses a clear waiting-on-Mojang message', () => {
  const src = fs.readFileSync(path.join(__dirname, '../core/auth/msa.js'), 'utf8');
  assert.match(src, /Microsoft sign-in is waiting on Mojang approval/);
  assert.match(src, /APP_NOT_APPROVED/);
  assert.match(src, /Invalid app registration/);
  assert.match(src, /status === 403/);
});


const backgrounds = require('../core/backgrounds');

test('settings: background fields persist through save and load', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-set-'));
  const file = path.join(dir, 'settings.json');
  const saved = await settingsStore.save(file, {
    theme: 'light',
    accent: '#ff8fb1',
    glassIntensity: 0.4,
    backgroundId: 'sunset',
    backgroundSolid: '#c46b4a',
    backgroundBlur: 0.3,
    backgroundDim: 0.15,
    backgroundParallax: 0.5,
    customBackground: { id: 'abc', file: 'abc.webp', name: 'dunes.webp', kind: 'image', ext: 'webp' },
  });
  assert.equal(saved.backgroundId, 'sunset');
  assert.equal(saved.backgroundBlur, 0.3);
  assert.equal(saved.theme, 'light');
  assert.equal(saved.accent, '#ff8fb1');
  const loaded = await settingsStore.load(file);
  assert.equal(loaded.backgroundId, 'sunset');
  assert.equal(loaded.backgroundSolid, '#c46b4a');
  assert.equal(loaded.backgroundBlur, 0.3);
  assert.equal(loaded.backgroundDim, 0.15);
  assert.equal(loaded.backgroundParallax, 0.5);
  assert.equal(loaded.customBackground.file, 'abc.webp');
  assert.equal(loaded.glassStrength, 0.4, 'old glassIntensity carries over to glassStrength (0.1.4)');
  assert.equal(loaded.defaultVersion, '26.3');
  const cleared = await settingsStore.save(file, { ...loaded, customBackground: null, backgroundId: 'highlands' });
  assert.equal(cleared.customBackground, null);
  assert.equal(cleared.backgroundId, 'highlands');
});

test('settings: missing background fields fall back to defaults', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-set-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ theme: 'dark', memoryMb: 2048 }));
  const loaded = await settingsStore.load(file);
  assert.equal(loaded.backgroundId, 'highlands');
  assert.equal(loaded.backgroundSolid, '#1b1e52');
  assert.equal(loaded.customBackground, null);
  assert.equal(loaded.backgroundBlur, 0);
  assert.equal(loaded.backgroundDim, 0.2);
  assert.equal(loaded.backgroundParallax, 0.35);
  assert.equal(loaded.theme, 'dark');
  assert.equal(loaded.memoryMb, 2048);
});

test('backgrounds: import copies into the data folder and rejects bad files', async () => {
  const dirs = layout(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-bg-')));
  const src = path.join(dirs.root, 'sunset.webp');
  fs.writeFileSync(src, 'fake-webp-bytes');
  const meta = await backgrounds.importFile(dirs, src, { originalName: 'My Sunset.webp' });
  assert.equal(meta.kind, 'image');
  assert.equal(meta.ext, 'webp');
  assert.equal(meta.name, 'My Sunset.webp');
  assert.ok(meta.file.endsWith('.webp'));
  const dest = path.join(dirs.backgrounds, meta.file);
  assert.ok(fs.existsSync(dest));
  assert.equal(fs.readFileSync(dest, 'utf8'), 'fake-webp-bytes');
  assert.equal(await backgrounds.fileExists(dirs, meta.file), true);
  assert.match(backgrounds.mediaUrl(meta.file), /^glass-bg:\/\/file\//);

  await assert.rejects(() => backgrounds.importFile(dirs, path.join(dirs.root, 'notes.txt')), /png, jpg, webp, gif, mp4, or webm/);
  fs.writeFileSync(path.join(dirs.root, 'notes.txt'), 'nope');
  await assert.rejects(() => backgrounds.importFile(dirs, path.join(dirs.root, 'notes.txt')), /png, jpg, webp, gif, mp4, or webm/);
  await assert.rejects(() => backgrounds.importFile(dirs, path.join(dirs.root, 'missing.png')), /could not be read/);
  assert.throws(() => backgrounds.safePath(dirs, '../escape.webp'), /Invalid background file/);
  assert.throws(() => backgrounds.safePath(dirs, 'foo/bar.webp'), /Invalid background file/);
  assert.throws(() => backgrounds.safePath(dirs, 'secret.bin'), /png, jpg, webp/);

  await backgrounds.removeFile(dirs, meta.file);
  assert.equal(fs.existsSync(dest), false);
  await backgrounds.removeFile(dirs, 'already-gone.webp');
});

test('backgrounds: service import/remove and instance cover field', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-bgsvc-'));
  const svc = await new LauncherService({ dataDir, cipher: plainCipher, resourcesDir: dataDir }).init();
  assert.ok(fs.existsSync(path.join(dataDir, 'backgrounds')));
  const src = path.join(dataDir, 'loop.webm');
  fs.writeFileSync(src, 'video-bytes');
  const meta = await svc.importBackground(src);
  assert.equal(meta.kind, 'video');
  const settings = await svc.setSettings({ backgroundId: 'custom', customBackground: meta, backgroundBlur: 0.25 });
  assert.equal(settings.backgroundId, 'custom');
  assert.equal(settings.customBackground.file, meta.file);
  assert.equal(svc.backgroundUrl(meta.file), backgrounds.mediaUrl(meta.file));
  assert.throws(() => svc.backgroundUrl('../x.webp'), /Invalid/);

  const inst = await instances.create(svc.dirs, { name: 'Cover Test', loader: 'vanilla' });
  assert.equal(inst.background, 'art');
  const updated = await instances.update(svc.dirs, inst.id, { background: 'sunset' });
  assert.equal(updated.background, 'sunset');
  const withFile = await instances.update(svc.dirs, inst.id, { background: 'custom', customBackground: meta });
  assert.equal(withFile.customBackground.file, meta.file);

  await svc.removeBackgroundFile(meta.file);
  assert.equal(await backgrounds.fileExists(svc.dirs, meta.file), false);
  const again = await settingsStore.load(svc.dirs.settings);
  assert.equal(again.backgroundBlur, 0.25);
});
