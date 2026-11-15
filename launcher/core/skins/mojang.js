'use strict';
// Minecraft services skin and cape endpoints (needs a signed-in Microsoft account).
// https://wiki.vg/Mojang_API#Upload_Skin
const { request } = require('../net');

const BASE = 'https://api.minecraftservices.com/minecraft/profile';

async function call(token, url, opts = {}) {
  const res = await request(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } }, 1);
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (res.status === 401) throw Object.assign(new Error('Your Minecraft session expired. Sign in again.'), { code: 'SIGNED_OUT' });
  if (!res.ok) throw Object.assign(new Error((body && (body.errorMessage || body.error)) || `Minecraft services HTTP ${res.status}`), { status: res.status });
  return body;
}

/** {id, name, skins:[{id,url,variant,state}], capes:[{id,url,alias,state}]} */
function profile(token) { return call(token, BASE); }

async function uploadSkin(token, png, variant = 'classic') {
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([png], { type: 'image/png' }), 'skin.png');
  return call(token, `${BASE}/skins`, { method: 'POST', body: form });
}

function showCape(token, capeId) {
  if (!capeId) return call(token, `${BASE}/capes/active`, { method: 'DELETE' });
  return call(token, `${BASE}/capes/active`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId }) });
}

module.exports = { profile, uploadSkin, showCape, BASE };
