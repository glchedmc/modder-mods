'use strict';
// The Games tab's data: installed Steam games (local files only), games the
// user added by hand, favorites, and cached artwork.
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const steam = require('./steam');
const { classify, SteamMetaCache, pool } = require('./filter');
const { readJsonSafe, exists } = require('../util');

const STATE_FILE = 'games.json';
const ART_DIR = 'game-art';
const MAX_ART = 8 * 1024 * 1024;

class GameLibrary {
  /** @param {{dataDir: string, cacheDir: string, fetch?: Function, steamOptions?: object}} opts */
  constructor({ dataDir, cacheDir, fetch, steamOptions, metaWaitMs = 6000 } = {}) {
    this.metaWaitMs = metaWaitMs;
    this.file = path.join(dataDir, STATE_FILE);
    this.artDir = path.join(cacheDir, ART_DIR);
    this.fetch = fetch || ((...a) => globalThis.fetch(...a));
    this.steamOptions = steamOptions || {};
    this.lastSteam = null;
    this.meta = new SteamMetaCache({ dir: path.join(cacheDir, 'steam-meta'), fetch: this.fetch, timeoutMs: opts_timeout(steamOptions) });
    this.metaJob = null;
  }

  async state() {
    const s = await readJsonSafe(this.file, {});
    const ids = (a) => (Array.isArray(a) ? a.map(String) : []);
    return { favorites: ids(s.favorites), manual: Array.isArray(s.manual) ? s.manual : [], lastPlayed: s.lastPlayed && typeof s.lastPlayed === 'object' ? s.lastPlayed : {}, allow: ids(s.allow), block: ids(s.block) };
  }

