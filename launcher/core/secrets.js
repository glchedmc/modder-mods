'use strict';
// Secret storage. In the app, values are encrypted with Electron's safeStorage:
// the key lives in the macOS Keychain ("Saturn Client Safe Storage") or, on
// Linux, in the desktop keyring via libsecret (GNOME Keyring / KWallet). When
// Linux has no keyring, values fall back to a private file readable only by
// you (mode 0600), and Settings says so. Secrets are never sent to the
// renderer; the UI only learns whether a key is set.
const fsp = require('fs/promises');

const PLAIN_MAGIC = 'SATURN-PRIVATE-FILE-1\n';

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
      const head = buf.subarray(0, PLAIN_MAGIC.length).toString('utf8');
      this.cache = head === PLAIN_MAGIC ? JSON.parse(buf.subarray(PLAIN_MAGIC.length).toString('utf8')) : JSON.parse(this.cipher.decryptString(buf));
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  async persist() {
    const json = JSON.stringify(this.cache);
    if (this.cipher.isEncryptionAvailable()) {
      await fsp.writeFile(this.file, this.cipher.encryptString(json), { mode: 0o600 });
    } else if (this.cipher.allowPlainFallback) {
      await fsp.writeFile(this.file, PLAIN_MAGIC + json, { mode: 0o600 });
      await fsp.chmod(this.file, 0o600).catch(() => {});
    } else {
      throw new Error('Secure storage (Keychain) is not available');
    }
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

/**
 * Wraps Electron's safeStorage for this OS and says how keys are protected.
 * Linux: "basic_text" means no keyring was found (Chromium would use a fixed
 * password), so we use the private-file fallback and say so honestly.
 */
function platformCipher(safeStorage, platform = process.platform) {
  let backend = null;
  if (platform === 'linux') { try { backend = safeStorage.getSelectedStorageBackend(); } catch { backend = 'unknown'; } }
  let available = false;
  try { available = safeStorage.isEncryptionAvailable(); } catch { available = false; }
  const weakLinux = platform === 'linux' && (!available || backend === 'basic_text' || backend === 'unknown');
  const mode = platform === 'darwin' ? 'keychain' : platform === 'win32' ? 'dpapi' : weakLinux ? 'file' : 'keyring';
  const labels = {
    keychain: 'macOS Keychain',
    dpapi: 'Windows protected storage',
    keyring: `Desktop keyring (${backend || 'libsecret'})`,
    file: 'Private file (no keyring found)',
  };
  const cipher = {
    allowPlainFallback: platform === 'linux',
    isEncryptionAvailable: () => (mode === 'file' ? false : available),
    encryptString: (s) => safeStorage.encryptString(s),
    decryptString: (b) => safeStorage.decryptString(b),
  };
  return { cipher, mode, label: labels[mode], backend };
}

module.exports = { SecretStore, plainCipher, platformCipher, PLAIN_MAGIC };
