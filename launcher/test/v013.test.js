'use strict';
// 0.1.3: Saturn Client rename, skins, AI skins, cosmetics, mod rename, hosting, mic, icons.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pngInfo, validateSkin, validateCape } = require('../core/skins/png');
const { SkinLibrary } = require('../core/skins/library');
const ai = require('../core/skins/ai');
const net = require('../core/net');
const { CosmeticsStore, syncInstance, sanitizeState } = require('../core/cosmetics');
const hosting = require('../core/hosting');
const mic = require('../core/mic');
const { renameMod, resetMod, safeFileName } = require('../core/mods/rename');
const { migrateDataDir } = require('../core/migrate');
const { LauncherService } = require('../core/service');
const { plainCipher } = require('../core/secrets');
const settingsStore = require('../core/settings');
const instances = require('../core/instances');

function crc32(buf) {
  let c; const table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, rgba = Buffer.alloc(w * h * 4, 255)) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('png: reads size and validates skins and capes', () => {
  assert.deepEqual([pngInfo(png(64, 64)).width, pngInfo(png(64, 64)).height], [64, 64]);
  assert.equal(validateSkin(png(64, 32)).legacy, true);
  assert.throws(() => validateSkin(png(32, 32)), /64×64/);
  assert.throws(() => validateSkin(Buffer.from('not a png at all, definitely not one')), /not a PNG/);
  assert.ok(validateCape(png(64, 32)));
  assert.ok(validateCape(`data:image/png;base64,${png(128, 64).toString('base64')}`));
  assert.throws(() => validateCape(png(22, 17)), /64×32/);
});

test('skin library: add, list, rename, select, remove', async () => {
  const lib = new SkinLibrary(tmp('skins-'));
  const a = await lib.add({ png: png(64, 64), name: '  Astronaut  ', variant: 'slim', source: 'ai', prompt: 'space suit' });
  assert.equal(a.name, 'Astronaut');
  assert.equal(a.variant, 'slim');
  const b = await lib.add({ png: `data:image/png;base64,${png(64, 64).toString('base64')}`, name: '', variant: 'weird' });
  assert.equal(b.name, 'Untitled skin');
  assert.equal(b.variant, 'classic');
  let l = await lib.list();
  assert.equal(l.skins.length, 2);
  assert.equal(l.selected, a.id);
  assert.match(l.skins[0].dataUrl, /^data:image\/png;base64,/);
  await lib.update(b.id, { name: 'Knight', variant: 'slim' });
  await lib.select(b.id);
  await lib.remove(b.id);
  l = await lib.list();
  assert.equal(l.skins.length, 1);
  assert.equal(l.selected, a.id);
  await assert.rejects(lib.add({ png: png(10, 10) }), /64×64/);
  assert.throws(() => lib.fileFor('../../etc'), /Bad skin id/);
});

test('skin map: front-view character becomes a valid 64x64 skin', async () => {
  const m = await import('../renderer/src/lib/skinmap.mjs');
  // 16x32 "units" figure at 10px per unit on white, with margins.
  const U = 10; const W = 260; const H = 400; const ox = 50; const oy = 40;
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) };
  const fill = (u, v, w, h, c) => { for (let y = oy + v * U; y < oy + (v + h) * U; y++) for (let x = ox + u * U; x < ox + (u + w) * U; x++) { const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; } };
  fill(4, 0, 8, 8, [200, 150, 120]); fill(4, 0, 8, 2, [60, 40, 20]); // head + hair
  fill(4, 8, 8, 12, [30, 90, 200]); // shirt
  fill(0, 8, 4, 12, [200, 150, 120]); fill(12, 8, 4, 12, [200, 150, 120]); // arms
  fill(4, 20, 8, 12, [40, 40, 60]); // trousers
  const skin = m.mapCharacterToSkin(img, { variant: 'classic' });
  assert.equal(skin.width, 64);
  assert.equal(skin.height, 64);
  assert.ok(m.isValidSkin(skin));
  const near = (a, b) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) < 12);
  assert.ok(near(m.getPx(skin, 12, 14), [200, 150, 120]), 'face');
  assert.ok(near(m.getPx(skin, 12, 8), [60, 40, 20]), 'hair row');
  assert.ok(near(m.getPx(skin, 24, 26), [30, 90, 200]), 'shirt front');
  assert.ok(near(m.getPx(skin, 6, 26), [40, 40, 60]), 'right leg front');
  assert.ok(near(m.getPx(skin, 46, 26), [200, 150, 120]), 'right arm front');
  assert.equal(m.getPx(skin, 40, 10)[3], 0, 'hat layer left clear');
  const slim = m.mapCharacterToSkin(img, { variant: 'slim' });
  assert.ok(m.isValidSkin(slim, 'slim'));
  const empty = { width: 50, height: 50, data: new Uint8ClampedArray(50 * 50 * 4).fill(255) };
  assert.throws(() => m.mapCharacterToSkin(empty), /character/);
});

