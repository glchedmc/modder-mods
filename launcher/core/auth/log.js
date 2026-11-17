'use strict';
// Plain-text log of sign-in steps and errors, so the user can send it when sign-in fails.
// Never contains tokens, device codes or user codes: they are redacted before writing.
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 256 * 1024;

function redact(text) {
  return String(text == null ? '' : text)
    .replace(/(device_code|user_code|access_token|refresh_token|id_token|Authorization|Bearer|identityToken|RpsTicket)(["':=\s]+)([A-Za-z0-9._~+/=;-]{6,})/gi, '$1$2[redacted]')
    .replace(/XBL3\.0 x=[^"'\s]+/g, 'XBL3.0 [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[jwt redacted]');
}

class AuthLog {
  constructor(dir, { name = 'auth.log', now = () => new Date(), meta = {} } = {}) {
    this.dir = dir;
    this.file = path.join(dir, name);
    this.now = now;
    this.meta = meta;
  }

  write(level, message, extra) {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      try {
        if (fs.statSync(this.file).size > MAX_BYTES) fs.renameSync(this.file, `${this.file}.old`);
      } catch { /* no log yet */ }
      const parts = [`${this.now().toISOString()} ${level.toUpperCase().padEnd(5)} ${redact(message)}`];
      if (extra !== undefined) {
        const e = extra instanceof Error ? `${extra.name}: ${extra.message}${extra.code ? ` [${extra.code}]` : ''}\n${extra.stack || ''}` : typeof extra === 'string' ? extra : JSON.stringify(extra);
        parts.push(redact(e));
      }
      fs.appendFileSync(this.file, `${parts.join(' | ').replace(/\n/g, '\n    ')}\n`);
    } catch { /* logging must never break sign-in */ }
  }

  info(m, x) { this.write('info', m, x); }
  warn(m, x) { this.write('warn', m, x); }
  error(m, x) { this.write('error', m, x); }

  /** Header written once per app start: versions and platform only. */
  header(info) {
    this.write('info', `--- session start ${Object.entries({ ...this.meta, ...info }).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }
}

module.exports = { AuthLog, redact };
