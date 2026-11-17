'use strict';
// Java runtime discovery and download (Eclipse Temurin via the Adoptium API).
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { download, exists, fetchJson } = require('./net');
const { ensureExecutable, clearQuarantine } = require('./launch-log');

const run = promisify(execFile);

function adoptiumOs(platform) {
  return platform.name === 'osx' ? 'mac' : platform.name;
}
function adoptiumArch(platform) {
  return platform.arch === 'arm64' ? 'aarch64' : platform.arch === 'x86' ? 'x32' : 'x64';
}

/** Path to the java binary inside an extracted JDK folder (handles macOS bundles). */
async function javaBinIn(dir, platform) {
  const exe = platform.name === 'windows' ? 'java.exe' : 'java';
  const candidates = [
    path.join(dir, 'Contents', 'Home', 'bin', exe),
    path.join(dir, 'bin', exe),
  ];
  for (const c of candidates) if (await exists(c)) return c;
  // One level down (archives contain a top-level folder).
  let entries = [];
  try { entries = await fsp.readdir(dir); } catch { return null; }
  for (const e of entries) {
    for (const sub of [path.join(dir, e, 'Contents', 'Home', 'bin', exe), path.join(dir, e, 'bin', exe)]) {
      if (await exists(sub)) return sub;
    }
  }
  return null;
}

/** Reads the major version of a java binary (`java -version` prints to stderr). */
async function javaMajor(bin) {
  try {
    const { stderr, stdout } = await run(bin, ['-version'], { timeout: 15000 });
    const m = /version "(\d+)(?:\.(\d+))?/.exec(stderr || stdout);
    if (!m) return null;
    const major = Number(m[1]);
    return major === 1 ? Number(m[2]) : major;
  } catch {
    return null;
  }
}

/**
 * Finds a Java runtime of the given major version: a user override, one the
 * launcher downloaded, or (optionally) one on the system.
 */
async function findJava(dirs, major, platform, { override, extraDirs = [] } = {}) {
  // A custom Java path is only used when it is the version this Minecraft needs; otherwise the right one is found or downloaded.
  if (override && (await exists(override)) && (await javaMajor(override)) === major) return override;
  const roots = [path.join(dirs.runtimes, `java-${major}`), ...extraDirs];
  for (const r of roots) {
    const bin = await javaBinIn(r, platform);
    if (bin && (await javaMajor(bin)) === major) return bin;
  }
  return null;
}

/** Downloads and extracts Temurin JRE/JDK `major` into runtimes/java-<major>. */
async function installJava(dirs, major, platform, { imageType = 'jdk', onStatus } = {}) {
  const target = path.join(dirs.runtimes, `java-${major}`);
  const os = adoptiumOs(platform);
  const arch = adoptiumArch(platform);
  const api = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?os=${os}&architecture=${arch}&image_type=${imageType}&vendor=eclipse`;
  if (onStatus) onStatus(`Looking up Java ${major} for ${os}/${arch}`);
  let assets = await fetchJson(api);
  if (!assets.length && os === 'mac' && arch === 'aarch64') {
    // Old Java (8) has no Apple silicon build from Temurin; the Intel build runs under Rosetta.
    if (onStatus) onStatus(`No Apple silicon Java ${major}; using the Intel build (Rosetta)`);
    assets = await fetchJson(api.replace('architecture=aarch64', 'architecture=x64'));
  }
  if (!assets.length) throw new Error(`No Temurin ${major} build for ${os}/${arch}`);
  const pkg = assets[0].binary.package;
  const archive = path.join(dirs.cache, pkg.name);
  if (onStatus) onStatus(`Downloading ${pkg.name}`);
  await download(pkg.link, archive, { size: pkg.size });
  await fsp.rm(target, { recursive: true, force: true });
  await fsp.mkdir(target, { recursive: true });
  if (onStatus) onStatus('Extracting Java');
  if (pkg.name.endsWith('.zip')) {
    const AdmZip = require('adm-zip');
    new AdmZip(archive).extractAllTo(target, true);
  } else {
    await run('tar', ['-xzf', archive, '-C', target]);
  }
  const bin = await javaBinIn(target, platform);
  if (!bin) throw new Error('Java extracted but no java binary found');
  await ensureExecutable(bin).catch(() => {});
  await clearQuarantine([target], platform).catch(() => {});
  return bin;
}

async function ensureJava(dirs, major, platform, opts = {}) {
  const found = await findJava(dirs, major, platform, opts);
  if (found) return found;
  return installJava(dirs, major, platform, opts);
}

/**
 * Folders where this OS keeps installed JDKs, one per runtime, so findJava can
 * check each one's version (Linux: /usr/lib/jvm/*, macOS: JavaVirtualMachines).
 */
async function systemJavaDirs(platform, { roots } = {}) {
  const os = require('os');
  const bases = roots || (platform.name === 'osx'
    ? ['/Library/Java/JavaVirtualMachines', path.join(os.homedir(), 'Library/Java/JavaVirtualMachines')]
    : platform.name === 'linux'
      ? ['/usr/lib/jvm', '/usr/lib64/jvm', '/usr/java', '/opt', path.join(os.homedir(), '.jdks'), path.join(os.homedir(), '.sdkman/candidates/java')]
      : []);
  const out = [];
  for (const b of bases) {
    let entries = [];
    try { entries = await fsp.readdir(b, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!(e.isDirectory() || e.isSymbolicLink()) || e.name === 'current' || e.name.startsWith('.')) continue;
      if (b === '/opt' && !/jdk|jre|java|temurin|zulu|corretto/i.test(e.name)) continue; // /opt holds other apps too
      out.push(path.join(b, e.name));
    }
  }
  out.sort().reverse();
  if (!roots && process.env.JAVA_HOME) out.unshift(process.env.JAVA_HOME);
  return out;
}

module.exports = { systemJavaDirs, findJava, installJava, ensureJava, javaBinIn, javaMajor, adoptiumOs, adoptiumArch };
