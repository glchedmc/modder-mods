'use strict';
// The launcher backend, independent of Electron so it can be unit-tested.
// main.js wires each method to an IPC channel.
const fsp = require('fs/promises');
const path = require('path');
const { layout } = require('./paths');
const { currentPlatform } = require('./platform');
const { SecretStore } = require('./secrets');
const settingsStore = require('./settings');
const instances = require('./instances');
const mojang = require('./mojang');
const loaders = require('./loaders');
const java = require('./java');
const launch = require('./launch');
const modrinth = require('./mods/modrinth');
const curseforge = require('./mods/curseforge');
const installer = require('./mods/install');
const companion = require('./companion');
const msa = require('./auth/msa');
const { PortJob } = require('./grok/porter');
const { redact, exists } = require('./util');
const defaults = require('./defaults');
const schematics = require('./schematics');
const backgrounds = require('./backgrounds');
const { SkinLibrary } = require('./skins/library');
const skinApi = require('./skins/mojang');
const skinAi = require('./skins/ai');
const { CosmeticsStore, syncInstance: syncCosmetics, IN_GAME } = require('./cosmetics');
const hosting = require('./hosting');
const upnp = require('./upnp');
const tailscale = require('./tailscale');
const { lookupSkin } = require('./skins/lookup');
const { renameMod: renameModFile, resetMod: resetModFile } = require('./mods/rename');

const SECRET_NAMES = ['xaiApiKey', 'curseforgeApiKey', 'openaiApiKey', 'duckdnsToken'];
const FABRIC_API_PROJECT = 'P7dR8mSH';

class LauncherService {
  constructor({ dataDir, cipher, resourcesDir, emit = () => {}, platform = currentPlatform(), extraJavaDirs = [], secretStorage = null }) {
    this.secretStorage = secretStorage || { mode: 'keychain', label: 'macOS Keychain' };
    this.dirs = layout(dataDir);
    this.secrets = new SecretStore(this.dirs.secrets, cipher);
    this.resourcesDir = resourcesDir;
    this.platform = platform;
    this.extraJavaDirs = extraJavaDirs;
    this.jobs = new Map();
    this.running = new Map();
    this.authAbort = null;
    this.skins = new SkinLibrary(this.dirs.skins);
    this.cosmetics = new CosmeticsStore(this.dirs.cosmetics);
    this.hosts = new Map(); // instanceId -> {address, since}
    this.lanPorts = new Map(); // instanceId -> Open to LAN port seen in the log
    this.p2p = null; // P2PManager, attached by the Electron main process
    this.runningMeta = new Map(); // instanceId -> {name, mcVersion, loader} while the game runs
    this.social = null; // SocialManager (Friends & chat)
    this.socialCache = { displayName: '', mcName: null };
    const rawEmit = emit;
    this.emit = (ch, data) => {
      rawEmit(ch, data);
      if (this.social && (ch === 'launch:state' || ch === 'host:update')) setTimeout(() => this.social && this.social.refreshPresence(), 50);
      if (ch === 'auth:update' && data && data.state === 'done') { this.socialCache.mcName = data.name || null; if (this.social) this.social.profileChanged().catch(() => {}); }
    };
    this.net = { publicIp: null, checkedAt: 0, upnp: null };
  }

  /** Called by electron/main.js once the WebRTC worker is up. */
  attachP2P(manager) { this.p2p = manager; return manager; }

  async init() {
    for (const d of ['versions', 'libraries', 'assets', 'instances', 'runtimes', 'cache', 'tools', 'ports', 'backgrounds', 'skins', 'cosmetics']) await fsp.mkdir(this.dirs[d], { recursive: true });
    return this;
  }

  // ---------- settings & secrets ----------
  getSettings() { return settingsStore.load(this.dirs.settings); }
  async setSettings(patch) { const cur = await this.getSettings(); return settingsStore.save(this.dirs.settings, { ...cur, ...patch }); }
  async secretStatus() {
    const status = await this.secrets.status(SECRET_NAMES);
    const custom = Boolean(status.curseforgeApiKey);
    const builtin = defaults.hasBuiltinCurseforgeKey;
    return {
      ...status,
      curseforgeApiKey: custom || builtin,
      curseforgeApiKeyCustom: custom,
      curseforgeApiKeyBuiltin: builtin,
    };
  }
  async setSecret(name, value) {
    if (!SECRET_NAMES.includes(name)) throw new Error(`Unknown secret ${name}`);
    await this.secrets.set(name, value);
    return this.secretStatus();
  }

  /** User-entered CurseForge key, otherwise the built-in default. */
  async curseforgeKey() {
    return (await this.secrets.get('curseforgeApiKey')) || defaults.curseforgeApiKey() || null;
  }

  async msaClientId() {
    const s = await this.getSettings();
    return s.msaClientId || defaults.msaClientId || '';
  }

  // ---------- backgrounds ----------
  importBackground(filePath, originalName) {
    return backgrounds.importFile(this.dirs, filePath, { originalName });
  }

  removeBackgroundFile(file) {
    return backgrounds.removeFile(this.dirs, file);
  }

  backgroundUrl(file) {
    if (!file) return null;
    backgrounds.safePath(this.dirs, file);
    return backgrounds.mediaUrl(file);
  }

  // ---------- versions ----------
  async listVersions({ snapshots } = {}) { return mojang.listVersions({ snapshots }); }
  loaderVersions(loader, mc) { return loaders.listLoaderVersions(loader, mc); }

