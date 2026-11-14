'use strict';
const path = require('path');

/** Standard folder layout under the launcher's data directory. */
function layout(root) {
  return {
    root,
    versions: path.join(root, 'versions'),
    libraries: path.join(root, 'libraries'),
    assets: path.join(root, 'assets'),
    instances: path.join(root, 'instances'),
    servers: path.join(root, 'servers'),
    runtimes: path.join(root, 'runtimes'),
    cache: path.join(root, 'cache'),
    tools: path.join(root, 'tools'),
    ports: path.join(root, 'grok-ports'),
    backgrounds: path.join(root, 'backgrounds'),
    settings: path.join(root, 'settings.json'),
    secrets: path.join(root, 'secrets.bin'),
  };
}

module.exports = { layout };
