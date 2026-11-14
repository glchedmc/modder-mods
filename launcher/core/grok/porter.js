'use strict';
// "Upgrade to 26.3": gets a mod's source (linked GitHub repo, or a Vineflower
// decompile of the jar), asks Grok to port it to Minecraft 26.3 / Fabric, builds
// it with Gradle, feeds compile errors back, and installs the resulting jar.
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { download, fetchJson, exists } = require('../net');
const modrinth = require('../mods/modrinth');
const curseforge = require('../mods/curseforge');
const { createResponse } = require('./xai');

const TARGET = {
  minecraft: '26.3',
  loader: '0.20.1',
  fabricApi: '0.165.2+26.3',
  loom: '1.19.3',
  gradle: '9.8.2',
  java: 25,
};
const VINEFLOWER = { version: '1.12.0', url: 'https://repo1.maven.org/maven2/org/vineflower/vineflower/1.12.0/vineflower-1.12.0.jar' };
const TEXT_EXT = new Set(['.java', '.kt', '.json', '.json5', '.mcmeta', '.accesswidener', '.classtweaker', '.toml', '.properties', '.gradle', '.kts', '.lang', '.cfg', '.txt', '.md']);
const MAX_SOURCE_CHARS = 1_200_000; // ~350k tokens; grok-4.7 has a 500k context.
const STEPS = ['Get source', 'Analyze', 'Port with Grok', 'Build', 'Install'];

const SYSTEM_PROMPT = `You are an expert Minecraft Java mod developer porting a mod to Minecraft ${TARGET.minecraft}.
Target toolchain (fixed, do not change): Fabric Loader ${TARGET.loader}, Fabric API ${TARGET.fabricApi}, Fabric Loom ${TARGET.loom}, Gradle ${TARGET.gradle}, Java ${TARGET.java}.
Minecraft ${TARGET.minecraft} is UNOBFUSCATED: code uses the official Mojang names directly (net.minecraft.world.level.Level, net.minecraft.resources.Identifier, etc.). There is no mappings line in build.gradle, no Yarn and no intermediary. Translate any Yarn or intermediary names to Mojang names.
Notable ${TARGET.minecraft} API facts: GUI drawing uses net.minecraft.client.gui.GuiGraphicsExtractor (methods like fill, text, centeredText, item) and screens/widgets override extractRenderState(...) instead of render(...); HUD elements register through net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry; ResourceLocation is now Identifier (Identifier.fromNamespaceAndPath); key mappings register with KeyMappingHelper.registerKeyMapping and KeyMapping.Category.register(Identifier). When unsure of an API, prefer the simplest approach that compiles and keep behaviour identical.
If the original mod targets Forge/NeoForge, port it to Fabric with equivalent Fabric API events.
Keep the mod id, name, authors, license and features unchanged. Do not add features, telemetry or network calls.

OUTPUT FORMAT (strict): output only file blocks, nothing else.
For every file you create or change, output the COMPLETE file:
<file path="relative/path/from/project/root">
...full contents...
</file>
To delete a file: <delete path="relative/path"/>
Paths are relative to a single-module Gradle project: src/main/java/..., src/main/resources/..., build.gradle. gradle.properties and settings.gradle are managed by the launcher; do not output them.
src/main/resources/fabric.mod.json must exist and declare "minecraft": "~${TARGET.minecraft}", "fabricloader": ">=${TARGET.loader}", "java": ">=${TARGET.java}" and "fabric-api": "*" when Fabric API is used.`;

function buildGradle(modId) {
  return `plugins {
	id "net.fabricmc.fabric-loom" version "\${loom_version}"
}

version = mod_version
group = maven_group

base {
	archivesName = "${modId}"
}

repositories {
	mavenCentral()
	maven { url = "https://maven.terraformersmc.com/releases/" }
	maven { url = "https://maven.shedaniel.me/" }
	maven { url = "https://api.modrinth.com/maven" }
}

dependencies {
	minecraft "com.mojang:minecraft:\${minecraft_version}"
	implementation "net.fabricmc:fabric-loader:\${loader_version}"
	implementation "net.fabricmc.fabric-api:fabric-api:\${fabric_api_version}"
}

processResources {
	def ver = project.version
	inputs.property "version", ver
	filesMatching("fabric.mod.json") {
		expand "version": ver
	}
}

tasks.withType(JavaCompile).configureEach {
	it.options.release = ${TARGET.java}
	it.options.encoding = "UTF-8"
}

java {
	sourceCompatibility = JavaVersion.VERSION_${TARGET.java}
	targetCompatibility = JavaVersion.VERSION_${TARGET.java}
}
`;
}

