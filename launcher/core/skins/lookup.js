'use strict';
// Loads another player's public skin by Minecraft username or UUID using
// Mojang's public profile APIs (no sign-in needed).
const { validateSkin, validateCape } = require('./png');

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;
const TEXTURE_HOSTS = /^https?:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/i;

/** 'name' | 'uuid' plus the cleaned value, or throws a friendly error. */
function parseQuery(q) {
  const s = String(q || '').trim();
  if (UUID_RE.test(s)) return { kind: 'uuid', value: s.replace(/-/g, '').toLowerCase() };
  if (NAME_RE.test(s)) return { kind: 'name', value: s };
  throw new Error('Enter a Minecraft username (3–16 letters, numbers or _) or a UUID.');
}

/** Reads the textures property of a session-server profile. */
function parseTextures(profile) {
  const prop = (profile && profile.properties || []).find((p) => p.name === 'textures');
  if (!prop) return { skinUrl: null, capeUrl: null, model: 'classic' };
  const t = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
  const skin = t.textures && t.textures.SKIN;
  const cape = t.textures && t.textures.CAPE;
  const fix = (u) => (u ? String(u).replace(/^http:/, 'https:') : null);
  return {
    skinUrl: fix(skin && skin.url),
    capeUrl: fix(cape && cape.url),
    model: skin && skin.metadata && skin.metadata.model === 'slim' ? 'slim' : 'classic',
  };
}

function dashed(id) { return id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'); }

/**
 * @param {string} query username or UUID
 * @param {{fetch?: typeof fetch}} [opts]
 */
async function lookupSkin(query, { fetch: f = globalThis.fetch } = {}) {
  const q = parseQuery(query);
  let id = q.value;
  if (q.kind === 'name') {
    const r = await f(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(q.value)}`);
    if (r.status === 404 || r.status === 204) throw new Error(`No Minecraft player is called ${q.value}.`);
    if (!r.ok) throw new Error(`Mojang lookup failed (HTTP ${r.status}). Try again in a minute.`);
    id = (await r.json()).id;
  }
  const r = await f(`https://sessionserver.mojang.com/session/minecraft/profile/${id}?unsigned=true`);
  if (r.status === 404 || r.status === 204) throw new Error('No Minecraft player has that UUID.');
  if (!r.ok) throw new Error(`Mojang profile lookup failed (HTTP ${r.status}). Try again in a minute.`);
  const profile = await r.json();
  const tex = parseTextures(profile);
  const out = { uuid: dashed(profile.id || id), name: profile.name || q.value, model: tex.model, skin: null, cape: null, defaultSkin: !tex.skinUrl };
  if (tex.skinUrl && TEXTURE_HOSTS.test(tex.skinUrl)) {
    const s = await f(tex.skinUrl);
    if (!s.ok) throw new Error('Could not download that skin.');
    const buf = Buffer.from(await s.arrayBuffer());
    const info = validateSkin(buf);
    out.skin = `data:image/png;base64,${buf.toString('base64')}`;
    out.legacy = info.legacy;
  }
  if (tex.capeUrl && TEXTURE_HOSTS.test(tex.capeUrl)) {
    try {
      const c = await f(tex.capeUrl);
      const buf = Buffer.from(await c.arrayBuffer());
      validateCape(buf);
      out.cape = `data:image/png;base64,${buf.toString('base64')}`;
    } catch { /* cape is optional */ }
  }
  if (!out.skin) throw new Error(`${out.name} uses a default skin (Steve/Alex), so there is nothing to load.`);
  return out;
}

module.exports = { lookupSkin, parseQuery, parseTextures };
