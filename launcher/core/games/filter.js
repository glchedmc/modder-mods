'use strict';
// "No killing games" filter for the Games tab: keeps driving, sports, casual,
// family and party / co-op games; hides violent, shooter, horror and adult ones.
// Data comes from Steam's public store (appdetails + the store page's user tags),
// cached on disk. No Steam login or API key.
const fsp = require('fs/promises');
const path = require('path');

// Steam content descriptor ids.
const DESCRIPTORS = { 1: 'Some nudity or sexual content', 2: 'Frequent violence or gore', 3: 'Adult only sexual content', 4: 'Frequent nudity or sexual content', 5: 'General mature content' };
const BLOCK_DESCRIPTORS = new Set([1, 2, 3, 4]);

const BLOCK_WORDS = /\b(shooters?|fps|gore|gory|violent|violence|horror|survival|battle royale|zombies?|blood|gun ?play|psychological horror)\b/i;
const ALLOW_WORDS = /\b(racing|driving|automobile sim|motorsport|motocross|sports?|casual|simulation|family friendly|party|party game|local multiplayer|local co-?op|split screen|couch co-?op|4 player local|arcade|puzzle|cute|relaxing|cozy|farming sim)\b/i;
// Steam store categories that mean "play together".
const PARTY_CATEGORIES = new Set([9, 24, 37, 38, 39, 44, 47, 48]);
// Driving titles that pass even with no Steam data (e.g. not sold on Steam, or offline).
const DRIVING_NAMES = /\b(live for speed|gran turismo|assetto corsa|beamng|forza|dirt rally|wreckfest|trackmania|rfactor|iracing|automobilista|project cars|need for speed|euro truck simulator|american truck simulator|f1 ?(?:\d{2,4})?|motogp|snowrunner|mudrunner|rocket league)\b/i;

/** Lowercased, de-duplicated list of strings. */
function norm(list) { return [...new Set((list || []).map((s) => String(s || '').trim()).filter(Boolean))]; }

/**
 * Decides whether a game passes the filter.
 * meta: {genres[], categories:[{id, description}], descriptors:[ids], tags[]} or null when unknown.
 * lists: {allow:Set|Array, block:Set|Array} of game ids picked by the user.
 * Returns {show, reason, source} where source is user | blocked | allowed | unknown | default.
 */
function classify(game, meta, lists = {}) {
  const allow = new Set(lists.allow || []);
  const block = new Set(lists.block || []);
  if (block.has(game.id)) return { show: false, reason: 'Hidden by you', source: 'user' };
  if (allow.has(game.id)) return { show: true, reason: 'Always shown (your pick)', source: 'user' };
  if (game.source === 'manual') return { show: true, reason: 'Added by you', source: 'user' };

  if (!meta) {
    if (DRIVING_NAMES.test(game.name || '')) return { show: true, reason: 'Driving game', source: 'allowed' };
    return { show: true, reason: 'No Steam store info yet, shown until it loads', source: 'unknown' };
  }

  const descriptors = (meta.descriptors || []).map(Number);
  const badDesc = descriptors.find((d) => BLOCK_DESCRIPTORS.has(d));
  if (badDesc) return { show: false, reason: DESCRIPTORS[badDesc], source: 'blocked' };

  const words = norm([...(meta.genres || []), ...(meta.tags || [])]);
  const badWord = words.find((w) => BLOCK_WORDS.test(w));
  if (badWord) return { show: false, reason: `Tagged ${badWord}`, source: 'blocked' };

  if (DRIVING_NAMES.test(game.name || '')) return { show: true, reason: 'Driving game', source: 'allowed' };
  const good = words.find((w) => ALLOW_WORDS.test(w));
  if (good) return { show: true, reason: good, source: 'allowed' };
  const party = (meta.categories || []).find((c) => PARTY_CATEGORIES.has(Number(c.id)));
  if (party) return { show: true, reason: party.description || 'Co-op / party', source: 'allowed' };

  if (meta.partial) return { show: true, reason: 'Steam store info incomplete, shown', source: 'unknown' };
  return { show: false, reason: 'Not a driving, sports, casual or party game', source: 'default' };
}