  // ---------- java ----------
  async javaFor(major) {
    const s = await this.getSettings();
    return java.ensureJava(this.dirs, major, this.platform, { override: s.javaPath || undefined, extraDirs: [...this.extraJavaDirs, ...(await java.systemJavaDirs(this.platform))], onStatus: (t) => this.emit('launch:progress', { phase: t, done: 0, total: 1 }) });
  }
  javaHomeOf(bin) { return path.dirname(path.dirname(bin)); }

  // ---------- instances ----------
  listInstances() { return instances.list(this.dirs); }

  async createInstance(partial) {
    const s = await this.getSettings();
    const meta = await instances.create(this.dirs, { memoryMb: s.memoryMb, ...partial });
    const dir = instances.instanceDir(this.dirs, meta.id);
    try {
      if (meta.type === 'server') {
        const { build } = await loaders.installServer(meta.loader, dir, meta.mcVersion, meta.loaderVersion);
        meta.loaderVersion = build;
        if (partial.eula) await fsp.writeFile(path.join(dir, 'eula.txt'), `# Accepted in Saturn Client ${new Date().toISOString()}\neula=true\n`);
        if (meta.loader === 'fabric-server') {
          const plan = await installer.planModrinth(meta, FABRIC_API_PROJECT).catch(() => ({ plan: [] }));
          if (plan.plan.length) meta.mods.push(...(await installer.applyPlan(dir, meta, 'modrinth', plan.plan, { titles: { [FABRIC_API_PROJECT]: 'Fabric API' } })));
        }
      } else {
        const needJava = meta.loader === 'forge' || meta.loader === 'neoforge';
        const javaPath = needJava ? await this.javaFor((await mojang.getVanillaVersion(this.dirs, meta.mcVersion)).javaVersion.majorVersion) : null;
        const r = await loaders.installClientLoader(meta.loader, this.dirs, meta.mcVersion, meta.loaderVersion, { java: javaPath, onLog: (l) => this.emit('launch:log', { id: meta.id, line: l }) });
        meta.versionId = r.versionId; meta.loaderVersion = r.loaderVersion;
        if (meta.loader === 'fabric' || meta.loader === 'quilt') {
          // Fabric API is needed by most mods and by the companion.
          const plan = await installer.planModrinth(meta, FABRIC_API_PROJECT).catch(() => ({ plan: [] }));
          if (plan.plan.length) meta.mods.push(...(await installer.applyPlan(dir, meta, 'modrinth', plan.plan, { titles: { [FABRIC_API_PROJECT]: 'Fabric API' } })));
        }
      }
    } catch (e) {
      await instances.save(this.dirs, meta);
      throw new Error(`Created ${meta.name}, but setup failed: ${e.message}`);
    }
    return instances.save(this.dirs, meta);
  }

  updateInstance(id, patch) { return instances.update(this.dirs, id, patch); }
  removeInstance(id) { return instances.remove(this.dirs, id); }
  instanceDir(id) { return instances.instanceDir(this.dirs, id); }

  // ---------- accounts ----------
  async listAccounts() {
    const raw = await this.secrets.get('accounts');
    const list = raw ? JSON.parse(raw) : [];
    return list.map((a) => ({ name: a.name, uuid: a.uuid, type: a.type }));
  }

  async startSignIn() {
    const clientId = await this.msaClientId();
    if (!clientId) return { needsClientId: true };
    const device = await msa.startDeviceCode(clientId);
    if (this.authAbort) this.authAbort.abort();
    this.authAbort = new AbortController();
    (async () => {
      try {
        const token = await msa.pollToken(clientId, device, { signal: this.authAbort.signal });
        this.emit('auth:update', { state: 'progress', step: 'Xbox Live' });
        const account = await msa.completeLogin(token);
        await this.secrets.set('accounts', JSON.stringify([account]));
        this.emit('auth:update', { state: 'done', name: account.name });
      } catch (e) {
        this.emit('auth:update', { state: 'error', error: e.message, code: e.code });
      }
    })();
    return { userCode: device.user_code, verificationUri: device.verification_uri, expiresIn: device.expires_in };
  }

  async signOut() { await this.secrets.set('accounts', ''); }

  /** Returns a fresh account for launching (refreshing tokens when expired). */
  async launchAccount() {
    const raw = await this.secrets.get('accounts');
    const list = raw ? JSON.parse(raw) : [];
    if (!list.length) return { type: 'demo', name: 'Player', uuid: '00000000000000000000000000000000', accessToken: '0' };
    let acc = list[0];
    if (Date.now() > acc.expiresAt - 5 * 60 * 1000) {
      const clientId = await this.msaClientId();
      const t = await msa.refreshMsa(clientId, acc.refreshToken);
      acc = await msa.completeLogin(t);
      await this.secrets.set('accounts', JSON.stringify([acc]));
    }
    return acc;
  }