function gradleProperties(version) {
  return `org.gradle.jvmargs=-Xmx2G
org.gradle.configuration-cache=false
minecraft_version=${TARGET.minecraft}
loader_version=${TARGET.loader}
loom_version=${TARGET.loom}
fabric_api_version=${TARGET.fabricApi}
mod_version=${version}
maven_group=glass.ported
`;
}

/** Parses <file path="..">..</file> and <delete path=".."/> blocks from Grok's reply. */
function parseFileBlocks(text) {
  const files = [];
  const deletes = [];
  const re = /<file\s+path="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/file>/g;
  let m;
  while ((m = re.exec(text))) files.push({ path: m[1].trim(), content: m[2] });
  const dre = /<delete\s+path="([^"]+)"\s*\/>/g;
  while ((m = dre.exec(text))) deletes.push(m[1].trim());
  return { files, deletes };
}

/** Reject paths that escape the project or touch launcher-managed files. */
function safeRel(p) {
  const norm = path.posix.normalize(p.replace(/\\/g, '/'));
  if (norm.startsWith('..') || path.posix.isAbsolute(norm)) return null;
  if (['gradle.properties', 'settings.gradle', 'settings.gradle.kts'].includes(norm)) return null;
  if (norm.startsWith('.gradle/') || norm.startsWith('build/')) return null;
  return norm;
}

