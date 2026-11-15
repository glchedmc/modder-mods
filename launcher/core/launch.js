'use strict';
// Builds the full java command line for a client instance and prepares files.
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { rulesAllow } = require('./rules');
const { resolveLibraries } = require('./libraries');
const { assetFiles, legacyAssetDir, materializeLegacyAssets } = require('./assets');
const { downloadAll, download } = require('./net');
const { cpSeparator } = require('./platform');
const { resolveVersion } = require('./mojang');

const LAUNCHER_NAME = 'glass-launcher';
const LAUNCHER_VERSION = '0.1.0';

function flattenArgs(list, platform, features) {
  const out = [];
  for (const a of list || []) {
    if (typeof a === 'string') { out.push(a); continue; }
    if (!rulesAllow(a.rules, platform, features)) continue;
    if (Array.isArray(a.value)) out.push(...a.value); else out.push(a.value);
  }
  return out;
}

function substitute(arg, vars) {
  return arg.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Absolute paths for the instance and the version's game jar. */
function gamePaths(dirs, instanceDir, version) {
  const jarId = version.jar || version.id;
  return {
    gameDir: instanceDir,
    clientJar: path.join(dirs.versions, jarId, `${jarId}.jar`),
    nativesDir: path.join(instanceDir, '.natives'),
  };
}

/**
 * Everything needed to launch: the file list to download and the command.
 * account: {name, uuid, accessToken, xuid, type: 'msa'|'demo'}
 */
function buildLaunch({ dirs, version, instance, instanceDir, account, platform, javaPath, features = {} }) {
  const { classpath, natives } = resolveLibraries(version, dirs.libraries, platform, features);
  const paths = gamePaths(dirs, instanceDir, version);
  const sep = cpSeparator(platform);
  const cp = [...new Set([...classpath.map((l) => l.path), paths.clientJar])];

  const feats = {
    is_demo_user: account.type === 'demo',
    has_custom_resolution: Boolean(instance.resolution),
    ...features,
  };
  const vars = {
    auth_player_name: account.name,
    version_name: version.id,
    game_directory: paths.gameDir,
    assets_root: dirs.assets,
    game_assets: legacyAssetDir(version, dirs.assets) || dirs.assets,
    assets_index_name: version.assetIndex ? version.assetIndex.id : version.assets,
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken,
    auth_session: account.accessToken,
    clientid: account.clientId || '',
    auth_xuid: account.xuid || '',
    user_type: account.type === 'msa' ? 'msa' : 'legacy',
    version_type: version.type || 'release',
    user_properties: '{}',
    resolution_width: instance.resolution ? instance.resolution.width : 854,
    resolution_height: instance.resolution ? instance.resolution.height : 480,
    natives_directory: paths.nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath: cp.join(sep),
    classpath_separator: sep,
    library_directory: dirs.libraries,
    quickPlayPath: path.join(instanceDir, 'quickplay.json'),
  };

  let jvm;
  let game;
  if (version.arguments) {
    jvm = flattenArgs(version.arguments.jvm, platform, feats);
    game = flattenArgs(version.arguments.game, platform, feats);
  } else {
    // Legacy (pre-1.13) format.
    jvm = [];
    if (platform.name === 'osx') jvm.push('-XstartOnFirstThread');
    jvm.push('-Djava.library.path=${natives_directory}', '-cp', '${classpath}');
    game = (version.minecraftArguments || '').split(' ').filter(Boolean);
    if (feats.has_custom_resolution) game.push('--width', '${resolution_width}', '--height', '${resolution_height}');
    if (feats.is_demo_user) game.push('--demo');
  }

  // User JVM args: memory, then the version's recommended defaults, then custom.
  const user = [`-Xms${Math.min(2048, instance.memoryMb)}M`, `-Xmx${instance.memoryMb}M`];
  const defaultsUser = version.arguments && version.arguments['default-user-jvm']
    ? flattenArgs(version.arguments['default-user-jvm'], platform, feats).filter((a) => !/^-Xm[sx]/.test(a))
    : [];
  const custom = (instance.jvmArgs || '').split(/\s+/).filter(Boolean);
  const args = [
    ...user, ...defaultsUser, ...custom,
    ...jvm.map((a) => substitute(a, vars)).map((a) => a.trim()),
    version.mainClass,
    ...game.map((a) => substitute(a, vars)),
  ];

  const downloads = classpath.filter((l) => l.url).map((l) => ({ url: l.url, path: l.path, sha1: l.sha1, size: l.size }));
  for (const n of natives) downloads.push({ url: n.url, path: n.path, sha1: n.sha1, size: n.size });
  if (version.downloads && version.downloads.client) {
    downloads.push({ url: version.downloads.client.url, path: paths.clientJar, sha1: version.downloads.client.sha1, size: version.downloads.client.size });
  }
  return { java: javaPath, args, cwd: instanceDir, downloads, natives, paths, classpath: cp };
}

/** Extract legacy native jars into the natives directory. */
async function extractNatives(natives, nativesDir) {
  await fsp.mkdir(nativesDir, { recursive: true });
  for (const n of natives) {
    const zip = new AdmZip(n.path);
    const excludes = (n.extract && n.extract.exclude) || ['META-INF/'];
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || excludes.some((x) => entry.entryName.startsWith(x))) continue;
      zip.extractEntryTo(entry, nativesDir, false, true);
    }
  }
}

/**
 * Downloads everything for an instance's resolved version (libraries, client
 * jar, assets) and returns the launch spec. progress({phase, done, total}).
 */
async function prepare({ dirs, instance, instanceDir, account, platform, javaPath, progress = () => {} }) {
  const version = await resolveVersion(dirs, instance.versionId || instance.mcVersion);
  const spec = buildLaunch({ dirs, version, instance, instanceDir, account, platform, javaPath });
  progress({ phase: 'Libraries', done: 0, total: spec.downloads.length });
  await downloadAll(spec.downloads, { onProgress: (p) => progress({ phase: 'Libraries', ...p }) });
  const assets = await assetFiles(version, dirs.assets);
  progress({ phase: 'Assets', done: 0, total: assets.length });
  await downloadAll(assets, { concurrency: 24, onProgress: (p) => progress({ phase: 'Assets', ...p }) });
  if (version.logging && version.logging.client && version.logging.client.file) {
    const f = version.logging.client.file;
    await download(f.url, path.join(dirs.assets, 'log_configs', f.id), { sha1: f.sha1 });
  }
  await materializeLegacyAssets(version, dirs.assets, instanceDir);
  if (spec.natives.length) await extractNatives(spec.natives, spec.paths.nativesDir);
  await fsp.mkdir(path.join(spec.paths.nativesDir), { recursive: true });
  return { spec, version };
}

function start(spec, { onLine, onExit } = {}) {
  const child = spawn(spec.java, spec.args, { cwd: spec.cwd, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) !== -1) { if (onLine) onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
  };
  pipe(child.stdout); pipe(child.stderr);
  child.on('exit', (code) => onExit && onExit(code));
  return child;
}

/** A printable command with the access token removed. */
function redactedCommand(spec) {
  const out = [];
  for (let i = 0; i < spec.args.length; i++) {
    const a = spec.args[i];
    out.push(spec.args[i - 1] === '--accessToken' ? '[redacted]' : a);
  }
  return [spec.java, ...out];
}

module.exports = { buildLaunch, prepare, start, flattenArgs, substitute, extractNatives, redactedCommand, LAUNCHER_NAME };
