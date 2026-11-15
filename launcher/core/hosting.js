'use strict';
// "Host world": share an open-to-LAN singleplayer world through e4mc, which
// gives the world a public address (xxxx.e4mc.link) with no port forwarding.
// Also helpers for local dedicated servers (Paper/Purpur instances).
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const E4MC = { projectId: 'qANg5Jrr', slug: 'e4mc', title: 'e4mc', url: 'https://modrinth.com/mod/e4mc' };
const VOICE_CHAT = { projectId: '9eGKb6K1', slug: 'simple-voice-chat', title: 'Simple Voice Chat', url: 'https://modrinth.com/plugin/simple-voice-chat' };
const HOST_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

/** Finds the public join address in an e4mc log or chat line. */
function parseJoinAddress(line) {
  const s = String(line || '');
  let m = /Domain assigned:\s*([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/i.exec(s);
  if (!m) m = /hosted on domain \[?([a-z0-9][a-z0-9.-]*\.e4mc\.link)\]?/i.exec(s);
  if (!m) m = /\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.e4mc\.link)\b/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}

/** Detects the world being closed / LAN stopping so the address can be cleared. */
function parseHostStopped(line) {
  return /Stopping server|Stopping singleplayer server|e4mc.*(closed|disconnected)/i.test(String(line || ''));
}

function hasMod(instance, projectId, slugHint) {
  return (instance.mods || []).some((m) => m.projectId === projectId || (slugHint && String(m.file || '').toLowerCase().startsWith(slugHint)));
}

function canHost(instance) {
  if (!instance) return { ok: false, reason: 'Pick an instance first.' };
  if (instance.type === 'server') return { ok: true, kind: 'server' };
  if (!HOST_LOADERS.includes(instance.loader)) return { ok: false, reason: 'World hosting needs a Fabric, Quilt, Forge or NeoForge instance (e4mc is a mod).' };
  return { ok: true, kind: 'e4mc' };
}

/** LAN IPv4 addresses for "friends on the same Wi-Fi". */
function lanAddresses(ifaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  }
  return out;
}

async function serverPort(instanceDir) {
  try {
    const txt = await fsp.readFile(path.join(instanceDir, 'server.properties'), 'utf8');
    const m = /^server-port\s*=\s*(\d+)/m.exec(txt);
    return m ? Number(m[1]) : 25565;
  } catch { return 25565; }
}

module.exports = { E4MC, VOICE_CHAT, HOST_LOADERS, parseJoinAddress, parseHostStopped, hasMod, canHost, lanAddresses, serverPort };
