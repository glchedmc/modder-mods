'use strict';
// "Host world": share an open-to-LAN world (or a dedicated server) with friends.
// Providers: Direct (free) P2P invite codes over WebRTC (see core/p2p), Tailscale,
// own IP / port forwarding (UPnP, see core/upnp.js) and e4mc quick links.
// Also writes Simple Voice Chat's voice_host for the chosen provider.
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
  if (!HOST_LOADERS.includes(instance.loader)) return { ok: false, reason: 'World hosting needs a Fabric, Quilt, Forge or NeoForge instance (voice chat and e4mc are mods).' };
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

// ---------- providers ----------
const PROVIDERS = {
  p2p: { id: 'p2p', label: 'Direct (free)', voice: true, recommended: true, blurb: 'Peer-to-peer like Essential. Swap invite codes, no setup.' },
  tailscale: { id: 'tailscale', label: 'Tailscale', voice: true, blurb: 'Private network. Works with voice, no port forwarding.' },
  direct: { id: 'direct', label: 'Own IP / port forward', voice: true, blurb: 'Your public IP or DNS name. UPnP or router setup.' },
  e4mc: { id: 'e4mc', label: 'e4mc quick link', voice: false, blurb: 'Instant public address. No voice chat.' },
};
const DEFAULT_PROVIDER = 'p2p';
const MC_PORT = 25565;
const VOICE_PORT = 24454;

