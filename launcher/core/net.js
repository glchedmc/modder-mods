'use strict';
// Networking helpers: JSON fetch with retries, verified downloads, and a small
// concurrency pool. Uses the global fetch built into Node 18+ / Electron.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const USER_AGENT = 'glchedmc/saturn-client/0.1.3 (github.com/glchedmc/modder-mods)';

let fetchImpl = (...a) => globalThis.fetch(...a);
/** Tests can swap the fetch implementation. */
function setFetch(fn) { fetchImpl = fn; }

async function request(url, opts = {}, retries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        ...opts,
        headers: { 'User-Agent': USER_AGENT, ...(opts.headers || {}) },
      });
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        lastErr.status = res.status;
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  throw lastErr;
}

async function fetchJson(url, opts = {}) {
  const res = await request(url, opts);
  if (!res.ok) {
    let body = '';
    try { body = (await res.text()).slice(0, 400); } catch { /* ignore */ }
    const err = new Error(`HTTP ${res.status} for ${url}${body ? `: ${body}` : ''}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

async function sha1File(file) {
  const hash = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

/**
 * Download url to dest. Skips the download if dest already exists and matches
 * sha1 (or size when no hash is known). Verifies sha1 after downloading.
 */
async function download(url, dest, { sha1, size, onBytes, headers, quick } = {}) {
  if (await exists(dest)) {
    if (quick && size) {
      const st = await fsp.stat(dest);
      if (st.size === size) return { skipped: true };
    } else if (sha1) {
      if ((await sha1File(dest)) === sha1) return { skipped: true };
    } else if (size) {
      const st = await fsp.stat(dest);
      if (st.size === size) return { skipped: true };
    } else {
      return { skipped: true };
    }
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const res = await request(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const tmp = `${dest}.part-${process.pid}-${Date.now()}`;
  const hash = crypto.createHash('sha1');
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => { hash.update(chunk); if (onBytes) onBytes(chunk.length); });
  await pipeline(body, fs.createWriteStream(tmp));
  const got = hash.digest('hex');
  if (sha1 && got !== sha1) {
    await fsp.rm(tmp, { force: true });
    throw new Error(`SHA-1 mismatch for ${url}: expected ${sha1}, got ${got}`);
  }
  await fsp.rename(tmp, dest);
  return { skipped: false, sha1: got };
}

/** Run async task fn over items with at most `limit` in flight. */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Download a list of {url, path, sha1, size} with progress callbacks.
 * onProgress({done, total, bytes}) is called after each file.
 */
async function downloadAll(files, { concurrency = 12, onProgress } = {}) {
  let done = 0;
  let bytes = 0;
  const total = files.length;
  await pool(files, concurrency, async (f) => {
    await download(f.url, f.path, { sha1: f.sha1, size: f.size, quick: f.quick, onBytes: (n) => { bytes += n; } });
    done++;
    if (onProgress) onProgress({ done, total, bytes });
  });
  return { done, total, bytes };
}

module.exports = { USER_AGENT, setFetch, request, fetchJson, download, downloadAll, pool, sha1File, exists };