test('skin map: normalize fixes alpha rules, legacy and atlas inputs', async () => {
  const m = await import('../renderer/src/lib/skinmap.mjs');
  const s = m.blank();
  m.setPx(s, 9, 9, [10, 20, 30, 255]);
  m.setPx(s, 40, 10, [1, 2, 3, 90]); // half-transparent hat pixel
  assert.equal(m.isValidSkin(s), false);
  const n = m.normalizeSkin(s);
  assert.ok(m.isValidSkin(n));
  assert.equal(m.getPx(n, 40, 10)[3], 0);
  assert.deepEqual(m.getPx(n, 8, 8), [10, 20, 30, 255]); // gap filled with the face average
  const legacy = m.blank(64, 32);
  m.setPx(legacy, 4, 20, [255, 0, 0, 255]);
  const up = m.upgradeLegacy(legacy);
  assert.equal(up.height, 64);
  assert.deepEqual(m.getPx(up, 23, 52), [255, 0, 0, 255]); // mirrored to the left leg front
  const big = { width: 512, height: 512, data: new Uint8ClampedArray(512 * 512 * 4).fill(200) };
  assert.ok(m.isValidSkin(m.mapAtlasToSkin(big)));
});

test('cosmetics: catalog capes are valid 64x32 textures', async () => {
  const c = await import('../renderer/src/lib/cosmetics.mjs');
  for (const cape of c.CAPES) {
    const t = c.capeTexture(cape.id);
    assert.equal(t.width, 64); assert.equal(t.height, 32);
    assert.equal(t.data[(5 * 64 + 5) * 4 + 3], 255);
  }
  assert.throws(() => c.capeTexture('nope'), /Unknown cape/);
});

test('cosmetics: state sanitizes, cape texture and instance sync (local only)', async () => {
  const store = new CosmeticsStore(tmp('cos-'));
  assert.deepEqual(sanitizeState({ equipped: { cape: '../x', bogus: 'y' } }).equipped, { cape: null, hat: null, wings: null });
  await store.save({ equipped: { cape: 'saturn', hat: 'halo' } });
  await store.setCapeTexture(png(64, 32));
  await assert.rejects(store.setCapeTexture(png(10, 10)), /64×32/);
  const inst = tmp('inst-');
  let conf = await syncInstance(inst, store, {});
  assert.equal(conf.cape.enabled, true);
  assert.equal(conf.visibility, 'local');
  assert.ok(fs.existsSync(path.join(inst, 'config', 'glass-companion-cape.png')));
  await store.save({ ...(await store.get()), localSkin: true });
  conf = await syncInstance(inst, store, { skin: { png: png(64, 64), variant: 'slim' } });
  assert.deepEqual(conf.skin, { enabled: true, file: 'glass-companion-skin.png', slim: true });
  const custom = await store.addCustomCape(png(64, 32), 'Mine');
  await store.save({ ...(await store.get()), equipped: { cape: custom.id } });
  await store.removeCustomCape(custom.id);
  assert.equal((await store.get()).equipped.cape, null);
  conf = await syncInstance(inst, store, {});
  assert.equal(conf.cape.enabled, false);
  assert.ok(!fs.existsSync(path.join(inst, 'config', 'glass-companion-cape.png')));
});