  // ---------- launching ----------
  async launch(id, opts = {}) {
    if (this.running.has(id)) throw new Error('Already running');
    const meta = await instances.get(this.dirs, id);
    const dir = this.instanceDir(id);
    const progress = (p) => this.emit('launch:progress', { id, ...p });
    if (meta.type === 'server') return this.startServer(meta, dir);
    const vanilla = await mojang.getVanillaVersion(this.dirs, meta.mcVersion);
    progress({ phase: `Java ${vanilla.javaVersion.majorVersion}`, done: 0, total: 1 });
    const javaPath = await this.javaFor(vanilla.javaVersion.majorVersion);
    if (!meta.versionId) {
      const r = await loaders.installClientLoader(meta.loader, this.dirs, meta.mcVersion, meta.loaderVersion, { java: javaPath });
      meta.versionId = r.versionId; meta.loaderVersion = r.loaderVersion;
    }
    await this.syncCompanion(meta, dir);
    await this.syncCosmeticsTo(meta, dir).catch(() => {});
    const account = await this.launchAccount();
    const { spec } = await launch.prepare({ dirs: this.dirs, instance: meta, instanceDir: dir, account, platform: this.platform, javaPath, progress });
    // Friends → Join: drop straight into the friend's world (Quick Play, 1.20+).
    if (opts && opts.server && /^[\w.-]+(:\d{1,5})?$/.test(String(opts.server))) spec.args.push('--quickPlayMultiplayer', String(opts.server));
    progress({ phase: 'Starting', done: 1, total: 1 });
    this.emit('launch:log', { id, line: redact(launch.redactedCommand(spec).join(' ')) });
    const started = Date.now();
    const child = launch.start(spec, {
      onLine: (line) => { this.emit('launch:log', { id, line: redact(line) }); this.watchHostLine(id, line); },
      onExit: async (code) => {
        this.running.delete(id);
        this.runningMeta.delete(id);
        this.lanPorts.delete(id);
        if (this.hosts.has(id)) { this.hosts.delete(id); this.emit('host:update', { id, address: null, state: 'stopped' }); }
        const m = await instances.get(this.dirs, id);
        await instances.save(this.dirs, { ...m, playTimeSec: (m.playTimeSec || 0) + Math.round((Date.now() - started) / 1000) });
        this.emit('launch:state', { id, state: 'exited', code, error: code ? `Minecraft exited with code ${code}. See the Logs tab.` : null });
      },
    });
    this.running.set(id, child);
    this.runningMeta.set(id, { name: meta.name, mcVersion: meta.mcVersion, loader: meta.loader });
    await instances.save(this.dirs, { ...meta, lastPlayed: new Date().toISOString() });
    this.emit('launch:state', { id, state: 'running' });
    return { pid: child.pid };
  }

  async startServer(meta, dir) {
    const javaPath = await this.javaFor(25);
    if (!(await exists(path.join(dir, 'eula.txt')))) throw new Error('Accept the Minecraft EULA for this server first (Library → server → Settings).');
    const spec = { java: javaPath, args: [`-Xms${Math.min(2048, meta.memoryMb)}M`, `-Xmx${meta.memoryMb}M`, '-jar', 'server.jar', '--nogui'], cwd: dir };
    const child = launch.start(spec, {
      onLine: (line) => this.emit('launch:log', { id: meta.id, line }),
      onExit: (code) => { this.running.delete(meta.id); this.emit('launch:state', { id: meta.id, state: 'exited', code }); },
    });
    this.running.set(meta.id, child);
    this.emit('launch:state', { id: meta.id, state: 'running' });
    return { pid: child.pid };
  }

  async syncCompanion(meta, dir) {
    if (!companion.supports(meta)) return;
    const s = await this.getSettings();
    const jar = await this.companionJar();
    if (!jar) return;
    const entry = await companion.install(dir, meta, jar, s.companion);
    if (entry && !meta.mods.some((m) => m.source === 'companion' && m.file === entry.file)) {
      meta.mods = [...meta.mods.filter((m) => m.source !== 'companion'), entry];
      await instances.save(this.dirs, meta);
    }
  }

  async companionJar() {
    const dir = path.join(this.resourcesDir, 'companion');
    try {
      const f = (await fsp.readdir(dir)).find((x) => x.startsWith('glass-companion-') && x.endsWith('.jar'));
      return f ? path.join(dir, f) : null;
    } catch { return null; }
  }

  async getCompanion(id) {
    if (id) return companion.readConfig(this.instanceDir(id));
    return (await this.getSettings()).companion;
  }

  async setCompanion(id, cfg) {
    const clean = companion.sanitize(cfg);
    if (id) return companion.writeConfig(this.instanceDir(id), clean);
    await this.setSettings({ companion: clean });
    return clean;
  }

  // ---------- mods ----------
  async searchMods(params) {
    if (params.source === 'curseforge') return curseforge.search(await this.curseforgeKey(), params);
    return modrinth.search(params);
  }

  async installMod(instanceId, source, projectId, title, projectType = 'mod') {
    const meta = await instances.get(this.dirs, instanceId);
    const dir = this.instanceDir(instanceId);
    let result;
    if (source === 'curseforge') result = await installer.planCurseForge(meta, projectId, await this.curseforgeKey());
    else result = await installer.planModrinth(meta, projectId);
    if (!result.plan.length && result.missing.length) throw new Error(`${title} has no build for ${meta.mcVersion} on ${meta.loader}. Try Upgrade to ${meta.mcVersion}.`);
    const added = await installer.applyPlan(dir, meta, source, result.plan, { projectType, titles: { [projectId]: title } });
    meta.mods = [...meta.mods.filter((m) => !added.some((a) => a.file === m.file)), ...added];
    await instances.save(this.dirs, meta);
    return { added, missing: result.missing };
  }

