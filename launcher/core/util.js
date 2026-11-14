'use strict';
const fsp = require('fs/promises');

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function readJsonSafe(file, fallback = null) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}

/** Redacts anything that looks like a bearer token or API key from log text. */
function redact(text) {
  return String(text)
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/g, '$1[redacted]')
    .replace(/(--accessToken\s+)\S+/g, '$1[redacted]')
    .replace(/xai-[A-Za-z0-9]{10,}/g, 'xai-[redacted]')
    .replace(/(x-api-key["':\s]+)[^\s"',}]+/gi, '$1[redacted]');
}

module.exports = { exists, readJsonSafe, redact };