test('hosting: e4mc address parsing and host checks', () => {
  assert.equal(hosting.parseJoinAddress('[Netty Epoll Server IO #1/INFO] (e4mc) Domain assigned: brave-otter.br.e4mc.link'), 'brave-otter.br.e4mc.link');
  assert.equal(hosting.parseJoinAddress('[CHAT] Local game hosted on domain [calm-fox.us.e4mc.link]'), 'calm-fox.us.e4mc.link');
  assert.equal(hosting.parseJoinAddress('Loading 42 mods'), null);
  assert.equal(hosting.parseHostStopped('[Server thread/INFO]: Stopping server'), true);
  assert.equal(hosting.canHost({ type: 'client', loader: 'fabric' }).kind, 'e4mc');
  assert.equal(hosting.canHost({ type: 'client', loader: 'vanilla' }).ok, false);
  assert.equal(hosting.canHost({ type: 'server', loader: 'paper' }).kind, 'server');
  assert.equal(hosting.hasMod({ mods: [{ projectId: 'qANg5Jrr', file: 'e4mc.jar' }] }, hosting.E4MC.projectId), true);
  assert.equal(hosting.hasMod({ mods: [{ file: 'voicechat-fabric-2.6.27+26.3.jar' }] }, hosting.VOICE_CHAT.projectId, 'voicechat'), true);
  const lan = hosting.lanAddresses({ en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }], lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] });
  assert.deepEqual(lan, [{ name: 'en0', address: '192.168.1.20' }]);
});

test('mic: status descriptions and first-launch prompt rule', () => {
  assert.equal(mic.describe('granted', 'darwin').label, 'Allowed');
  assert.equal(mic.describe('not-determined', 'darwin').canPrompt, true);
  assert.equal(mic.describe('denied', 'darwin').tone, 'red');
  assert.equal(mic.describe('whatever', 'darwin').status, 'unknown');
  assert.equal(mic.describe('denied', 'linux').status, 'granted');
  assert.equal(mic.shouldPromptOnLaunch({ micPrompted: false }, 'not-determined', 'darwin'), true);
  assert.equal(mic.shouldPromptOnLaunch({ micPrompted: true }, 'not-determined', 'darwin'), false);
  assert.equal(mic.shouldPromptOnLaunch({}, 'granted', 'darwin'), false);
});

test('mod rename: display name, safe file rename, undo and reset', async () => {
  const dir = tmp('mods-');
  fs.mkdirSync(path.join(dir, 'mods'));
  fs.writeFileSync(path.join(dir, 'mods', 'sodium-0.8.jar'), 'a');
  fs.writeFileSync(path.join(dir, 'mods', 'other.jar'), 'b');
  const other = { title: 'Other', file: 'other.jar', folder: 'mods', enabled: true };
  let mod = { title: 'Sodium', file: 'sodium-0.8.jar', folder: 'mods', enabled: true };
  assert.equal(safeFileName('My Sodium', 'x.jar'), 'My Sodium.jar');
  assert.equal(safeFileName('fast.jar.disabled', 'x.jar'), 'fast.jar');
  assert.throws(() => safeFileName('../evil', 'x.jar'), /without slashes/);
  assert.throws(() => safeFileName('.hidden', 'x.jar'), /without slashes/);
  let r = await renameMod(dir, mod, { name: '  Fast   Renderer ', fileName: 'fast-renderer' }, [mod, other]);
  mod = r.mod;
  assert.equal(mod.displayName, 'Fast Renderer');
  assert.equal(mod.file, 'fast-renderer.jar');
  assert.equal(mod.originalFile, 'sodium-0.8.jar');
  assert.ok(fs.existsSync(path.join(dir, 'mods', 'fast-renderer.jar')));
  await assert.rejects(renameMod(dir, mod, { fileName: 'other' }, [mod, other]), /already uses/);
  // Undo puts both back.
  r = await renameMod(dir, mod, r.undo, [mod, other]);
  assert.equal(r.mod.displayName, undefined);
  assert.equal(r.mod.file, 'sodium-0.8.jar');
  assert.equal(r.mod.originalFile, undefined);
  // Disabled mods keep their .disabled suffix; reset restores the original file.
  mod = { ...r.mod, enabled: false };
  fs.renameSync(path.join(dir, 'mods', 'sodium-0.8.jar'), path.join(dir, 'mods', 'sodium-0.8.jar.disabled'));
  mod = (await renameMod(dir, mod, { name: 'S', fileName: 's2.jar' }, [mod])).mod;
  assert.ok(fs.existsSync(path.join(dir, 'mods', 's2.jar.disabled')));
  const reset = await resetMod(dir, mod, [mod]);
  assert.equal(reset.mod.file, 'sodium-0.8.jar');
  assert.equal(reset.mod.displayName, undefined);
  assert.ok(fs.existsSync(path.join(dir, 'mods', 'sodium-0.8.jar.disabled')));
  assert.deepEqual(reset.undo, { name: 'S', fileName: 'sodium-0.8.jar'.replace('sodium-0.8', 's2') });
});