/** "Started serving on 34567" (vanilla) / "Local game hosted on port 34567" (chat). */
function parseLanPort(line) {
  const m = /(?:Started serving on|hosted on port)\s+(\d{2,5})/i.exec(String(line || ''));
  return m ? Number(m[1]) : null;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function isPrivateIp(ip) {
  const m = IPV4.exec(String(ip || ''));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
/** RFC 6598 shared address space used by carrier-grade NAT (and by Tailscale). */
function isCgnatIp(ip) {
  const m = IPV4.exec(String(ip || ''));
  return Boolean(m) && Number(m[1]) === 100 && Number(m[2]) >= 64 && Number(m[2]) <= 127;
}

/**
 * Whether port forwarding can work: the router's WAN address must be the
 * public address. Otherwise the ISP shares one IP between customers (CGNAT).
 */
function natVerdict({ publicIp, routerIp }) {
  if (!routerIp) return { cgnat: false, known: false };
  const cgnat = isCgnatIp(routerIp) || isPrivateIp(routerIp) || (publicIp && routerIp !== publicIp);
  return { cgnat: Boolean(cgnat), known: true };
}

/** Plain-English router steps when UPnP is off or unsupported. */
function routerSteps({ localIp, mcPort = MC_PORT, voicePort = VOICE_PORT, gateway } = {}) {
  return [
    `Open your router page${gateway ? ` (usually http://${gateway})` : ' (often http://192.168.1.1 or http://192.168.0.1)'} and sign in.`,
    'Find Port Forwarding (sometimes under NAT, Virtual Server or Gaming).',
    `Add TCP ${mcPort} → ${localIp || 'this computer'} port ${mcPort} (Minecraft).`,
    `Add UDP ${voicePort} → ${localIp || 'this computer'} port ${voicePort} (Simple Voice Chat).`,
    'Save, then give friends your public IP or DNS name below.',
    'Set this computer to a fixed (reserved) IP in the router so the rule keeps working.',
  ];
}

const DDNS_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
function cleanDdnsName(name) {
  const s = String(name || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (!s) return '';
  if (!DDNS_RE.test(s)) throw new Error('That does not look like a host name (e.g. myworld.duckdns.org).');
  return s;
}
function duckdnsSubdomain(name) {
  const m = /^([a-z0-9-]+)\.duckdns\.org$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : null;
}

/** The address friends type into Minecraft for a provider. */
function joinAddressFor(provider, { publicIp, ddnsName, tailscale, mcPort = MC_PORT, e4mcAddress, p2pLocalPort } = {}) {
  const withPort = (h) => (h ? (mcPort === MC_PORT ? h : `${h}:${mcPort}`) : null);
  switch (provider) {
    case 'direct': return withPort(ddnsName || publicIp || null);
    case 'tailscale': return withPort(tailscale && (tailscale.dnsName || tailscale.ip4) || null);
    case 'e4mc': return e4mcAddress || null;
    case 'p2p': return `localhost${p2pLocalPort && p2pLocalPort !== MC_PORT ? `:${p2pLocalPort}` : ''}`;
    default: return null;
  }
}

/**
 * voice_host for Simple Voice Chat's voicechat-server.properties. Blank means
 * "the address the player joined with", which is right for LAN, Direct (P2P:
 * joiners connect through their local tunnel at localhost) and e4mc (no voice).
 */
function voiceHostFor(provider, { publicIp, ddnsName, tailscale, voicePort = VOICE_PORT } = {}) {
  switch (provider) {
    case 'direct': { const h = ddnsName || publicIp; return h ? `${h}:${voicePort}` : ''; }
    case 'tailscale': { const h = tailscale && (tailscale.dnsName || tailscale.ip4); return h ? `${h}:${voicePort}` : ''; }
    default: return '';
  }
}

// ---------- Simple Voice Chat server config ----------
/** Where voicechat-server.properties lives for an instance. */
function voiceConfigPath(instance, dir) {
  if (instance.type === 'server' && instance.loader !== 'fabric-server') return path.join(dir, 'plugins', 'voicechat', 'voicechat-server.properties');
  return path.join(dir, 'config', 'voicechat', 'voicechat-server.properties');
}

function parseProperties(txt) {
  const out = {};
  for (const line of String(txt || '').split(/\r?\n/)) {
    if (!line.trim() || /^\s*[#!]/.test(line)) continue;
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** Sets keys in a .properties text, keeping comments and other keys. */
function setProperties(txt, values) {
  const lines = String(txt || '').split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const left = { ...values };
  const out = lines.map((line) => {
    if (/^\s*[#!]/.test(line)) return line;
    const i = line.indexOf('=');
    if (i <= 0) return line;
    const k = line.slice(0, i).trim();
    if (k in left) { const v = left[k]; delete left[k]; return `${k}=${v}`; }
    return line;
  });
  for (const [k, v] of Object.entries(left)) out.push(`${k}=${v}`);
  return `${out.join('\n')}\n`;
}

async function readVoiceConfig(instance, dir) {
  const file = voiceConfigPath(instance, dir);
  try {
    const p = parseProperties(await fsp.readFile(file, 'utf8'));
    return { file, exists: true, port: Number(p.port) > 0 ? Number(p.port) : VOICE_PORT, voiceHost: p.voice_host || '' };
  } catch { return { file, exists: false, port: VOICE_PORT, voiceHost: '' }; }
}

async function writeVoiceConfig(instance, dir, { voiceHost = '', port } = {}) {
  const file = voiceConfigPath(instance, dir);
  let txt = '';
  try { txt = await fsp.readFile(file, 'utf8'); } catch { txt = '# Simple Voice Chat server config (voice_host set by Saturn Host World)\n'; }
  const cur = parseProperties(txt);
  const values = { voice_host: voiceHost };
  if (port) values.port = port;
  else if (!cur.port) values.port = VOICE_PORT;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, setProperties(txt, values));
  return readVoiceConfig(instance, dir);
}

module.exports = {
  E4MC, VOICE_CHAT, HOST_LOADERS, PROVIDERS, DEFAULT_PROVIDER, MC_PORT, VOICE_PORT,
  parseJoinAddress, parseHostStopped, parseLanPort, hasMod, canHost, lanAddresses, serverPort,
  isPrivateIp, isCgnatIp, natVerdict, routerSteps, cleanDdnsName, duckdnsSubdomain, joinAddressFor, voiceHostFor,
  voiceConfigPath, parseProperties, setProperties, readVoiceConfig, writeVoiceConfig,
};
