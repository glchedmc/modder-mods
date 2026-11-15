'use strict';
// Reads gathered ICE candidates to guess whether UDP hole punching can work.
// Each STUN server reports the public address:port our socket appears as. If
// the port changes depending on which server we asked, the NAT is "symmetric"
// (endpoint-dependent mapping) and direct connections usually fail.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const MESSAGES = {
  open: 'Your computer has a public address. Direct connections should work.',
  cone: 'Your network allows direct connections.',
  symmetric: 'Your router or ISP uses strict (symmetric) NAT, so a direct connection will probably fail unless your friend\'s network is open. Use Tailscale or your own IP instead.',
  blocked: 'UDP to the internet looks blocked (no STUN reply). Direct mode needs UDP. Use Tailscale or your own IP instead.',
  unknown: 'Could not fully test your network. Direct mode may still work.',
};

/**
 * @param {Array<{type:string,address?:string,port?:number,relatedAddress?:string,relatedPort?:number,protocol?:string,url?:string}>} cands
 */
function classifyNat(cands = []) {
  const udp = cands.filter((c) => !c.protocol || String(c.protocol).toLowerCase() === 'udp');
  const host = udp.filter((c) => c.type === 'host');
  const srflx = udp.filter((c) => c.type === 'srflx');
  if (!srflx.length) return { type: host.length ? 'blocked' : 'unknown', publicIp: null, message: host.length ? MESSAGES.blocked : MESSAGES.unknown };
  const publicIp = srflx[0].address || null;
  const hostIps = new Set(host.map((c) => c.address));
  if (srflx.every((c) => hostIps.has(c.address))) return { type: 'open', publicIp, message: MESSAGES.open };
  const byBase = new Map();
  for (const c of srflx) {
    const key = `${c.relatedAddress || '?'}:${c.relatedPort || '?'}`;
    if (!byBase.has(key)) byBase.set(key, new Set());
    byBase.get(key).add(`${c.address}:${c.port}`);
  }
  const symmetric = [...byBase.values()].some((set) => set.size > 1);
  if (symmetric) return { type: 'symmetric', publicIp, message: MESSAGES.symmetric };
  return { type: 'cone', publicIp, message: MESSAGES.cone };
}

/** Describes the selected candidate pair once connected. */
function describePair(local, remote) {
  const l = (local || '').toLowerCase();
  const r = (remote || '').toLowerCase();
  if (l === 'relay' || r === 'relay') return { kind: 'relay', label: 'Relayed' };
  if (l === 'host' && r === 'host') return { kind: 'lan', label: 'Direct · same network' };
  if (l || r) return { kind: 'p2p', label: 'Direct · peer-to-peer (hole punched)' };
  return { kind: 'unknown', label: 'Connected' };
}

const FAILED_MESSAGE = 'Could not connect directly. One of your networks blocks peer-to-peer (strict/symmetric NAT or a firewall). Try again on another network, or use Tailscale or your own IP for this friend.';

module.exports = { classifyNat, describePair, ICE_SERVERS, MESSAGES, FAILED_MESSAGE };