  async removeMod(instanceId, file) {
    const meta = await instances.get(this.dirs, instanceId);
    const mod = meta.mods.find((m) => m.file === file);
    if (mod) await installer.removeMod(this.instanceDir(instanceId), mod);
    meta.mods = meta.mods.filter((m) => m.file !== file);
    await instances.save(this.dirs, meta);
  }

  async toggleMod(instanceId, file, enabled) {
    const meta = await instances.get(this.dirs, instanceId);
    const i = meta.mods.findIndex((m) => m.file === file);
    if (i === -1) return;
    meta.mods[i] = await installer.setEnabled(this.instanceDir(instanceId), meta.mods[i], enabled);
    await instances.save(this.dirs, meta);
  }

  async renameMod(instanceId, file, opts = {}) {
    if (this.running.has(instanceId) && opts.fileName) throw new Error('Close the game before renaming mod files.');
    const meta = await instances.get(this.dirs, instanceId);
    const i = meta.mods.findIndex((m) => m.file === file);
    if (i === -1) throw new Error('Mod not found');
    const { mod, undo } = await renameModFile(this.instanceDir(instanceId), meta.mods[i], opts, meta.mods);
    meta.mods[i] = mod;
    await instances.save(this.dirs, meta);
    return { mod, undo };
  }

  async resetModName(instanceId, file) {
    if (this.running.has(instanceId)) throw new Error('Close the game before resetting mod names.');
    const meta = await instances.get(this.dirs, instanceId);
    const i = meta.mods.findIndex((m) => m.file === file);
    if (i === -1) throw new Error('Mod not found');
    const { mod, undo } = await resetModFile(this.instanceDir(instanceId), meta.mods[i], meta.mods);
    meta.mods[i] = mod;
    await instances.save(this.dirs, meta);
    return { mod, undo };
  }

  async checkMods(instanceId) {
    const meta = await instances.get(this.dirs, instanceId);
    return installer.checkCompatibility(this.instanceDir(instanceId), meta);
  }

  // ---------- schematics ----------
  async listSchematics(instanceId) {
    const meta = await instances.get(this.dirs, instanceId);
    const dir = this.instanceDir(instanceId);
    return {
      files: await schematics.list(dir),
      dest: path.relative(dir, schematics.defaultDestDir(dir, { server: meta.type === 'server' })),
      hasLitematica: schematics.hasLitematica(meta),
      suggestLitematica: (meta.loader === 'fabric' || meta.loader === 'quilt') && meta.type !== 'server' && !schematics.hasLitematica(meta),
    };
  }

  async addSchematics(instanceId, paths) {
    const meta = await instances.get(this.dirs, instanceId);
    const added = await schematics.addFiles(this.instanceDir(instanceId), paths, { server: meta.type === 'server' });
    return { added, ...(await this.listSchematics(instanceId)) };
  }

  async removeSchematic(instanceId, rel) {
    await instances.get(this.dirs, instanceId);
    await schematics.remove(this.instanceDir(instanceId), rel);
    return this.listSchematics(instanceId);
  }

  searchSchematics(query, opts) { return schematics.search(query, opts); }

  async downloadSchematic(instanceId, file) {
    const meta = await instances.get(this.dirs, instanceId);
    const added = await schematics.downloadToInstance(this.instanceDir(instanceId), {
      url: file.url, fileName: file.name, server: meta.type === 'server',
    });
    return { added, ...(await this.listSchematics(instanceId)) };
  }

  // ---------- skins ----------
  listSkins() { return this.skins.list(); }
  addSkin(entry) { return this.skins.add(entry); }
  updateSkin(id, patch) { return this.skins.update(id, patch); }
  removeSkin(id) { return this.skins.remove(id); }
  selectSkin(id) { return this.skins.select(id); }

  async signedInAccount() {
    const raw = await this.secrets.get('accounts');
    const list = raw ? JSON.parse(raw) : [];
    if (!list.length || list[0].type !== 'msa') {
      const e = new Error('Sign in with Microsoft to change your skin on Minecraft servers. Microsoft sign-in is waiting on Mojang approval.');
      e.code = 'SIGNED_OUT'; throw e;
    }
    return this.launchAccount();
  }

  async accountProfile() {
    const raw = await this.secrets.get('accounts');
    if (!raw || !JSON.parse(raw).length) return { signedIn: false, skins: [], capes: [] };
    const acc = await this.signedInAccount();
    const p = await skinApi.profile(acc.accessToken);
    return { signedIn: true, name: p.name, skins: p.skins || [], capes: p.capes || [] };
  }

  async applySkin(id) {
    const acc = await this.signedInAccount();
    const skin = await this.skins.get(id);
    await skinApi.uploadSkin(acc.accessToken, skin.png, skin.variant);
    return { applied: true, name: skin.name };
  }

  async setAccountCape(capeId) {
    const acc = await this.signedInAccount();
    await skinApi.showCape(acc.accessToken, capeId || null);
    return this.accountProfile();
  }

  skinAiProviders() {
    return Object.fromEntries(Object.entries(skinAi.PROVIDERS).map(([k, v]) => [k, { label: v.label, model: v.model, secret: v.secret, keyUrl: v.keyUrl }]));
  }