test('service: rename persists in instance.json; hosting status; new secrets stay hidden', async () => {
  const svc = await new LauncherService({ dataDir: tmp('svc-'), cipher: plainCipher, resourcesDir: tmp('res-') }).init();
  const meta = await instances.create(svc.dirs, { name: 'Host Me', loader: 'fabric' });
  fs.writeFileSync(path.join(svc.instanceDir(meta.id), 'mods', 'e4mc-fabric-6.2.3-modern.jar'), 'x');
  await instances.update(svc.dirs, meta.id, { mods: [{ source: 'modrinth', projectId: 'qANg5Jrr', title: 'e4mc', file: 'e4mc-fabric-6.2.3-modern.jar', folder: 'mods', enabled: true }] });
  const { mod, undo } = await svc.renameMod(meta.id, 'e4mc-fabric-6.2.3-modern.jar', { name: 'World Sharing' });
  assert.equal(mod.displayName, 'World Sharing');
  assert.deepEqual(undo, { name: null });
  assert.equal((await instances.get(svc.dirs, meta.id)).mods[0].displayName, 'World Sharing');
  await svc.resetModName(meta.id, 'e4mc-fabric-6.2.3-modern.jar');
  assert.equal((await instances.get(svc.dirs, meta.id)).mods[0].displayName, undefined);
  const st = await svc.hostStatus(meta.id);
  assert.equal(st.e4mcInstalled, true);
  assert.equal(st.kind, 'e4mc');
  assert.equal(st.address, null);
  const events = [];
  svc.emit = (ch, d) => events.push([ch, d]);
  svc.watchHostLine(meta.id, 'Domain assigned: neat-cat.us.e4mc.link');
  assert.equal((await svc.hostStatus(meta.id)).address, 'neat-cat.us.e4mc.link');
  assert.deepEqual(events[0], ['host:update', { id: meta.id, address: 'neat-cat.us.e4mc.link', state: 'hosting' }]);
  await svc.setSecret('openaiApiKey', 'sk-test-123456789');
  const status = await svc.secretStatus();
  assert.equal(status.openaiApiKey, true);
  assert.ok(!JSON.stringify(status).includes('sk-test'));
  await assert.rejects(svc.applySkin('abcdefabcdef'), (e) => e.code === 'SIGNED_OUT');
  assert.deepEqual(await svc.accountProfile(), { signedIn: false, skins: [], capes: [] });
  const providers = svc.skinAiProviders();
  assert.equal(providers.grok.model, 'grok-imagine-image-2.0');
  assert.ok(!JSON.stringify(providers).includes('sk-'));
});

