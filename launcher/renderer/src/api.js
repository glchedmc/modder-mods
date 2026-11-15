// Renderer-side API. In the Electron app this forwards to window.glass (the
// preload bridge). In a plain browser (design previews, screenshots) it falls
// back to an in-memory mock so every screen can render without the main process.
import catalog from '../../core/companion-features.json';
import { starterSkin, STARTERS } from './lib/starterSkins.mjs';
import { toDataUrl, skinFrontDataUrl } from './lib/image';
import { createSocialMock } from './lib/socialMock';

export const isElectron = typeof window !== 'undefined' && Boolean(window.glass);
export const features = catalog;

const listeners = {};
function emit(ch, data) { (listeners[ch] || []).forEach((f) => f(data)); }

export function on(channel, fn) {
  if (isElectron) return window.glass.on(channel, fn);
  (listeners[channel] = listeners[channel] || []).push(fn);
  return () => { listeners[channel] = listeners[channel].filter((f) => f !== fn); };
}

// ---------------- mock ----------------
const companionDefaults = Object.fromEntries(catalog.features.map((f) => [f.key, f.default]));
const now = Date.now();
const MOCK_PROVIDERS = [
  { id: 'p2p', label: 'Direct (free)', voice: true, recommended: true, blurb: 'Peer-to-peer like Essential. Swap invite codes, no setup.' },
  { id: 'tailscale', label: 'Tailscale', voice: true, blurb: 'Private network. Works with voice, no port forwarding.' },
  { id: 'direct', label: 'Own IP / port forward', voice: true, blurb: 'Your public IP or DNS name. UPnP or router setup.' },
  { id: 'e4mc', label: 'e4mc quick link', voice: false, blurb: 'Instant public address. No voice chat.' },
];
const mock = {
  settings: {
    defaultVersion: '26.3', defaultLoader: 'fabric', memoryMb: 6144, javaPath: '', closeOnLaunch: false, showSnapshots: false, showOldVersions: false, performancePack: true,
    theme: 'dark', accent: '#7aa8ff', glassStrength: 0.75, reduceTransparency: false, hostProvider: 'p2p', hostDdnsName: '', reduceMotion: false, backgroundId: 'highlands', backgroundSolid: '#1b1e52', customBackground: null, backgroundBlur: 0, backgroundDim: 0.2, backgroundParallax: 0.35, msaClientId: '8e130755-4b0b-4252-bc49-40cfa995f0d3', grokModel: 'grok-4.7', sidebarCollapsed: false, sidebarMode: 'icons', appIcon: 'saturn', micPrompted: true, skinAiProvider: 'grok', skinAiGrokModel: 'grok-imagine-image-2.0', skinAiOpenaiModel: 'gpt-image-1',
    grokReasoning: 'high', grokMaxAttempts: 5, modSources: { modrinth: true, curseforge: true }, companion: companionDefaults, selectedInstance: 'fabric-26-3',
  },
  secrets: { xaiApiKey: true, openaiApiKey: false, curseforgeApiKey: true, curseforgeApiKeyCustom: false, curseforgeApiKeyBuiltin: true },
  skins: null,
  selectedSkin: null,
  cosmetics: { equipped: { cape: 'saturn', hat: null, wings: null }, capeOnElytra: true, localSkin: true, customCapes: [], customUrls: {}, inGame: { cape: true, hat: false, wings: false } },
  hosts: {},
  running: {},
  voice: {},
  p2p: [],
  accounts: [],
  instances: [
    { id: 'fabric-26-3', name: 'Fabric 26.3', mcVersion: '26.3', loader: 'fabric', loaderVersion: '0.20.1', type: 'client', accent: '#7aa8ff', icon: 'grass', memoryMb: 6144, companion: true, lastPlayed: new Date(now - 3600e3).toISOString(), playTimeSec: 151200,
      mods: [
        { source: 'companion', projectId: 'glass-companion', title: 'Saturn Client Companion', file: 'glass-companion-0.1.1.jar', versionName: '0.1.1', enabled: true },
        { source: 'modrinth', projectId: 'P7dR8mSH', title: 'Fabric API', file: 'fabric-api-0.166.2+26.3.jar', versionName: '0.166.2+26.3', enabled: true, icon: 'https://cdn.modrinth.com/data/P7dR8mSH/icon.png' },
        { source: 'modrinth', projectId: 'AANobbMI', title: 'Sodium', file: 'sodium-fabric-0.8.2+mc26.3.jar', versionName: '0.8.2', enabled: true, icon: 'https://cdn.modrinth.com/data/AANobbMI/icon.png' },
        { source: 'modrinth', projectId: 'gvQqBUqZ', title: 'Lithium', file: 'lithium-fabric-0.17.1+mc26.2.jar', versionName: '0.17.1', enabled: true, icon: 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png' },
        { source: 'modrinth', projectId: 'mOgUt4GM', title: 'Mod Menu', file: 'modmenu-16.0.0.jar', versionName: '16.0.0', enabled: true, icon: 'https://cdn.modrinth.com/data/mOgUt4GM/icon.png' },
        { source: 'modrinth', projectId: 'uXXizFIs', title: 'FerriteCore', file: 'ferritecore-8.0.0-fabric.jar', versionName: '8.0.0', enabled: true, icon: 'https://cdn.modrinth.com/data/uXXizFIs/icon.png' },
        { source: 'modrinth', projectId: 'yBW8D80W', title: 'LambDynamicLights', file: 'lambdynamiclights-4.2.1+1.21.4.jar', versionName: '4.2.1', enabled: true, icon: 'https://cdn.modrinth.com/data/yBW8D80W/icon.png' },
        { source: 'grok-port', projectId: 'boss-ledger', title: 'Boss Ledger', file: 'boss-ledger-1.0.0.jar', versionName: '1.0.0', enabled: true },
      ] },
    { id: 'survival-smp', name: 'Survival SMP', mcVersion: '26.3', loader: 'neoforge', loaderVersion: '26.3.0.103', type: 'client', accent: '#ff9f7a', icon: 'sword', memoryMb: 8192, companion: false, lastPlayed: new Date(now - 86400e3 * 2).toISOString(), playTimeSec: 40000, mods: [] },
    { id: 'quilt-creative', name: 'Creative Builds', mcVersion: '26.3', loader: 'quilt', loaderVersion: '0.20.0-beta.9', type: 'client', accent: '#b28dff', icon: 'brush', memoryMb: 4096, companion: true, lastPlayed: new Date(now - 86400e3 * 6).toISOString(), playTimeSec: 9000, mods: [] },
    { id: 'paper-server', name: 'Paper Server', mcVersion: '26.3', loader: 'paper', loaderVersion: '249', type: 'server', accent: '#5be49b', icon: 'server', memoryMb: 4096, companion: false, lastPlayed: null, playTimeSec: 0, mods: [] },
    { id: 'vanilla-263', name: 'Vanilla', mcVersion: '26.3', loader: 'vanilla', type: 'client', accent: '#ffd36b', icon: 'grass', memoryMb: 4096, companion: false, lastPlayed: new Date(now - 86400e3 * 12).toISOString(), playTimeSec: 3600, mods: [] },
  ],
  compat: {
    'lithium-fabric-0.17.1+mc26.2.jar': { status: 'update', latestName: '0.17.2+mc26.3' },
    'lambdynamiclights-4.2.1+1.21.4.jar': { status: 'needs-port', gameVersions: ['1.21.4'] },
    'boss-ledger-1.0.0.jar': { status: 'ported' },
  },
  schematics: {
    files: [
      { name: 'starter-house.litematic', rel: 'schematics/starter-house.litematic', folder: 'schematics', size: 18432, mtime: new Date(now - 3600e3 * 8).toISOString(), ext: 'litematic' },
      { name: 'iron-farm.schem', rel: 'schematics/iron-farm.schem', folder: 'schematics', size: 93184, mtime: new Date(now - 86400e3 * 3).toISOString(), ext: 'schem' },
    ],
    dest: 'schematics', hasLitematica: false, suggestLitematica: true,
  },
  schematicHits: [
    { source: 'minemev', id: 'demo-1', vendor: 'minemev', title: 'Simple 1wt Accessible box loader', author: 'Sergent_Patate', summary: 'A simple 1wt accessible box loader.', icon: null, downloads: 60, tags: ['storage-tech'], versions: [], pageUrl: 'https://minemev.com/', file: { name: 'box_loader.litematic', url: 'https://minemev.com/example.litematic', size: 1042, type: 'litematic' }, files: [{ name: 'box_loader.litematic', url: 'https://minemev.com/example.litematic', size: 1042 }] },
    { source: 'minemev', id: 'demo-2', vendor: 'choculaterie', title: 'Root House', author: 'soller', summary: 'A cozy starter house.', icon: null, downloads: 40, tags: ['build'], versions: [], pageUrl: 'https://choculaterie.com/schematics', file: { name: 'roothouse.litematic', url: 'https://choculaterie.com/example.litematic', size: 8504, type: 'litematic' }, files: [{ name: 'roothouse.litematic', url: 'https://choculaterie.com/example.litematic', size: 8504 }] },
  ],
  jobs: [
    { id: 'job-1', title: 'LambDynamicLights', from: '1.21.4', to: '26.3', instanceId: 'fabric-26-3', state: 'running', step: 3, attempt: 2, maxAttempts: 5, startedAt: now - 140e3,
      sourceKind: 'GitHub · LambdAurora/LambDynamicLights',
      log: [
        ['info', 'Found source: github.com/LambdAurora/LambDynamicLights (MIT)'],
        ['info', 'Downloaded 214 files, 1.9 MB. Kept 163 Java sources + 9 resources.'],
        ['info', 'Mappings: project used Yarn, will be ported to official Mojang names.'],
        ['grok', 'grok-4.7 › Planning port: 1.21.4 → 26.3 (Fabric Loader 0.20.1, Fabric API 0.165.2+26.3)'],
        ['grok', 'grok-4.7 › Rewrote 41 files: WorldRenderer → LevelRenderer, MatrixStack → PoseStack, Identifier.of → Identifier.fromNamespaceAndPath'],
        ['info', 'gradle build (Loom 1.19.3, Gradle 9.8.2, Java 25)'],
        ['err', 'DynamicLightsRenderer.java:88: error: cannot find symbol  GuiGraphics'],
        ['err', 'LightSourceMixin.java:54: error: method render not found in target class'],
        ['warn', 'Build failed with 2 errors. Sending errors back to Grok (attempt 2 of 5).'],
        ['grok', 'grok-4.7 › GuiGraphics is GuiGraphicsExtractor in 26.3; render(...) became extractRenderState(...). Updating 3 files.'],
        ['info', 'gradle build (attempt 2)…'],
      ] },
    { id: 'job-0', title: 'Boss Ledger', from: '26.2', to: '26.3', instanceId: 'fabric-26-3', state: 'done', step: 5, attempt: 1, maxAttempts: 5, startedAt: now - 86400e3, sourceKind: 'Decompiled jar · Vineflower', log: [['ok', 'Installed boss-ledger-1.0.0+26.3-grok.jar']] },
  ],
};

const sampleHits = [
  ['AANobbMI', 'Sodium', 'jellysquid3', 'The fastest and most compatible rendering optimization mod for Minecraft.', 92e6],
  ['gvQqBUqZ', 'Lithium', 'jellysquid3', 'No-compromises game logic optimization mod.', 61e6],
  ['P7dR8mSH', 'Fabric API', 'modmuss50', 'Lightweight and modular API providing common hooks and intercompatibility measures.', 140e6],
  ['mOgUt4GM', 'Mod Menu', 'Prospector', 'Adds a mod menu to view the list of mods you have installed.', 70e6],
  ['YL57xq9U', 'Iris Shaders', 'coderbot', 'A modern shader pack loader for Minecraft intended to be compatible with existing OptiFine shader packs.', 64e6],
  ['uXXizFIs', 'FerriteCore', 'malte0811', 'Memory usage optimizations.', 52e6],
].map(([id, title, author, summary, downloads]) => ({ source: 'modrinth', id, slug: title.toLowerCase().replace(/\s/g, '-'), title, author, summary, downloads, follows: Math.round(downloads / 3000), icon: `https://cdn.modrinth.com/data/${id}/icon.png`, categories: ['optimization'], versions: ['26.3'] }));

async function mockSearch({ source, query, projectType = 'mod', loader, gameVersion, versionFilter, offset = 0 }) {
  if (source === 'curseforge' && !mock.secrets.curseforgeApiKey) {
    const e = new Error('CurseForge needs an API key. Add one in Settings → Accounts & Keys.'); e.code = 'NO_KEY'; throw e;
  }
  try {
    const facets = [[`project_type:${projectType}`]];
    if (loader && projectType === 'mod' && loader !== 'vanilla') facets.push([`categories:${loader}`]);
    if (gameVersion && versionFilter) facets.push([`versions:${gameVersion}`]);
    const u = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=20&offset=${offset}`;
    const r = await fetch(u);
    const d = await r.json();
    return { total: d.total_hits, hits: d.hits.map((h) => ({ source: 'modrinth', id: h.project_id, slug: h.slug, title: h.title, author: h.author, summary: h.description, icon: h.icon_url, downloads: h.downloads, follows: h.follows, categories: h.display_categories || [], versions: h.versions || [], updated: h.date_modified })) };
  } catch {
    return { total: sampleHits.length, hits: sampleHits };
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function mockSkins() {
  if (!mock.skins) {
    mock.skins = STARTERS.map((id, i) => { const s = starterSkin(id); return { id: `00000000000${i}`, name: s.name, variant: s.variant, source: 'starter', createdAt: new Date(now - i * 86400e3).toISOString(), dataUrl: toDataUrl(s.image) }; });
    mock.selectedSkin = mock.skins[0].id;
  }
  return { skins: mock.skins, selected: mock.selectedSkin };
}
const signedOut = () => { const e = new Error('Sign in with Microsoft to change your skin on Minecraft servers. Microsoft sign-in is waiting on Mojang approval.'); e.code = 'SIGNED_OUT'; return e; };
const mockApi = {
  getSettings: async () => mock.settings,
  setSettings: async (patch) => (mock.settings = { ...mock.settings, ...patch }),
  secretStatus: async () => mock.secrets,
  setSecret: async (name, value) => { mock.secrets[name] = Boolean(value); return mock.secrets; },
  listVersions: async (o = {}) => [...((o.snapshots ? ['26.4-snapshot-8', '26.4-snapshot-7'] : []).map((id) => ({ id, type: 'snapshot' }))), ...['26.3', '26.2', '26.1.2', '26.1.1', '1.21.11', '1.21.10', '1.21.8', '1.21.4', '1.21.1', '1.20.6', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.9'].map((id) => ({ id, type: 'release' })), ...(o.old ? [{ id: 'b1.7.3', type: 'old_beta' }, { id: 'a1.2.6', type: 'old_alpha' }] : [])],
  loaderVersions: async (loader) => ({ fabric: [{ version: '0.20.1', stable: true }], quilt: [{ version: '0.20.0-beta.9', stable: false }], forge: [{ version: '66.1.8', stable: true }], neoforge: [{ version: '26.3.0.103', stable: true }], paper: [{ version: '249', stable: true }], purpur: [{ version: '2658', stable: true }] }[loader] || []),
  listInstances: async () => mock.instances,
  createInstance: async (p) => { const inst = { ...p, id: p.name.toLowerCase().replace(/\W+/g, '-'), type: ['paper', 'purpur'].includes(p.loader) ? 'server' : 'client', mods: [], accent: '#7aa8ff', lastPlayed: null, playTimeSec: 0, createdAt: new Date().toISOString() }; mock.instances.unshift(inst); return inst; },
  updateInstance: async (id, patch) => { const i = mock.instances.find((x) => x.id === id); Object.assign(i, patch); return i; },
  removeInstance: async (id) => { mock.instances = mock.instances.filter((x) => x.id !== id); },
  openFolder: async () => {},
  launch: async (id) => {
    const phases = [['Java 25', 1, 1], ['Libraries', 0, 58], ['Assets', 0, 4210], ['Starting', 1, 1]];
    for (const [phase, , total] of phases) { for (let d = 0; d <= total; d += Math.ceil(total / 6)) { emit('launch:progress', { id, phase, done: Math.min(d, total), total }); await wait(160); } }
    mock.running[id] = true;
    emit('launch:state', { id, state: 'running' });
    setTimeout(() => emit('host:update', { id, lanPort: 25565, state: 'lan' }), 400);
  },
  searchMods: (p) => mockSearch(p),
  installMod: async (instanceId, source, projectId, title) => { await wait(600); const i = mock.instances.find((x) => x.id === instanceId); i.mods.push({ source, projectId, title, file: `${title}.jar`, enabled: true }); return { added: [{ title }], missing: [] }; },
  removeMod: async (instanceId, file) => { const i = mock.instances.find((x) => x.id === instanceId); i.mods = i.mods.filter((m) => m.file !== file); },
  toggleMod: async (instanceId, file, enabled) => { const i = mock.instances.find((x) => x.id === instanceId); const m = i.mods.find((x) => x.file === file); m.enabled = enabled; },
  checkMods: async () => mock.compat,
  startPort: async (instanceId, mod) => { const job = { id: `job-${Date.now()}`, title: mod.title, from: mod.from || '1.21.4', to: '26.3', instanceId, state: 'running', step: 0, attempt: 1, maxAttempts: 5, startedAt: Date.now(), sourceKind: 'Resolving…', log: [['info', 'Queued']] }; mock.jobs.unshift(job); return job; },
  listJobs: async () => mock.jobs,
  cancelJob: async (id) => { const j = mock.jobs.find((x) => x.id === id); if (j) j.state = 'cancelled'; },
  listAccounts: async () => mock.accounts,
  startSignIn: async () => ({ userCode: 'GLASS-7Q4K', verificationUri: 'https://www.microsoft.com/link', needsClientId: !mock.settings.msaClientId }),
  signOut: async () => { mock.accounts = []; },
  getCompanion: async () => mock.settings.companion,
  loadersFor: async (mc) => ({ vanilla: true, forge: !/snapshot|pre|rc|^[ab]1/.test(mc), neoforge: !/snapshot|pre|rc|^[ab]1/.test(mc), fabric: !/^[ab]1/.test(mc), quilt: !/^[ab]1/.test(mc) }),
  perfPackInfo: async () => ({ global: mock.settings.performancePack !== false, instance: null, supported: true, on: mock.settings.performancePack !== false, mods: [['sodium', 'Sodium', '0.9.2'], ['lithium', 'Lithium', '0.26.3'], ['ferrite-core', 'FerriteCore', '9.0.0'], ['immediatelyfast', 'ImmediatelyFast', '1.17.1'], ['entityculling', 'Entity Culling', '1.12.1'], ['sodium-extra', 'Sodium Extra', '0.9.5']].map(([projectId, title, version]) => ({ projectId, title, version, installed: true, enabled: mock.settings.performancePack !== false })) }),
  setPerfPack: async (_id, v) => { mock.settings.performancePack = v; return mockApi.perfPackInfo(); },
  builtinModules: async () => ({ supported: true, enabled: true, standalone: [] }),
  setCompanion: async (_id, cfg) => (mock.settings.companion = cfg),
  listSchematics: async () => mock.schematics,
  addSchematics: async (_id, paths) => { (paths || []).forEach((p) => mock.schematics.files.unshift({ name: p.split('/').pop(), rel: 'schematics/' + p.split('/').pop(), folder: 'schematics', size: 2048, mtime: new Date().toISOString(), ext: (p.split('.').pop() || 'litematic') })); return { added: paths, ...mock.schematics }; },
  removeSchematic: async (_id, rel) => { mock.schematics.files = mock.schematics.files.filter((f) => f.rel !== rel); return mock.schematics; },
  searchSchematics: async (query) => ({ total: mock.schematicHits.filter((h) => !query || h.title.toLowerCase().includes(String(query).toLowerCase())).length, hits: mock.schematicHits.filter((h) => !query || h.title.toLowerCase().includes(String(query).toLowerCase())), source: 'MineMev', sourceUrl: 'https://minemev.com/' }),
  downloadSchematic: async (_id, file) => { mock.schematics.files.unshift({ name: file.name, rel: 'schematics/' + file.name, folder: 'schematics', size: file.size || 1024, mtime: new Date().toISOString(), ext: (file.name.split('.').pop() || 'litematic') }); return { added: [file.name], ...mock.schematics }; },
  pickSchematicFiles: async () => [],
  openUrl: async () => {},
  pickBackgroundFile: async () => null,
  importBackground: async (filePath) => {
    const name = String(filePath || 'background.png').split('/').pop();
    const ext = (name.split('.').pop() || 'png').toLowerCase();
    return { id: 'mock', file: name, name, kind: ['mp4', 'webm'].includes(ext) ? 'video' : 'image', ext };
  },
  removeBackgroundFile: async () => {},
  backgroundUrl: async () => null,
  renameMod: async (id, file, opts) => {
    const i = mock.instances.find((x) => x.id === id); const m = i.mods.find((x) => x.file === file); const undo = {};
    if ('name' in opts) { undo.name = m.displayName || null; if (opts.name && opts.name !== m.title) m.displayName = opts.name; else delete m.displayName; }
    if (opts.fileName) { undo.fileName = m.file; m.originalFile = m.originalFile || m.file; m.file = opts.fileName.endsWith('.jar') ? opts.fileName : `${opts.fileName}.jar`; }
    return { mod: { ...m }, undo };
  },
  resetModName: async (id, file) => { const i = mock.instances.find((x) => x.id === id); const m = i.mods.find((x) => x.file === file); const undo = { name: m.displayName || null }; delete m.displayName; if (m.originalFile) { undo.fileName = m.file; m.file = m.originalFile; delete m.originalFile; } return { mod: { ...m }, undo }; },
  listSkins: async () => mockSkins(),
  addSkin: async (e) => { mockSkins(); const s = { id: Math.random().toString(16).slice(2, 14).padEnd(12, '0'), name: e.name || 'Untitled skin', variant: e.variant || 'classic', source: e.source || 'upload', createdAt: new Date().toISOString(), dataUrl: e.png }; mock.skins.unshift(s); return s; },
  updateSkin: async (id, patch) => { const s = mockSkins().skins.find((x) => x.id === id); Object.assign(s, patch); return s; },
  removeSkin: async (id) => { mockSkins(); mock.skins = mock.skins.filter((x) => x.id !== id); if (mock.selectedSkin === id) mock.selectedSkin = mock.skins[0] && mock.skins[0].id; },
  selectSkin: async (id) => { mockSkins(); mock.selectedSkin = id; return id; },
  accountProfile: async () => ({ signedIn: false, skins: [], capes: [] }),
  applySkin: async () => { throw signedOut(); },
  setAccountCape: async () => { throw signedOut(); },
  skinAiProviders: async () => ({ grok: { label: 'Grok', model: 'grok-imagine-image-2.0', secret: 'xaiApiKey', keyUrl: 'https://console.x.ai' }, openai: { label: 'ChatGPT', model: 'gpt-image-1', secret: 'openaiApiKey', keyUrl: 'https://platform.openai.com/api-keys' } }),
  generateSkinImage: async ({ provider }) => {
    if (!mock.secrets[provider === 'openai' ? 'openaiApiKey' : 'xaiApiKey']) { const e = new Error(`Add your ${provider === 'openai' ? 'ChatGPT' : 'Grok'} API key in Settings → Accounts & Keys.`); e.code = 'NO_KEY'; throw e; }
    await wait(1400);
    const s = starterSkin('nova');
    const front = await skinFrontDataUrl(toDataUrl(s.image), s.variant, 16);
    const c = document.createElement('canvas'); c.width = 512; c.height = 768; const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 768);
    const im = new Image(); await new Promise((r) => { im.onload = r; im.src = front; });
    ctx.imageSmoothingEnabled = false; ctx.drawImage(im, 128, 128, 256, 512);
    return { b64: c.toDataURL('image/png').split(',')[1], mime: 'image/png', model: 'grok-imagine-image-2.0' };
  },
  getCosmetics: async () => mock.cosmetics,
  setCosmetics: async (patch) => { const { capePng, ...rest } = patch; mock.cosmetics = { ...mock.cosmetics, ...rest, equipped: { ...mock.cosmetics.equipped, ...(rest.equipped || {}) } }; return mock.cosmetics; },
  addCustomCape: async (png, name) => { const id = `custom-${Math.random().toString(16).slice(2, 10)}`; mock.cosmetics.customCapes.unshift({ id, name }); mock.cosmetics.customUrls[id] = png; return mock.cosmetics; },
  removeCustomCape: async (id) => { mock.cosmetics.customCapes = mock.cosmetics.customCapes.filter((c) => c.id !== id); return mock.cosmetics; },
  hostStatus: async (id) => {
    const i = mock.instances.find((x) => x.id === id); const server = i.type === 'server'; const okLoader = ['fabric', 'quilt', 'forge', 'neoforge'].includes(i.loader);
    const prov = mock.settings.hostProvider || 'p2p';
    return {
      ok: server || okLoader, kind: server ? 'server' : 'e4mc', reason: okLoader || server ? null : 'World hosting needs a Fabric, Quilt, Forge or NeoForge instance (voice chat and e4mc are mods).',
      provider: prov, providers: MOCK_PROVIDERS, running: Boolean(mock.running && mock.running[id]) || Boolean(mock.hosts[id]), address: prov === 'e4mc' ? mock.hosts[id] || null : null,
      lanPort: mock.running && mock.running[id] ? 25565 : null, e4mcInstalled: i.mods.some((m) => m.projectId === 'qANg5Jrr'), voiceChatInstalled: i.mods.some((m) => m.projectId === '9eGKb6K1'),
      voice: mock.voice[id] || { configured: false, port: 24454, voiceHost: '', file: 'config/voicechat/voicechat-server.properties' },
      lan: [{ name: 'en0', address: '192.168.1.42' }], port: 25565, ddnsName: mock.settings.hostDdnsName || '', platform: 'darwin', p2pAvailable: true,
    };
  },
  hostNetwork: async () => ({ publicIp: '203.0.113.27', lan: [{ name: 'en0', address: '192.168.1.42' }], upnp: null }),
  upnpMap: async () => { await wait(900); return { ok: true, mcPort: 25565, voicePort: 24454, publicIp: '203.0.113.27', routerIp: '203.0.113.27', gateway: '192.168.1.1', localIp: '192.168.1.42', cgnat: false, mappings: [{ port: 25565, protocol: 'TCP', what: 'Minecraft', ok: true }, { port: 24454, protocol: 'UDP', what: 'Voice chat', ok: true }] }; },
  upnpUnmap: async () => ({ ok: true }),
  tailscaleStatus: async () => ({ installed: true, running: true, state: 'Running', ip4: '100.101.42.7', dnsName: 'izaks-macbook.tail3c9e1.ts.net', tailnet: 'izak@example.com', peersOnline: 2, peers: 3, install: { url: 'https://tailscale.com/download/mac', steps: [] }, shareUrl: 'https://login.tailscale.com/admin/machines', inviteUrl: 'https://login.tailscale.com/admin/users' }),
  setDdnsName: async (n) => { mock.settings.hostDdnsName = String(n || '').trim().toLowerCase(); return { ddnsName: mock.settings.hostDdnsName }; },
  updateDdns: async () => ({ ok: true }),
  enableVoiceChat: async (id, provider) => {
    await wait(800);
    const i = mock.instances.find((x) => x.id === id);
    if (!i.mods.some((m) => m.projectId === '9eGKb6K1')) i.mods.push({ source: 'modrinth', projectId: '9eGKb6K1', title: 'Simple Voice Chat', file: 'voicechat-fabric-2.6.27+26.3.jar', versionName: '2.6.27', enabled: true, icon: 'https://cdn.modrinth.com/data/9eGKb6K1/icon.png' });
    const vh = provider === 'tailscale' ? 'izaks-macbook.tail3c9e1.ts.net:24454' : provider === 'direct' ? `${mock.settings.hostDdnsName || '203.0.113.27'}:24454` : '';
    mock.voice[id] = { configured: true, port: 24454, voiceHost: vh, file: 'config/voicechat/voicechat-server.properties' };
    const notes = { p2p: 'voice_host left blank: friends reach voice through their Direct tunnel at localhost.', tailscale: `Friends on your tailnet connect voice to ${vh}.`, direct: `Friends connect voice to ${vh}. Forward UDP 24454 too.` };
    return { installed: true, provider, voice: mock.voice[id], note: notes[provider] || '', status: await mockApi.hostStatus(id) };
  },
  p2pList: async () => mock.p2p,
  p2pCreateInvite: async (id) => {
    await wait(700);
    const s = { id: Math.random().toString(16).slice(2, 14), role: 'host', state: 'waiting-reply', instanceId: id, code: `SATURN-INVITE-${'7VNdjtsgEIXv8xS'.repeat(12)}Q2xvdWQ`, nat: { type: 'cone', publicIp: '203.0.113.27', message: 'Your network allows direct connections.' }, pair: null, error: null, connections: 0, bytesIn: 0, bytesOut: 0, voiceUp: false };
    mock.p2p = [...mock.p2p, s]; emit('p2p:update', mock.p2p); return s;
  },
  p2pAcceptReply: async (sid) => {
    const upd = (patch) => { mock.p2p = mock.p2p.map((x) => (x.id === sid ? { ...x, ...patch } : x)); emit('p2p:update', mock.p2p); };
    upd({ state: 'connecting', peerName: 'Steve_Builder' });
    setTimeout(() => upd({ state: 'connected', pair: { kind: 'p2p', label: 'Direct · peer-to-peer (hole punched)' }, voiceUp: true, connections: 1, bytesIn: 3.4 * 1048576 }), 900);
    return mock.p2p.find((x) => x.id === sid);
  },
  p2pJoin: async () => {
    await wait(700);
    const s = { id: Math.random().toString(16).slice(2, 14), role: 'join', state: 'waiting-host', peerName: 'Izak', mcVersion: '26.3', code: `SATURN-REPLY-${'3ZJLa8MwEIXv_S'.repeat(10)}AA`, nat: { type: 'cone', message: 'Your network allows direct connections.' }, localPort: 25565, joinAddress: 'localhost', voicePort: 24454, voiceUp: false, connections: 0, bytesIn: 0, bytesOut: 0 };
    mock.p2p = [...mock.p2p, s]; emit('p2p:update', mock.p2p);
    setTimeout(() => { mock.p2p = mock.p2p.map((x) => (x.id === s.id ? { ...x, state: 'connected', pair: { kind: 'p2p', label: 'Direct · peer-to-peer (hole punched)' }, voiceUp: true } : x)); emit('p2p:update', mock.p2p); }, 2500);
    return s;
  },
  p2pClose: async (sid) => { mock.p2p = mock.p2p.filter((x) => x.id !== sid); emit('p2p:update', mock.p2p); return true; },
  lookupPlayerSkin: async (q) => { await wait(600); const s = starterSkin('explorer'); return { uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', name: /^[0-9a-f-]{32,36}$/i.test(q) ? 'Notch' : q, model: 'classic', skin: toDataUrl(s.image), cape: null, legacy: false }; },
  storageInfo: async () => ({ mode: 'keychain', label: 'macOS Keychain' }),
  detectJava: async () => [{ path: '/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home/bin/java', major: 25, managed: false }],
  copyText: async () => true,
  installHostingMod: async (id, which) => { await wait(700); const i = mock.instances.find((x) => x.id === id); i.mods.push(which === 'voicechat' ? { source: 'modrinth', projectId: '9eGKb6K1', title: 'Simple Voice Chat', file: 'voicechat-fabric-2.6.27+26.3.jar', versionName: '2.6.27', enabled: true, icon: 'https://cdn.modrinth.com/data/9eGKb6K1/icon.png' } : { source: 'modrinth', projectId: 'qANg5Jrr', title: 'e4mc', file: 'e4mc-fabric-6.2.3-modern.jar', versionName: '6.2.3', enabled: true, icon: 'https://cdn.modrinth.com/data/qANg5Jrr/icon.png' }); return { added: [{}], missing: [] }; },
  hostWorld: async (id) => { await wait(900); mock.hosts[id] = 'brave-otter.us.e4mc.link'; emit('host:update', { id, address: mock.hosts[id], state: 'hosting' }); return mockApi.hostStatus(id); },
  micStatus: async () => ({ status: 'granted', label: 'Allowed', tone: 'green', hint: 'Voice chat mods can use your mic.', platform: 'darwin', canPrompt: false }),
  requestMic: async () => mockApi.micStatus(),
  openMicSettings: async () => true,
  setAppIcon: async (name) => { mock.settings.appIcon = name; return true; },
  pickImageFile: async () => null,
  migrationInfo: async () => ({ migrated: false }),
  ...createSocialMock({ emit, wait: (ms) => new Promise((r) => setTimeout(r, ms)) }),
  appInfo: async () => ({ version: '0.1.5', platform: 'darwin', arch: 'arm64', dataDir: '~/Library/Application Support/Saturn Client', electron: 'preview' }),
};

export const api = isElectron ? window.glass.api : mockApi;
