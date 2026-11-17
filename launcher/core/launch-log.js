'use strict';
// Per-launch game log, launch diagnosis, and the macOS runtime fixes (exec bit, quarantine).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { redact: redactCmd } = require('./util');
const { redact: redactAuth } = require('./auth/log');
const redact = (t) => redactAuth(redactCmd(t)).replace(/(accessToken|access_token|sessionToken)("?\s*[:=]\s*"?)[A-Za-z0-9._~+/=-]{8,}/gi, '$1$2[redacted]');

const KEEP = 25;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** One file per launch: <logs>/launches/<instance>-<yyyymmdd-hhmmss>.log. Everything the game prints goes here. */
class LaunchLog {
  constructor(logsDir, instanceId, now = new Date()) {
    this.dir = path.join(logsDir, 'launches');
    this.file = path.join(this.dir, `${String(instanceId).replace(/[^\w.-]+/g, '_')}-${stamp(now)}.log`);
    this.tail = [];
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.prune();
    } catch { /* logging must never block a launch */ }
  }
  prune() {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.log')).map((f) => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const x of files.slice(KEEP)) fs.rmSync(path.join(this.dir, x.f), { force: true });
    } catch { /* ignore */ }
  }
  write(line) {
    const text = redact(String(line));
    this.tail.push(text);
    if (this.tail.length > 80) this.tail.shift();
    try { fs.appendFileSync(this.file, `${text}\n`); } catch { /* ignore */ }
  }
  note(line) { this.write(`[Saturn ${new Date().toISOString()}] ${line}`); }
}

/** Turns the last lines of a failed launch into a plain-English hint. */
function diagnose(lines, { code, signal, ranMs } = {}) {
  const text = (lines || []).join('\n');
  const rules = [
    [/UnsupportedClassVersionError|class file version/i, 'The Java runtime is too old for this Minecraft version. Delete the Java folder in Saturn’s data folder (runtimes) so the right one is downloaded.'],
    [/Could not create the Java Virtual Machine|Unrecognized VM option|Invalid maximum heap/i, 'Java refused to start (bad JVM option or memory setting). Lower the instance memory or clear custom JVM arguments.'],
    [/NSInternalInconsistencyException|must be run on the main thread|XstartOnFirstThread/i, 'macOS needs the game on its first thread (-XstartOnFirstThread). Send this log.'],
    [/GLFW error|Failed to initialize GLFW|failed to create window|Pixel format not accelerated/i, 'The game window couldn’t be created (graphics/GLFW error). Update your graphics drivers or macOS.'],
    [/UnsatisfiedLinkError|dlopen|code signature|not valid for use in process|wrong architecture|mach-o/i, 'A native library failed to load (architecture or code-signature problem). Send this log.'],
    [/OutOfMemoryError|Cannot allocate memory|Could not reserve enough space/i, 'Not enough memory. Lower the instance memory in Manage.'],
    [/Mod resolution failed|Incompatible mods|requires version|Failed to load mod|ModResolutionException/i, 'A mod is incompatible with this game version. Disable recent mods and try again.'],
    [/Address already in use|BindException/i, 'A network port is already in use by another program.'],
    [/Invalid session|authentication servers|Failed to verify username/i, 'Minecraft couldn’t verify your account. Sign out and in again.'],
  ];
  for (const [re, hint] of rules) if (re.test(text)) return hint;
  if (signal) return `Minecraft was killed by ${signal}.`;
  if (code === 137 || code === 9) return 'Minecraft was killed (likely out of memory).';
  if (ranMs != null && ranMs < 15000) return 'It closed within seconds of starting.';
  return '';
}

function sh(cmd, args, timeout = 30000) {
  return new Promise((res) => execFile(cmd, args, { timeout }, (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));
}

/** chmod +x a java binary (and its siblings) if the extract lost the exec bit. Returns true when something changed. */
async function ensureExecutable(bin) {
  let changed = false;
  try { await fsp.access(bin, fs.constants.X_OK); } catch {
    await fsp.chmod(bin, 0o755); changed = true;
  }
  try {
    const dir = path.dirname(bin);
    for (const f of await fsp.readdir(dir)) {
      const p = path.join(dir, f);
      const st = await fsp.stat(p);
      if (st.isFile() && !(st.mode & 0o100)) { await fsp.chmod(p, st.mode | 0o755); changed = true; }
    }
  } catch { /* best effort */ }
  return changed;
}

/** macOS: remove com.apple.quarantine from downloaded runtime/natives so Gatekeeper never blocks dlopen/exec. */
async function clearQuarantine(paths, platform, log = () => {}) {
  if (!platform || platform.name !== 'osx') return;
  for (const p of paths.filter(Boolean)) {
    try { await fsp.access(p); } catch { continue; }
    const r = await sh('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', p]);
    log(`quarantine: ${r.err ? `xattr failed on ${p}: ${(r.stderr || r.err.message).trim().slice(0, 160)}` : `cleared on ${p}`}`);
  }
}

/** A short description of a binary's CPU architecture (macOS/Linux `file`). */
async function binaryArch(bin) {
  const r = await sh('/usr/bin/file', ['-b', bin], 8000);
  return r.err ? 'unknown' : r.stdout.trim().replace(/^Mach-O 64-bit executable /, 'Mach-O ').slice(0, 80);
}

/** Collapses the (very long) classpath so main.log stays readable. */
function summarizeCommand(cmd) {
  const out = [];
  for (let i = 0; i < cmd.length; i++) {
    if ((cmd[i - 1] === '-cp' || cmd[i - 1] === '-classpath') && cmd[i].length > 200) out.push(`[classpath: ${cmd[i].split(/[:;]/).length} entries]`);
    else out.push(cmd[i]);
  }
  return out.join(' ');
}

module.exports = { LaunchLog, diagnose, ensureExecutable, clearQuarantine, binaryArch, summarizeCommand, stamp };
