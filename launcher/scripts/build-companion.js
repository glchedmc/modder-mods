// Builds the Glass Companion Fabric mod and copies the jar into resources/companion,
// where the packaged app picks it up. Needs Java 25 (JAVA_HOME) and Gradle 9.8.2
// (GRADLE or gradle on PATH; downloaded to .tools/ if missing).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const mod = path.join(root, 'companion-mod');
fs.copyFileSync(path.join(root, 'core', 'companion-features.json'), path.join(mod, 'src/main/resources/assets/glass-companion/features.json'));
// The Saturn logo texture is kept in git as base64 text (companion-mod/saturn_logo.png.b64).
const logo = path.join(mod, 'src/main/resources/assets/glass-companion/textures/gui/saturn_logo.png');
fs.mkdirSync(path.dirname(logo), { recursive: true });
fs.writeFileSync(logo, Buffer.from(fs.readFileSync(path.join(mod, 'saturn_logo.png.b64'), 'utf8'), 'base64'));

// Saturn title panorama (built-in resource pack): six cube faces rendered by scripts/make-panorama.js.
const pano = path.join(mod, 'src/main/resources/resourcepacks/saturn_panorama/assets/minecraft/textures/gui/title/background');
if (!fs.existsSync(path.join(pano, 'panorama_5.png')) || fs.statSync(path.join(pano, 'panorama_5.png')).mtimeMs < fs.statSync(path.join(__dirname, 'make-panorama.js')).mtimeMs) {
  require('./make-panorama').render(pano);
}

let gradle = process.env.GRADLE;
if (!gradle) {
  const local = path.join(root, '.tools', 'gradle-9.8.2', 'bin', 'gradle');
  if (!fs.existsSync(local)) {
    fs.mkdirSync(path.join(root, '.tools'), { recursive: true });
    const zip = path.join(root, '.tools', 'gradle.zip');
    execFileSync('curl', ['-sSLo', zip, 'https://services.gradle.org/distributions/gradle-9.8.2-bin.zip'], { stdio: 'inherit' });
    execFileSync('unzip', ['-q', '-o', zip, '-d', path.join(root, '.tools')], { stdio: 'inherit' });
  }
  gradle = local;
}
execFileSync(gradle, ['build', '--no-daemon', '--console=plain'], { cwd: mod, stdio: 'inherit' });
const libs = path.join(mod, 'build', 'libs');
// Newest version wins (numeric compare: 0.1.11 > 0.1.7).
const ver = (f) => f.match(/([\d.]+)\.jar$/)[1].split('.').map(Number);
const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
const jar = fs.readdirSync(libs).filter((f) => /^glass-companion-[\d.]+\.jar$/.test(f)).sort(newer).pop();
const out = path.join(root, 'resources', 'companion');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(libs, jar), path.join(out, jar));
console.log('companion jar ->', path.join(out, jar));
