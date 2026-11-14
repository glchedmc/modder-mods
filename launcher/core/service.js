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

const SECRET_NAMES = ['xaiApiKey', 'curseforgeApiKey'];
const FABRIC_API_PROJECT = 'P7dR8mSH';

class LauncherService {
  constructor({ dataDir, cipher, resourcesDir, emit = () => {}, platform = currentPlatform(), extraJavaDirs = [] }) {
    this.dirs = layout(dataDir);
    this.secrets = new SecretStore(this.dirs.secrets, cipher);
    this.resourcesDir = resourcesDir;
    this.emit = emit;
    this.platform = platform;
    this.extraJavaDirs = extraJavaDirs;
    this.jobs = new Map();
    this.running = new Map();
    this.authAbort = null;
  }

  async init() {
    for (const d of ['versions', 'libraries', 'assets', 'instances', 'runtimes', 'cache', 'tools', 'ports']) await fsp.mkdir(this.dirs[d], { recursive: true });
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

  // ---------- versions ----------
  async listVersions({ snapshots } = {}) { return mojang.listVersions({ snapshots }); }
  loaderVersions(loader, mc) { return loaders.listLoaderVersions(loader, mc); }

  // ---------- java ----------
  async javaFor(major) {
    const s = await this.getSettings();
    return java.ensureJava(this.dirs, major, this.platform, { override: s.javaPath || undefined, extraDirs: this.extraJavaDirs, onStatus: (t) => this.emit('launch:progress', { phase: t, done: 0, total: 1 }) });
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
        if (partial.eula) await fsp.writeFile(path.join(dir, 'eula.txt'), `# Accepted in Glass Launcher ${new Date().toISOString()}\neula=true\n`);
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
  async launch(id) {
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
    const account = await this.launchAccount();
    const { spec } = await launch.prepare({ dirs: this.dirs, instance: meta, instanceDir: dir, account, platform: this.platform, javaPath, progress });
    progress({ phase: 'Starting', done: 1, total: 1 });
    this.emit('launch:log', { id, line: redact(launch.redactedCommand(spec).join(' ')) });
    const started = Date.now();
    const child = launch.start(spec, {
      onLine: (line) => this.emit('launch:log', { id, line: redact(line) }),
      onExit: async (code) => {
        this.running.delete(id);
        const m = await instances.get(this.dirs, id);
        await instances.save(this.dirs, { ...m, playTimeSec: (m.playTimeSec || 0) + Math.round((Date.now() - started) / 1000) });
        this.emit('launch:state', { id, state: 'exited', code, error: code ? `Minecraft exited with code ${code}. See the Logs tab.` : null });
      },
    });
    this.running.set(id, child);
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