/** Extracts javac/Loom error lines, keeping the build log short for the model. */
function summarizeBuildErrors(log, maxChars = 30000) {
  const lines = log.split('\n');
  const keep = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/error:|\berror\b|FAILURE|What went wrong|Could not|Exception|cannot find symbol|does not exist/i.test(l)) {
      keep.push(...lines.slice(i, i + 4));
      i += 3;
    }
  }
  const out = (keep.length ? keep : lines.slice(-120)).join('\n');
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n…(truncated)` : out;
}

function githubRepo(url) {
  const m = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(url || '');
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

async function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['.git', '.gradle', 'build', 'out', 'run', 'node_modules', '.idea'].includes(e.name)) continue;
      await walk(full, base, out);
    } else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function runProcess(cmd, args, opts, onLine, signal) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const onData = (d) => { const s = d.toString(); log += s; if (onLine) s.split('\n').filter(Boolean).forEach(onLine); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    const kill = () => child.kill('SIGTERM');
    if (signal) signal.addEventListener('abort', kill, { once: true });
    const timer = setTimeout(kill, opts.timeout || 20 * 60 * 1000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, log }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, log: `${log}\n${e.message}` }); });
  });
}

class PortJob {
  constructor(opts) {
    this.opts = opts; // {dirs, javaPath, javaHome, apiKey, model, reasoning, maxAttempts, instance, instanceDir, mod, curseforgeKey, emit}
    this.id = `port-${Date.now().toString(36)}`;
    this.abort = new AbortController();
    this.state = {
      id: this.id, title: opts.mod.title || opts.mod.file || 'Mod', icon: opts.mod.icon || null, from: opts.mod.from || '?', to: TARGET.minecraft,
      instanceId: opts.instance.id, state: 'running', step: 0, attempt: 1, maxAttempts: opts.maxAttempts || 5,
      startedAt: Date.now(), finishedAt: null, sourceKind: 'Resolving…', log: [], usage: { input: 0, output: 0 }, result: null,
    };
    this.work = path.join(opts.dirs.ports, this.id);
  }

  log(kind, text) {
    this.state.log.push([kind, String(text).slice(0, 2000)]);
    if (this.state.log.length > 2000) this.state.log.splice(0, this.state.log.length - 2000);
    this.emit();
  }

  emit() { if (this.opts.emit) this.opts.emit({ ...this.state, log: this.state.log.slice() }); }
  step(i) { this.state.step = i; this.emit(); }
  cancel() { this.abort.abort(); }

  async run() {
    try {
      await fsp.mkdir(this.work, { recursive: true });
      const src = await this.getSource();
      this.step(1);
      const { prompt, modId, version } = await this.analyze(src);
      this.step(2);
      const project = path.join(this.work, 'project');
      await this.scaffold(project, src, modId, version);
      let resp = await this.ask(prompt, null);
      await this.apply(project, resp.text);
      for (let attempt = 1; attempt <= this.state.maxAttempts; attempt++) {
        this.state.attempt = attempt;
        this.step(3);
        this.log('info', `gradle build (attempt ${attempt} of ${this.state.maxAttempts})`);
        const { code, log } = await this.build(project);
        if (code === 0) {
          this.log('ok', 'Build succeeded');
          this.step(4);
          const installed = await this.install(project, modId);
          this.state.result = installed;
          this.state.state = 'done';
          this.state.step = 5;
          this.state.finishedAt = Date.now();
          this.log('ok', `Installed ${installed.file} into ${this.opts.instance.name}`);
          return this.state;
        }
        if (this.abort.signal.aborted) throw new Error('Cancelled');
        const errors = summarizeBuildErrors(log);
        const count = (errors.match(/error:/g) || []).length;
        this.log('warn', `Build failed${count ? ` with ${count} error${count > 1 ? 's' : ''}` : ''}.`);
        errors.split('\n').filter((l) => /error:/.test(l)).slice(0, 8).forEach((l) => this.log('err', l.trim()));
        if (attempt === this.state.maxAttempts) break;
        this.step(2);
        this.log('info', `Sending errors back to Grok (attempt ${attempt + 1} of ${this.state.maxAttempts}).`);
        resp = await this.ask(`The build failed. Fix the errors below. Output only the files you change, complete, in the same <file> format.\n\n${errors}`, resp.id);
        await this.apply(project, resp.text);
      }
      throw new Error(`Still failing after ${this.state.maxAttempts} attempts. The project is kept at ${project} for manual fixing.`);
    } catch (e) {
      this.state.state = this.abort.signal.aborted ? 'cancelled' : 'failed';
      this.state.finishedAt = Date.now();
      this.log('err', e.message);
      return this.state;
    }
  }

  /** Step 0: find the latest original jar and, when possible, the source repo. */
  async getSource() {
    const { mod, instance, instanceDir } = this.opts;
    this.step(0);
    const jar = path.join(this.work, 'original.jar');
    let sourceUrl = null;
    let license = null;
    if (mod.source === 'modrinth' && mod.projectId) {
      const project = await modrinth.getProject(mod.projectId);
      sourceUrl = project.source_url; license = project.license && project.license.id;
      const loaders = ['fabric', 'quilt', 'neoforge', 'forge'];
      let versions = await modrinth.getVersions(mod.projectId, { loaders: ['fabric'] });
      if (!versions.length) versions = await modrinth.getVersions(mod.projectId, { loaders });
      const v = versions[0];
      if (!v) throw new Error('No downloadable versions on Modrinth');
      this.state.from = v.game_versions[v.game_versions.length - 1];
      const f = modrinth.primaryFile(v);
      await download(f.url, jar, { sha1: f.hashes && f.hashes.sha1 });
      this.log('info', `Downloaded ${f.filename} (${v.loaders.join(', ')} ${this.state.from})`);
    } else if (mod.source === 'curseforge' && mod.projectId) {
      const m = await curseforge.getMod(this.opts.curseforgeKey, mod.projectId);
      sourceUrl = m.links && m.links.sourceUrl;
      const files = await curseforge.getFiles(this.opts.curseforgeKey, mod.projectId, {});
      const f = files[0];
      if (!f) throw new Error('No files on CurseForge');
      this.state.from = (f.gameVersions || []).find((g) => /^\d/.test(g)) || '?';
      await download(curseforge.fileDownloadUrl(f), jar);
      this.log('info', `Downloaded ${f.fileName}`);
    } else if (mod.file) {
      const p = path.join(instanceDir, 'mods', mod.file);
      await fsp.copyFile((await exists(p)) ? p : `${p}.disabled`, jar);
      this.log('info', `Using installed jar ${mod.file}`);
    } else {
      throw new Error('Nothing to port: no project or file given');
    }
    if (license) this.log('info', `License: ${license}`);

    const repo = githubRepo(sourceUrl);
    if (repo) {
      try {
        const zip = path.join(this.work, 'source.zip');
        await download(`https://api.github.com/repos/${repo.owner}/${repo.repo}/zipball`, zip, { headers: { Accept: 'application/vnd.github+json' } });
        const dir = path.join(this.work, 'source');
        new AdmZip(zip).extractAllTo(dir, true);
        const [top] = await fsp.readdir(dir);
        this.state.sourceKind = `GitHub · ${repo.owner}/${repo.repo}`;
        this.log('info', `Found source: github.com/${repo.owner}/${repo.repo} (default branch)`);
        return { kind: 'repo', root: path.join(dir, top), jar };
      } catch (e) {
        this.log('warn', `Could not fetch the repo (${e.message}); falling back to decompiling.`);
      }
    } else {
      this.log('info', 'No public source repo linked; decompiling the jar with Vineflower.');
    }
    return this.decompile(jar);
  }

  async decompile(jar) {
    const vf = path.join(this.opts.dirs.tools, `vineflower-${VINEFLOWER.version}.jar`);
    await download(VINEFLOWER.url, vf);
    const out = path.join(this.work, 'decompiled');
    await fsp.mkdir(out, { recursive: true });
    const { code, log } = await runProcess(this.opts.javaPath, ['-jar', vf, '--silent', jar, out], { cwd: this.work, timeout: 10 * 60 * 1000 }, null, this.abort.signal);
    if (code !== 0) throw new Error(`Vineflower failed: ${log.slice(-500)}`);
    // Vineflower writes a jar/zip of sources or a folder depending on input; normalise to a folder.
    const produced = await fsp.readdir(out);
    let root = out;
    if (produced.length === 1 && /\.(jar|zip)$/.test(produced[0])) {
      root = path.join(this.work, 'decompiled-src');
      new AdmZip(path.join(out, produced[0])).extractAllTo(root, true);
    }
    this.state.sourceKind = `Decompiled jar · Vineflower ${VINEFLOWER.version}`;
    this.log('info', 'Decompiled the jar. Comments and original names of locals are lost, so the port may need more fixes.');
    return { kind: 'decompiled', root, jar };
  }

  /** Step 1: pick the relevant files and build the prompt. */
  async analyze(src) {
    const all = await walk(src.root);
    const isText = (f) => TEXT_EXT.has(path.extname(f).toLowerCase()) || f.endsWith('fabric.mod.json');
    // Prefer common + fabric modules for multi-loader repos.
    const score = (f) => (/(^|\/)fabric\//.test(f) ? 0 : /(^|\/)(common|shared|core)\//.test(f) ? 1 : /(^|\/)(forge|neoforge|quilt)\//.test(f) ? 3 : 2);
    const textFiles = all.filter(isText).filter((f) => !/(^|\/)(test|testmod|gametest)\//i.test(f)).sort((a, b) => score(a) - score(b));
    let total = 0;
    const included = [];
    for (const f of textFiles) {
      const content = await fsp.readFile(path.join(src.root, f), 'utf8').catch(() => null);
      if (content === null || content.length > 300_000) continue;
      if (total + content.length > MAX_SOURCE_CHARS) { this.log('warn', `Source is large; skipped ${f} and later files.`); break; }
      total += content.length;
      included.push({ path: f, content });
    }
    const fmj = included.find((f) => f.path.endsWith('fabric.mod.json'));
    let modId = 'ported-mod';
    let version = '1.0.0';
    if (fmj) { try { const j = JSON.parse(fmj.content); modId = j.id || modId; version = String(j.version || version).replace(/\$\{.*\}/, '1.0.0'); } catch { /* ignore */ } }
    const toml = included.find((f) => /mods\.toml$/.test(f.path));
    if (!fmj && toml) { const m = /modId\s*=\s*"([^"]+)"/.exec(toml.content); if (m) modId = m[1]; }
    try {
      const jarFmj = new AdmZip(src.jar).readAsText('fabric.mod.json');
      if (jarFmj) { const j = JSON.parse(jarFmj); modId = j.id || modId; version = j.version || version; }
    } catch { /* not a fabric jar */ }
    this.log('info', `${included.length} text files (${Math.round(total / 1024)} KB) sent to Grok; mod id ${modId}.`);
    const fileBlocks = included.map((f) => `<source path="${f.path}">\n${f.content}\n</source>`).join('\n');
    const prompt = `Port this mod (currently for Minecraft ${this.state.from}) to Minecraft ${TARGET.minecraft} on Fabric.
The launcher has already created a single-module Gradle project at the project root with gradle.properties/settings.gradle, and copied the original sources into src/main/java and src/main/resources (binary assets are copied too). Output the files that must change (complete contents) plus any new files, and delete files that no longer apply (e.g. Forge-only classes, old build files).
Source kind: ${src.kind === 'repo' ? 'original repository' : 'decompiled from the released jar (expect decompiler artifacts; clean them up)'}.

${fileBlocks}`;
    return { prompt, modId, version: `${version}+${TARGET.minecraft}-grok` };
  }

  /** Lay out a single-module Fabric project with the original sources copied in. */
  async scaffold(project, src, modId, version) {
    await fsp.rm(project, { recursive: true, force: true });
    await fsp.mkdir(path.join(project, 'src/main/java'), { recursive: true });
    await fsp.mkdir(path.join(project, 'src/main/resources'), { recursive: true });
    await fsp.writeFile(path.join(project, 'settings.gradle'), `pluginManagement {\n\trepositories {\n\t\tmaven { url = "https://maven.fabricmc.net/" }\n\t\tmavenCentral()\n\t\tgradlePluginPortal()\n\t}\n}\nrootProject.name = "${modId}"\n`);
    await fsp.writeFile(path.join(project, 'gradle.properties'), gradleProperties(version));
    await fsp.writeFile(path.join(project, 'build.gradle'), buildGradle(modId));
    const all = await walk(src.root);
    for (const f of all) {
      let dest = null;
      const m = /(?:^|\/)src\/(?:main|client)\/(java|kotlin|resources)\/(.+)$/.exec(f);
      if (m) dest = path.join(project, 'src/main', m[1] === 'kotlin' ? 'java' : m[1], m[2]);
      else if (src.kind === 'decompiled') dest = f.endsWith('.java') ? path.join(project, 'src/main/java', f) : path.join(project, 'src/main/resources', f);
      if (!dest) continue;
      if (/(^|\/)META-INF\/(MANIFEST\.MF|.*\.(SF|RSA|DSA))$/.test(f)) continue;
      if (/(^|\/)(forge|neoforge)\//.test(f) && all.some((x) => /(^|\/)fabric\/src\//.test(x))) continue;
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(path.join(src.root, f), dest);
    }
  }

  async ask(input, previousResponseId) {
    this.log('grok', `${this.opts.model} › ${previousResponseId ? 'fixing build errors' : 'porting'}…`);
    const resp = await createResponse({
      apiKey: this.opts.apiKey, model: this.opts.model, reasoningEffort: this.opts.reasoning,
      instructions: SYSTEM_PROMPT, input, previousResponseId, signal: this.abort.signal,
    });
    if (resp.usage) { this.state.usage.input += resp.usage.input_tokens || 0; this.state.usage.output += resp.usage.output_tokens || 0; }
    return resp;
  }

  async apply(project, text) {
    const { files, deletes } = parseFileBlocks(text);
    if (!files.length && !deletes.length) throw new Error('Grok returned no file changes');
    for (const d of deletes) {
      const rel = safeRel(d);
      if (rel) await fsp.rm(path.join(project, rel), { recursive: true, force: true });
    }
    for (const f of files) {
      const rel = safeRel(f.path);
      if (!rel) { this.log('warn', `Ignored write to ${f.path}`); continue; }
      await fsp.mkdir(path.dirname(path.join(project, rel)), { recursive: true });
      await fsp.writeFile(path.join(project, rel), f.content);
    }
    this.log('grok', `${this.opts.model} › wrote ${files.length} file${files.length === 1 ? '' : 's'}${deletes.length ? `, deleted ${deletes.length}` : ''}`);
  }

  async ensureGradle() {
    const dir = path.join(this.opts.dirs.tools, `gradle-${TARGET.gradle}`);
    const bin = path.join(dir, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');
    if (await exists(bin)) return bin;
    const zip = path.join(this.opts.dirs.cache, `gradle-${TARGET.gradle}-bin.zip`);
    this.log('info', `Downloading Gradle ${TARGET.gradle}`);
    await download(`https://services.gradle.org/distributions/gradle-${TARGET.gradle}-bin.zip`, zip);
    new AdmZip(zip).extractAllTo(this.opts.dirs.tools, true);
    await fsp.chmod(bin, 0o755);
    return bin;
  }

  async build(project) {
    const gradle = await this.ensureGradle();
    const env = { ...process.env, JAVA_HOME: this.opts.javaHome, PATH: `${path.join(this.opts.javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}` };
    return runProcess(gradle, ['build', '--no-daemon', '--console=plain', '-x', 'test'], { cwd: project, env, timeout: 25 * 60 * 1000 }, null, this.abort.signal);
  }

  async install(project, modId) {
    const libs = path.join(project, 'build', 'libs');
    const jars = (await fsp.readdir(libs)).filter((f) => f.endsWith('.jar') && !/-(sources|dev|javadoc)\.jar$/.test(f));
    if (!jars.length) throw new Error('Build produced no jar');
    const name = jars[0].includes('grok') ? jars[0] : jars[0].replace(/\.jar$/, '-grok.jar');
    const modsDir = path.join(this.opts.instanceDir, 'mods');
    await fsp.mkdir(modsDir, { recursive: true });
    await fsp.copyFile(path.join(libs, jars[0]), path.join(modsDir, name));
    // Disable the old jar (kept so the user can roll back).
    const old = this.opts.mod.file && path.join(modsDir, this.opts.mod.file);
    if (old && (await exists(old))) await fsp.rename(old, `${old}.disabled`);
    return { file: name, modId, project };
  }
}

module.exports = { PortJob, TARGET, STEPS, SYSTEM_PROMPT, parseFileBlocks, safeRel, summarizeBuildErrors, githubRepo, buildGradle, gradleProperties };