  async generateSkinImage({ provider = 'grok', prompt, mode = 'character' } = {}) {
    const p = skinAi.PROVIDERS[provider];
    if (!p) throw new Error('Unknown provider');
    const s = await this.getSettings();
    const apiKey = await this.secrets.get(p.secret);
    const model = provider === 'grok' ? s.skinAiGrokModel : s.skinAiOpenaiModel;
    return skinAi.generate({ provider, apiKey, prompt, mode, model });
  }

  // ---------- cosmetics ----------
  async getCosmetics() {
    return { ...(await this.cosmetics.get()), customUrls: await this.cosmetics.customCapeUrls(), inGame: IN_GAME };
  }

  async setCosmetics(patch = {}) {
    const cur = await this.cosmetics.get();
    const next = { ...cur, ...patch, equipped: { ...cur.equipped, ...(patch.equipped || {}) } };
    if (patch.capePng !== undefined) await this.cosmetics.setCapeTexture(patch.capePng);
    delete next.capePng;
    await this.cosmetics.save(next);
    return this.getCosmetics();
  }

  async addCustomCape(png, name) { await this.cosmetics.addCustomCape(png, name); return this.getCosmetics(); }
  async removeCustomCape(id) { await this.cosmetics.removeCustomCape(id); return this.getCosmetics(); }

  async syncCosmeticsTo(meta, dir) {
    if (!companion.supports(meta) || !meta.companion) return null;
    const lib = await this.skins.read();
    let skin = null;
    if (lib.selected) { try { skin = await this.skins.get(lib.selected); } catch { skin = null; } }
    return syncCosmetics(dir, this.cosmetics, { skin });
  }

  // ---------- hosting ----------
  watchHostLine(id, line) {
    const port = hosting.parseLanPort(line);
    if (port) { this.lanPorts.set(id, port); this.emit('host:update', { id, lanPort: port, state: 'lan' }); }
    const address = hosting.parseJoinAddress(line);
    if (address) {
      this.hosts.set(id, { address, since: new Date().toISOString() });
      this.emit('host:update', { id, address, state: 'hosting' });
    } else if ((this.hosts.has(id) || this.lanPorts.has(id)) && hosting.parseHostStopped(line)) {
      this.hosts.delete(id);
      this.lanPorts.delete(id);
      this.emit('host:update', { id, address: null, state: 'stopped' });
    }
  }

  /** The port friends' connections are forwarded to on this computer. */
  async hostGamePort(instanceId) {
    try {
      const meta = await instances.get(this.dirs, instanceId);
      if (meta.type === 'server') return hosting.serverPort(this.instanceDir(instanceId));
    } catch { /* fall through */ }
    return this.lanPorts.get(instanceId) || hosting.MC_PORT;
  }

  async hostVoicePort(instanceId) {
    try {
      const meta = await instances.get(this.dirs, instanceId);
      return (await hosting.readVoiceConfig(meta, this.instanceDir(instanceId))).port;
    } catch { return hosting.VOICE_PORT; }
  }

  async hostStatus(instanceId) {
    const meta = await instances.get(this.dirs, instanceId);
    const check = hosting.canHost(meta);
    const dir = this.instanceDir(instanceId);
    const s = await this.getSettings();
    const voice = await hosting.readVoiceConfig(meta, dir);
    const out = {
      ...check,
      provider: hosting.PROVIDERS[s.hostProvider] ? s.hostProvider : hosting.DEFAULT_PROVIDER,
      providers: Object.values(hosting.PROVIDERS),
      running: this.running.has(instanceId),
      address: (this.hosts.get(instanceId) || {}).address || null,
      lanPort: this.lanPorts.get(instanceId) || null,
      e4mcInstalled: hosting.hasMod(meta, hosting.E4MC.projectId, 'e4mc'),
      voiceChatInstalled: hosting.hasMod(meta, hosting.VOICE_CHAT.projectId, 'voicechat'),
      voice: { configured: voice.exists, port: voice.port, voiceHost: voice.voiceHost, file: path.relative(dir, voice.file) },
      lan: hosting.lanAddresses(),
      ddnsName: s.hostDdnsName || '',
      platform: process.platform,
      p2pAvailable: Boolean(this.p2p),
    };
    out.port = meta.type === 'server' ? await hosting.serverPort(dir) : (out.lanPort || hosting.MC_PORT);
    return out;
  }

  /** Public IP (cached for 5 minutes) and the LAN picture. Never throws. */
  async hostNetwork({ refresh = false } = {}) {
    if (refresh || !this.net.publicIp || Date.now() - this.net.checkedAt > 5 * 60 * 1000) {
      try {
        const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
        this.net.publicIp = (await r.json()).ip || null;
      } catch {
        try { this.net.publicIp = (await (await fetch('https://icanhazip.com', { signal: AbortSignal.timeout(5000) })).text()).trim() || null; } catch { this.net.publicIp = null; }
      }
      this.net.checkedAt = Date.now();
    }
    return { publicIp: this.net.publicIp, lan: hosting.lanAddresses(), upnp: this.net.upnp };
  }