test('ai skins: prompts, request bodies, missing key and error mapping', async () => {
  assert.match(ai.buildPrompt('a knight', 'character'), /facing the viewer.*knight/s);
  assert.match(ai.buildPrompt('a knight', 'texture'), /64x64 UV atlas/);
  assert.throws(() => ai.buildPrompt('  '), /Describe/);
  assert.deepEqual(ai.requestBody('grok', { prompt: 'p', mode: 'character' }), { model: 'grok-imagine-image-2.0', prompt: 'p', n: 1, response_format: 'b64_json', aspect_ratio: '2:3' });
  assert.equal(ai.requestBody('openai', { prompt: 'p', mode: 'texture' }).background, 'transparent');
  await assert.rejects(ai.generate({ provider: 'grok', apiKey: null, prompt: 'x' }), (e) => e.code === 'NO_KEY');
  assert.equal(ai.friendlyError('grok', 401, {}).code, 'BAD_KEY');
  assert.equal(ai.friendlyError('openai', 429, { error: { message: 'You exceeded your current quota' } }).code, 'NO_CREDITS');
  assert.equal(ai.friendlyError('grok', 400, { error: 'blocked by safety system' }).code, 'BLOCKED');
  const calls = [];
  net.setFetch(async (url, opts) => { calls.push([url, JSON.parse(opts.body), opts.headers.Authorization]); return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: png(4, 4).toString('base64') }] }) }; });
  try {
    const r = await ai.generate({ provider: 'openai', apiKey: 'sk-abc', prompt: 'robot', mode: 'character' });
    assert.equal(r.mime, 'image/png');
    assert.equal(calls[0][0], 'https://api.openai.com/v1/images/generations');
    assert.equal(calls[0][1].model, 'gpt-image-1');
    assert.equal(calls[0][2], 'Bearer sk-abc');
  } finally { net.setFetch((...a) => globalThis.fetch(...a)); }
});

test('migration: moves Glass Launcher data into Saturn Client once', () => {
  const appData = tmp('appdata-');
  const old = path.join(appData, 'Glass Launcher');
  fs.mkdirSync(path.join(old, 'instances', 'a'), { recursive: true });
  fs.writeFileSync(path.join(old, 'settings.json'), '{"accent":"#ff8fb1"}');
  fs.writeFileSync(path.join(old, 'secrets.bin'), 'enc');
  const neu = path.join(appData, 'Saturn Client');
  const r = migrateDataDir(appData, neu);
  assert.equal(r.migrated, true);
  assert.ok(fs.existsSync(path.join(neu, 'instances', 'a')));
  assert.ok(fs.existsSync(path.join(neu, 'secrets-legacy.bin')));
  assert.ok(!fs.existsSync(path.join(neu, 'secrets.bin')));
  assert.ok(fs.existsSync(path.join(old, 'MOVED-TO-SATURN-CLIENT.txt')));
  assert.equal(migrateDataDir(appData, neu).migrated, false);
  assert.equal(migrateDataDir(tmp('empty-'), path.join(appData, 'X')).migrated, false);
});

test('settings: 0.1.3 defaults (sidebar, app icon, mic, AI skins)', () => {
  const d = settingsStore.DEFAULTS;
  assert.equal(d.sidebarCollapsed, false);
  assert.equal(d.sidebarMode, 'icons');
  assert.equal(d.appIcon, 'saturn');
  assert.equal(d.micPrompted, false);
  assert.equal(d.skinAiProvider, 'grok');
});

test('icons: icns writer and Saturn branding in package.json', async () => {
  const { buildIcns, readIcns } = await import('../scripts/icns.mjs');
  const icns = buildIcns({ 16: png(16, 16), 1024: png(4, 4) });
  const entries = readIcns(icns);
  assert.deepEqual(entries.map((e) => e[0]), ['icp4', 'ic10']);
  assert.equal(icns.readUInt32BE(4), icns.length);
  const pkg = require('../package.json');
  assert.equal(pkg.productName, 'Saturn Client');
  assert.equal(pkg.build.appId, 'com.glchedmc.saturnclient');
  assert.match(pkg.build.mac.extendInfo.NSMicrophoneUsageDescription, /voice chat/i);
  assert.equal(pkg.build.mac.icon, 'build/icon.icns');
  const ent = fs.readFileSync(path.join(__dirname, '..', 'build', 'entitlements.mac.plist'), 'utf8');
  assert.match(ent, /com\.apple\.security\.device\.audio-input/);
  const files = JSON.stringify(pkg.build.files) + JSON.stringify(pkg.build.extraResources);
  assert.ok(!/secrets|curseforge\.key/.test(files));
});