  async save(state) {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2));
    await fsp.rename(tmp, this.file);
  }

  /** Fetches missing Steam store info in the background; resolves when done. */
  refreshMeta(appids) {
    if (this.metaJob) return this.metaJob;
    this.metaJob = pool(appids, 3, (id) => this.meta.get(id)).finally(() => { this.metaJob = null; });
    return this.metaJob;
  }

  /**
   * Every game: Steam installs plus manual ones, with favorite flags, cached art
   * and the family filter's verdict ({show, reason, source}). With filter on,
   * hidden games are left out of `games` and counted in `hiddenCount`.
   */
  async list({ filter = false } = {}) {
    const st = await this.state();
    let found = { installed: false, roots: [], libraries: [], games: [] };
    try { found = await steam.listGames(this.steamOptions); } catch { /* unreadable Steam folder */ }
    this.lastSteam = found;
    const fav = new Set(st.favorites);
    const all = [];
    for (const g of found.games) {
      all.push({ ...g, favorite: fav.has(g.id), art: await this.cachedArt(g.appid), lastPlayed: st.lastPlayed[g.id] || g.lastPlayed || null });
    }
    for (const m of st.manual) {
      all.push({ id: m.id, source: 'manual', name: m.name, path: m.path, sizeBytes: 0, installed: await exists(m.path), favorite: fav.has(m.id), art: null, lastPlayed: st.lastPlayed[m.id] || null, addedAt: m.addedAt });
    }

    // Store info: cached right away; missing ones fetched (bounded wait), the rest keep loading in the background.
    let metaPending = 0;
    if (filter) {
      const metas = new Map();
      const missing = [];
      for (const g of all) {
        if (g.source !== 'steam') continue;
        const c = await this.meta.cached(g.appid);
        if (c) metas.set(g.appid, c); else missing.push(g.appid);
      }
      if (missing.length) {
        const job = this.refreshMeta(missing);
        await Promise.race([job, new Promise((r) => setTimeout(r, this.metaWaitMs))]);
        for (const id of missing) { const c = await this.meta.cached(id); if (c) metas.set(id, c); else metaPending++; }
        if (this.meta.now() < this.meta.offlineUntil) metaPending = 0; // store unreachable: show them, don't spin
      }
      for (const g of all) g.filter = classify(g, g.source === 'steam' ? metas.get(g.appid) || null : null, st);
    } else {
      for (const g of all) g.filter = classify(g, g.source === 'steam' ? await this.meta.cached(g.appid) : null, st);
    }
    const games = filter ? all.filter((g) => g.filter.show) : all;
    const hidden = filter ? all.filter((g) => !g.filter.show).map((g) => ({ id: g.id, name: g.name, reason: g.filter.reason })) : [];
    return { steamInstalled: found.installed, steamRoots: found.roots, libraries: found.libraries, games, filter: Boolean(filter), hiddenCount: hidden.length, hidden, metaPending, storeOffline: this.meta.now() < this.meta.offlineUntil };
  }

  /** Explicit per-game choice: 'show' (always), 'hide' (never), or 'auto' (filter decides). */
  async setVisibility(id, mode) {
    const st = await this.state();
    const key = String(id);
    st.allow = st.allow.filter((x) => x !== key);
    st.block = st.block.filter((x) => x !== key);
    if (mode === 'show') st.allow.push(key);
    else if (mode === 'hide') st.block.push(key);
    else if (mode !== 'auto') throw new Error('Unknown visibility');
    await this.save(st);
    return { allow: st.allow, block: st.block };
  }

  async setFavorite(id, on) {
    const st = await this.state();
    const fav = new Set(st.favorites);
    if (on) fav.add(String(id)); else fav.delete(String(id));
    st.favorites = [...fav];
    await this.save(st);
    return st.favorites;
  }

  /** Adds a non-Steam game: any executable, script or .app bundle. */
  async addManual({ name, path: exe }) {
    const p = String(exe || '');
    if (!p || !path.isAbsolute(p)) throw new Error('Pick the game’s executable or app.');
    if (!(await exists(p))) throw new Error('That file no longer exists.');
    const st = await this.state();
    const existing = st.manual.find((m) => m.path === p);
    if (existing) return existing;
    const clean = String(name || '').trim().slice(0, 80) || path.basename(p).replace(/\.(app|exe|sh|x86_64|AppImage)$/i, '');
    const entry = { id: `manual:${crypto.randomBytes(6).toString('hex')}`, name: clean, path: p, addedAt: new Date().toISOString() };
    st.manual.push(entry);
    await this.save(st);
    return entry;
  }

  async removeManual(id) {
    const st = await this.state();
    st.manual = st.manual.filter((m) => m.id !== id);
    st.favorites = st.favorites.filter((f) => f !== id);
    await this.save(st);
    return true;
  }

  async renameManual(id, name) {
    const st = await this.state();
    const m = st.manual.find((x) => x.id === id);
    if (!m) throw new Error('Game not found.');
    m.name = String(name || '').trim().slice(0, 80) || m.name;
    await this.save(st);
    return m;
  }

  /** What to open for Play: a steam:// URL or a manual game's path. Records last played. */
  async launchTarget(id) {
    const st = await this.state();
    let target = null;
    if (/^steam:\d+$/.test(id)) target = { kind: 'url', url: steam.runUrl(id.slice(6)) };
    else {
      const m = st.manual.find((x) => x.id === id);
      if (!m) throw new Error('Game not found.');
      if (!(await exists(m.path))) throw new Error(`${m.name} isn’t at ${m.path} anymore.`);
      target = { kind: 'path', path: m.path };
    }
    st.lastPlayed[id] = Date.now();
    await this.save(st);
    return target;
  }

  storeTarget(id) {
    if (!/^steam:\d+$/.test(id)) throw new Error('Only Steam games open in Steam.');
    return { kind: 'url', url: steam.storeUrl(id.slice(6)) };
  }

  artFile(appid, kind) { return path.join(this.artDir, `${String(appid).replace(/\D/g, '')}_${kind}.jpg`); }

  /** Already-cached art for an app (file name inside the art dir), or null. */
  async cachedArt(appid) {
    for (const kind of ['library_600x900', 'header']) {
      if (await exists(this.artFile(appid, kind))) return path.basename(this.artFile(appid, kind));
    }
    return null;
  }

  /**
   * Fetches and caches artwork for one app: Steam's local library cache first,
   * then the public Steam CDN (portrait library_600x900, falling back to header.jpg).
   * Returns the cached file name, or null when none exists (fallback tile).
   */
  async fetchArt(appid) {
    const id = String(appid).replace(/\D/g, '');
    if (!id) return null;
    const have = await this.cachedArt(id);
    if (have) return have;
    await fsp.mkdir(this.artDir, { recursive: true });
    const root = this.lastSteam && this.lastSteam.games.find((g) => g.appid === id) ? this.lastSteam.games.find((g) => g.appid === id).root : null;
    const { local, remote } = steam.artCandidates(id, root);
    for (const f of local) {
      try {
        const st = await fsp.stat(f);
        if (st.isFile() && st.size > 0 && st.size < MAX_ART) {
          const kind = /header/.test(f) ? 'header' : 'library_600x900';
          await fsp.copyFile(f, this.artFile(id, kind));
          return path.basename(this.artFile(id, kind));
        }
      } catch { /* not cached by Steam */ }
    }
    for (const url of remote) {
      try {
        const res = await this.fetch(url, { headers: { 'User-Agent': 'SaturnClient' } });
        if (!res.ok) continue;
        const type = String(res.headers.get('content-type') || '');
        if (!/image\//.test(type)) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_ART) continue;
        const kind = /header/.test(url) ? 'header' : 'library_600x900';
        await fsp.writeFile(this.artFile(id, kind), buf);
        return path.basename(this.artFile(id, kind));
      } catch { /* offline or blocked: fallback tile */ }
    }
    return null;
  }

  /** Resolves a cached art file name to its path, refusing anything outside the art dir. */
  artPath(name) {
    const base = path.basename(String(name || ''));
    if (!/^\d+_(library_600x900|header)\.jpg$/.test(base)) throw new Error('Bad art name');
    return path.join(this.artDir, base);
  }
}

function opts_timeout(o) { return (o && o.metaTimeoutMs) || 8000; }

module.exports = { GameLibrary };
