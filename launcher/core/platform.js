'use strict';
// Describes the machine Minecraft will run on, in Mojang rule terms.
const os = require('os');

function currentPlatform(overrides = {}) {
  const p = process.platform;
  const name = p === 'darwin' ? 'osx' : p === 'win32' ? 'windows' : 'linux';
  const nodeArch = overrides.nodeArch || process.arch;
  return {
    name,
    arch: nodeArch === 'arm64' ? 'arm64' : nodeArch === 'ia32' ? 'x86' : 'x86_64',
    version: os.release(),
    ...overrides,
  };
}

/** The classpath separator for the target OS. */
function cpSeparator(platform) {
  return platform.name === 'windows' ? ';' : ':';
}

module.exports = { currentPlatform, cpSeparator };
