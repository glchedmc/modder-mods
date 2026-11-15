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
const jar = fs.readdirSync(libs).filter((f) => /^glass-companion-[\d.]+\.jar$/.test(f)).sort().pop();
const out = path.join(root, 'resources', 'companion');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(libs, jar), path.join(out, jar));
console.log('companion jar ->', path.join(out, jar));