/** appdetails JSON → {genres, categories, descriptors}; null if Steam says no such app. */
function parseAppDetails(json, appid) {
  const entry = json && json[String(appid)];
  if (!entry || !entry.success || !entry.data) return null;
  const d = entry.data;
  const cd = d.content_descriptors || {};
  return {
    name: d.name || null,
    genres: norm((d.genres || []).map((g) => g.description)),
    categories: (d.categories || []).map((c) => ({ id: Number(c.id), description: String(c.description || '') })),
    descriptors: (cd.ids || []).map(Number).filter(Number.isFinite),
    descriptorNotes: cd.notes || null,
  };
}

/** User tags from a store page's HTML (the "app_tag" links). */
function parseStoreTags(html) {
  const out = [];
  const re = /class="app_tag"[^>]*>\s*([^<]+?)\s*</g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const t = m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    if (t && t !== '+') out.push(t);
  }
  return norm(out).slice(0, 25);
}

const TTL = 30 * 86400e3;

class SteamMetaCache {
  /** @param {{dir: string, fetch?: Function, now?: () => number, timeoutMs?: number}} opts */
  constructor({ dir, fetch, now, timeoutMs = 8000 } = {}) {
    this.dir = dir;
    this.fetch = fetch || ((...a) => globalThis.fetch(...a));
    this.now = now || Date.now;
    this.timeoutMs = timeoutMs;
    this.inflight = new Map();
    this.offlineUntil = 0;
  }

  file(appid) { return path.join(this.dir, `${String(appid).replace(/\D/g, '')}.json`); }

  /** Cached metadata (even stale), or null. */
  async cached(appid) {
    try { return JSON.parse(await fsp.readFile(this.file(appid), 'utf8')); } catch { return null; }
  }

  async get(appid, { maxAge = TTL } = {}) {
    const c = await this.cached(appid);
    if (c && this.now() - (c.fetchedAt || 0) < maxAge) return c;
    if (this.now() < this.offlineUntil) return c; // store unreachable a moment ago: use what we have
    const id = String(appid);
    if (!this.inflight.has(id)) this.inflight.set(id, this.download(id).finally(() => this.inflight.delete(id)));
    const fresh = await this.inflight.get(id);
    return fresh || c;
  }

  async getJson(url, asText) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'SaturnClient', Cookie: 'birthtime=0; lastagecheckage=1-0-1990; wants_mature_content=1', 'Accept-Language': 'en' } });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      return asText ? await res.text() : await res.json();
    } finally { clearTimeout(t); }
  }

  /** Downloads appdetails (+ store page tags). Returns null when the store can't be reached. */
  async download(appid) {
    let details;
    try {
      details = parseAppDetails(await this.getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`), appid);
    } catch (e) {
      // Offline, timed out or rate-limited: back off and show games unfiltered.
      this.offlineUntil = this.now() + (e.status === 429 ? 5 * 60e3 : 60e3);
      return null;
    }
    const meta = details ? { ...details, tags: [], partial: false } : { name: null, genres: [], categories: [], descriptors: [], tags: [], partial: true, missing: true };
    if (details) {
      try { meta.tags = parseStoreTags(await this.getJson(`https://store.steampowered.com/app/${appid}/?l=english`, true)); } catch { meta.partial = true; }
    }
    meta.fetchedAt = this.now();
    try {
      await fsp.mkdir(this.dir, { recursive: true });
      await fsp.writeFile(this.file(appid), JSON.stringify(meta));
    } catch { /* read-only cache: still use it this run */ }
    return meta;
  }
}

/** Runs fn over items with limited concurrency. */
async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) { const it = queue.shift(); try { await fn(it); } catch { /* per-item */ } }
  }));
}

module.exports = { classify, parseAppDetails, parseStoreTags, SteamMetaCache, pool, DESCRIPTORS, BLOCK_WORDS, ALLOW_WORDS, DRIVING_NAMES, PARTY_CATEGORIES };