  /** Opens TCP (game) + UDP (voice) on the router with UPnP. */
  async upnpMap(instanceId) {
    const mcPort = await this.hostGamePort(instanceId);
    const voicePort = await this.hostVoicePort(instanceId);
    const netInfo = await this.hostNetwork();
    const result = { ok: false, mcPort, voicePort, mappings: [], publicIp: netInfo.publicIp };
    const gw = await upnp.findGateway({ timeout: 2500 });
    if (!gw) {
      result.error = 'No UPnP router found. UPnP may be off; use the router steps below.';
      result.steps = hosting.routerSteps({ localIp: (netInfo.lan[0] || {}).address, mcPort, voicePort });
      this.net.upnp = result;
      return result;
    }
    const gwHost = new URL(gw.location).hostname;
    const localIp = (await upnp.localAddressFor(gwHost)) || (netInfo.lan[0] || {}).address;
    result.gateway = gwHost;
    result.localIp = localIp;
    try { result.routerIp = await gw.externalIp(); } catch { result.routerIp = null; }
    Object.assign(result, hosting.natVerdict({ publicIp: netInfo.publicIp, routerIp: result.routerIp }));
    for (const [port, protocol, what] of [[mcPort, 'TCP', 'Minecraft'], [voicePort, 'UDP', 'Voice chat']]) {
      try {
        await gw.addPortMapping({ externalPort: port, internalPort: port, protocol, internalClient: localIp, description: `Saturn Client ${what}` });
        result.mappings.push({ port, protocol, what, ok: true });
      } catch (e) {
        result.mappings.push({ port, protocol, what, ok: false, error: e.message });
      }
    }
    result.ok = result.mappings.every((m) => m.ok);
    if (!result.ok) result.steps = hosting.routerSteps({ localIp, mcPort, voicePort, gateway: gwHost });
    if (result.cgnat) result.warning = 'Your router does not have your public IP (carrier-grade NAT), so forwarded ports cannot be reached from the internet. Use Direct (free) or Tailscale.';
    this.net.upnp = result;
    return result;
  }

  async upnpUnmap(instanceId) {
    const mcPort = await this.hostGamePort(instanceId);
    const voicePort = await this.hostVoicePort(instanceId);
    const gw = await upnp.findGateway({ timeout: 2500 });
    if (!gw) return { ok: false, error: 'No UPnP router found.' };
    for (const [port, protocol] of [[mcPort, 'TCP'], [voicePort, 'UDP']]) { try { await gw.deletePortMapping({ externalPort: port, protocol }); } catch { /* already gone */ } }
    this.net.upnp = null;
    return { ok: true };
  }

  tailscaleStatus() { return tailscale.status(); }

  /** Saves the optional dynamic DNS name; updates DuckDNS when a token is set. */
  async setDdnsName(name) {
    const clean = hosting.cleanDdnsName(name);
    await this.setSettings({ hostDdnsName: clean });
    return { ddnsName: clean };
  }

  async updateDdns() {
    const s = await this.getSettings();
    const sub = hosting.duckdnsSubdomain(s.hostDdnsName);
    if (!sub) throw new Error('Automatic updates work with name.duckdns.org names. Other services: keep their updater running.');
    const token = await this.secrets.get('duckdnsToken');
    if (!token) { const e = new Error('Add your DuckDNS token first.'); e.code = 'NO_DDNS_TOKEN'; throw e; }
    const r = await fetch(`https://www.duckdns.org/update?domains=${encodeURIComponent(sub)}&token=${encodeURIComponent(token)}&ip=`, { signal: AbortSignal.timeout(8000) });
    const txt = (await r.text()).trim();
    if (txt !== 'OK') throw new Error('DuckDNS rejected the update. Check the name and token.');
    return { ok: true, name: s.hostDdnsName };
  }

  async installHostingMod(instanceId, which = 'e4mc') {
    const m = which === 'voicechat' ? hosting.VOICE_CHAT : hosting.E4MC;
    const r = await this.installMod(instanceId, 'modrinth', m.projectId, m.title);
    return { ...r, status: await this.hostStatus(instanceId) };
  }

  /**
   * One click: installs Simple Voice Chat (26.3 Fabric/Paper build from
   * Modrinth) and writes voice_host for the chosen provider.
   */
  async enableVoiceChat(instanceId, provider) {
    let meta = await instances.get(this.dirs, instanceId);
    const s = await this.getSettings();
    const prov = provider || s.hostProvider || hosting.DEFAULT_PROVIDER;
    const check = hosting.canHost(meta);
    if (!check.ok) throw new Error(check.reason);
    let installed = false;
    if (!hosting.hasMod(meta, hosting.VOICE_CHAT.projectId, 'voicechat')) {
      await this.installMod(instanceId, 'modrinth', hosting.VOICE_CHAT.projectId, hosting.VOICE_CHAT.title);
      installed = true;
      meta = await instances.get(this.dirs, instanceId);
    }
    const ctx = { ddnsName: s.hostDdnsName || null };
    if (prov === 'direct' && !ctx.ddnsName) ctx.publicIp = (await this.hostNetwork()).publicIp;
    if (prov === 'tailscale') ctx.tailscale = await tailscale.status();
    const dir = this.instanceDir(instanceId);
    const cur = await hosting.readVoiceConfig(meta, dir);
    const voiceHost = hosting.voiceHostFor(prov, { ...ctx, voicePort: cur.port });
    const voice = await hosting.writeVoiceConfig(meta, dir, { voiceHost });
    const notes = {
      p2p: 'voice_host left blank: friends reach voice through their Direct tunnel at localhost.',
      tailscale: voiceHost ? `Friends on your tailnet connect voice to ${voiceHost}.` : 'Start Tailscale, then enable voice again to fill in your Tailscale address.',
      direct: voiceHost ? `Friends connect voice to ${voiceHost}. Forward UDP ${voice.port} too.` : 'Could not find your public IP; voice uses the address friends join with.',
      e4mc: 'e4mc does not carry voice. Only friends on your Wi-Fi will have voice chat.',
    };
    return { installed, provider: prov, voice: { port: voice.port, voiceHost: voice.voiceHost, file: path.relative(dir, voice.file) }, note: notes[prov] || '', status: await this.hostStatus(instanceId) };
  }

