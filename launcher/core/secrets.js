'use strict';
// Secret storage. In the app, values are encrypted with Electron's safeStorage,
// whose key lives in the macOS Keychain ("Saturn Client Safe Storage"), and
// the ciphertext is kept in secrets.bin. Secrets are never sent to the renderer;
// the UI only learns whether a key is set.
const fsp = require('fs/promises');

class SecretStore {
  /**
   * @param {string} file where the encrypted blob is kept
   * @param {{encryptString(s:string):Buffer, decryptString(b:Buffer):string, isEncryptionAvailable():boolean}} cipher
   */
  constructor(file, cipher) {
    this.file = file;
    this.cipher = cipher;
    this.cache = null;
  }

  async load() {
    if (this.cache) return this.cache;
    try {
      const buf = await fsp.readFile(this.file);
      this.cache = JSON.parse(this.cipher.decryptString(buf));
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  async persist() {
    if (!this.cipher.isEncryptionAvailable()) throw new Error('Secure storage (Keychain) is not available');
    await fsp.writeFile(this.file, this.cipher.encryptString(JSON.stringify(this.cache)), { mode: 0o600 });
  }

  async get(name) { return (await this.load())[name] || null; }

  async set(name, value) {
    await this.load();
    if (value === null || value === undefined || value === '') delete this.cache[name];
    else this.cache[name] = value;
    await this.persist();
  }

  /** {name: true/false} without revealing values. */
  async status(names) {
    const all = await this.load();
    return Object.fromEntries(names.map((n) => [n, Boolean(all[n])]));
  }
}

/** Test/dev cipher. Not secure; used only in unit tests. */
const plainCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s, 'utf8'),
  decryptString: (b) => b.toString('utf8'),
};

module.exports = { SecretStore, plainCipher };