  async hostWorld(instanceId) {
    const meta = await instances.get(this.dirs, instanceId);
    const check = hosting.canHost(meta);
    if (!check.ok) throw new Error(check.reason);
    const s = await this.getSettings();
    if (s.hostProvider === 'e4mc' && check.kind === 'e4mc' && !hosting.hasMod(meta, hosting.E4MC.projectId, 'e4mc')) await this.installMod(instanceId, 'modrinth', hosting.E4MC.projectId, hosting.E4MC.title);
    if (!this.running.has(instanceId)) await this.launch(instanceId);
    return this.hostStatus(instanceId);
  }

  // ---------- Direct (free) P2P ----------
  needP2P() { if (!this.p2p) throw new Error('Direct connections are not available in this build.'); return this.p2p; }
  p2pList() { return this.p2p ? this.p2p.list() : []; }
  async p2pCreateInvite(instanceId) {
    const meta = await instances.get(this.dirs, instanceId);
    return this.needP2P().createInvite({ instanceId, name: meta.name, mcVersion: meta.mcVersion });
  }
  p2pAcceptReply(sessionId, code) { return this.needP2P().acceptReply(sessionId, code); }
  async p2pJoin(code) {
    const acc = (await this.listAccounts().catch(() => []))[0];
    return this.needP2P().join(code, { name: (acc && acc.name) || 'Friend' });
  }
  p2pClose(sessionId) { return this.needP2P().close(sessionId); }

  // ---------- Friends & chat (Nostr) ----------
  /** Starts Friends. Electron passes notify/isFocused; tests can pass a local relay list. */
  async startSocial({ notify = () => {}, isFocused = () => false, relays, WebSocket } = {}) {
    this.socialStartOpts = { notify, isFocused, relays, WebSocket };
    const s = await this.getSettings();
    if (!s.socialEnabled) return null;
    const { SocialManager } = require('./social/manager');
    const { DEFAULT_RELAYS } = require('./social/pool');
    this.socialCache.displayName = s.socialDisplayName || '';
    const acc = (await this.listAccounts().catch(() => []))[0];
    this.socialCache.mcName = (acc && acc.name) || null;
    this.socialNotifications = s.socialNotifications !== false;
    this.social = new SocialManager({
      file: path.join(this.dirs.root || path.dirname(this.dirs.settings), 'social.json'),
      keyStore: { get: () => this.secrets.get('nostrKey'), set: (v) => this.secrets.set('nostrKey', v) },
      relays: relays || (s.socialRelays && s.socialRelays.length ? s.socialRelays : DEFAULT_RELAYS),
      discoverable: s.socialDiscoverable !== false,
      WebSocket,
      emit: (ch, d) => this.emit(ch, d),
      hooks: {
        profile: () => ({ displayName: this.socialCache.displayName, mcName: this.socialCache.mcName }),
        presence: () => {
          const first = [...this.runningMeta.values()][0];
          return first ? { state: 'playing', instance: first } : { state: 'online', instance: null };
        },
        hostState: (id) => this.socialHostState(id),
        instanceInfo: async (id) => { const m = await instances.get(this.dirs, id); return { name: m.name, mcVersion: m.mcVersion, loader: m.loader }; },
        p2pCreateInvite: (id) => this.p2pCreateInvite(id),
        p2pAcceptReply: (sid, code) => this.p2pAcceptReply(sid, code),
        p2pJoin: (code, name) => this.needP2P().join(code, { name }),
        p2pClose: (sid) => this.p2p && this.p2p.close(sid),
        notify: (n) => { if (this.socialNotifications) notify(n); },
        isFocused,
      },
    });
    await this.social.start();
    return this.social.summary();
  }
  socialHostState(id) {
    const running = this.running.has(id);
    if (!running) return { running: false, hosting: false, reason: 'The host’s world isn’t open right now.' };
    const server = !this.runningMeta.has(id); // servers don't go through launch()
    const hosting = server || this.lanPorts.has(id);
    return { running, hosting, reason: hosting ? null : 'The host needs to open the world to LAN (Esc → Open to LAN).' };
  }
  needSocial() { if (!this.social) throw new Error('Friends is turned off. Turn it on in Settings → Friends.'); return this.social; }
  socialState() { return this.social ? this.social.summary() : { ready: false, disabled: true }; }
  socialMessages(pk) { return this.needSocial().messages(pk); }
  socialSend(pk, text) { return this.needSocial().sendMessage(pk, text); }
  socialFind(input) { return this.needSocial().findByCode(input); }
  socialAddFriend(input) { return this.needSocial().addFriend(input); }
  socialAccept(pk) { return this.needSocial().acceptFriend(pk); }
  socialDecline(pk) { return this.needSocial().declineFriend(pk); }
  socialRemove(pk) { return this.needSocial().removeFriend(pk); }
  socialSetActive(pk) { return this.social ? this.social.setActiveChat(pk) : false; }
  socialSaveWorld(w) { return this.needSocial().saveWorld(w); }
  socialRemoveWorld(id) { return this.needSocial().removeWorld(id); }
  socialInvite(pk, worldId) { return this.needSocial().inviteToWorld(pk, worldId); }
  socialJoin(host, worldId) { return this.needSocial().joinWorld(host, worldId); }
  socialCancelJoin(reqId) { return this.needSocial().cancelJoin(reqId); }
  async socialQr() {
    const me = this.needSocial().me();
    const QR = require('qrcode');
    return QR.toDataURL(`nostr:${me.npub}`, { margin: 1, width: 360, color: { dark: '#14163a', light: '#ffffff' } });
  }
  /** Launches an instance straight into the friend's world once the Direct tunnel is up. */
  async socialPlay(reqId, instanceId) {
    const j = this.needSocial().joins.get(reqId);
    if (!j || j.state !== 'connected') throw new Error('Not connected yet.');
    return this.launch(instanceId, { server: j.joinAddress });
  }
  async socialSetProfile(patch = {}) {
    const keys = ['socialDisplayName', 'socialDiscoverable', 'socialRelays', 'socialNotifications', 'socialEnabled'];
    const clean = {};
    for (const k of keys) if (k in patch) clean[k] = patch[k];
    if ('socialDisplayName' in clean) clean.socialDisplayName = String(clean.socialDisplayName || '').slice(0, 32);
    if ('socialRelays' in clean) clean.socialRelays = (Array.isArray(clean.socialRelays) ? clean.socialRelays : []).map((u) => String(u).trim()).filter((u) => /^wss?:\/\/\S+$/i.test(u)).slice(0, 12);
    const s = await this.setSettings(clean);
    this.socialCache.displayName = s.socialDisplayName || '';
    this.socialNotifications = s.socialNotifications !== false;
    if (this.social) {
      if ('socialRelays' in clean) this.social.setRelays(s.socialRelays.length ? s.socialRelays : require('./social/pool').DEFAULT_RELAYS);
      if ('socialDiscoverable' in clean) await this.social.setDiscoverable(s.socialDiscoverable);
      if ('socialDisplayName' in clean) await this.social.profileChanged();
    }
    if ('socialEnabled' in clean) {
      if (!s.socialEnabled && this.social) { await this.social.stop(); this.social = null; this.emit('social:update', { ready: false, disabled: true }); }
      else if (s.socialEnabled && !this.social && this.socialStartOpts) await this.startSocial(this.socialStartOpts);
    }
    return this.socialState();
  }
  async stopSocial() { if (this.social) await this.social.stop(); }

  // ---------- system ----------
  storageInfo() { return { ...this.secretStorage }; }

  /** Java runtimes this computer already has (launcher-managed + system). */
  async detectJava() {
    const dirs = [];
    try { for (const e of await fsp.readdir(this.dirs.runtimes)) dirs.push({ dir: path.join(this.dirs.runtimes, e), managed: true }); } catch { /* none yet */ }
    for (const d of await java.systemJavaDirs(this.platform)) dirs.push({ dir: d, managed: false });
    const out = [];
    for (const d of dirs) {
      const bin = await java.javaBinIn(d.dir, this.platform);
      if (bin) out.push({ path: bin, major: await java.javaMajor(bin), managed: d.managed });
    }
    return out;
  }

  // ---------- player skins ----------
  lookupPlayerSkin(query) { return lookupSkin(query); }

  // ---------- Grok ports ----------
  async startPort(instanceId, mod) {
    const apiKey = await this.secrets.get('xaiApiKey');
    if (!apiKey) { const e = new Error('Add your xAI key in Settings'); e.code = 'NO_XAI_KEY'; throw e; }
    const meta = await instances.get(this.dirs, instanceId);
    if (meta.loader !== 'fabric' && meta.loader !== 'quilt') throw new Error('Grok upgrades currently target Fabric/Quilt instances.');
    const s = await this.getSettings();
    const javaPath = await this.javaFor(25);
    const job = new PortJob({
      dirs: this.dirs, javaPath, javaHome: this.javaHomeOf(javaPath), apiKey, model: s.grokModel, reasoning: s.grokReasoning,
      maxAttempts: s.grokMaxAttempts, instance: meta, instanceDir: this.instanceDir(instanceId), mod,
      curseforgeKey: await this.curseforgeKey(),
      emit: (state) => this.emit('grok:job', state),
    });
    this.jobs.set(job.id, job);
    job.run().then(async (state) => {
      if (state.state === 'done') {
        const m = await instances.get(this.dirs, instanceId);
        m.mods = m.mods.map((x) => (x.file === mod.file ? { ...x, enabled: false, file: `${x.file}.disabled` } : x));
        m.mods.push({ source: 'grok-port', projectId: state.result.modId, title: `${state.title}`, file: state.result.file, folder: 'mods', enabled: true, versionName: `${state.from} → ${state.to}`, gameVersion: state.to });
        await instances.save(this.dirs, m);
      }
      this.emit('grok:job', { ...state });
    });
    return { ...job.state };
  }

  listJobs() { return [...this.jobs.values()].map((j) => ({ ...j.state })).reverse(); }
  cancelJob(id) { const j = this.jobs.get(id); if (j) j.cancel(); }
}

module.exports = { LauncherService, SECRET_NAMES };
