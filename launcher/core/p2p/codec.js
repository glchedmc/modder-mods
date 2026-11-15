'use strict';
// Invite / reply codes for Direct (free) hosting. A code is the WebRTC SDP
// (with all ICE candidates already gathered) plus a little metadata, deflated
// and base64url-encoded, so two players can connect by pasting codes: no
// signaling server is involved.
const zlib = require('zlib');

const PREFIX = { offer: 'SATURN-INVITE-', answer: 'SATURN-REPLY-' };
const VERSION = 1;
const MAX_CODE = 24000;

function encode(kind, { sdp, ...meta }) {
  if (!PREFIX[kind]) throw new Error(`Unknown code kind ${kind}`);
  if (!/^v=0/.test(String(sdp || ''))) throw new Error('Missing session description');
  const json = JSON.stringify({ v: VERSION, k: kind === 'offer' ? 'o' : 'a', s: sdp, m: meta });
  return PREFIX[kind] + zlib.deflateRawSync(Buffer.from(json), { level: 9 }).toString('base64url');
}

/** Decodes a pasted code; tolerates whitespace, line breaks and quotes. */
function decode(code, expect) {
  const clean = String(code || '').replace(/[\s"'`<>]/g, '');
  if (!clean) throw new Error('Paste a code first.');
  if (clean.length > MAX_CODE) throw new Error('That code is too long.');
  const kind = clean.startsWith(PREFIX.offer) ? 'offer' : clean.startsWith(PREFIX.answer) ? 'answer' : null;
  if (!kind) throw new Error('That is not a Saturn Client invite or reply code.');
  if (expect && kind !== expect) throw new Error(expect === 'offer' ? 'That is a reply code. Paste the invite code your friend sent you.' : 'That is an invite code. Paste the reply code your friend sent back.');
  let obj;
  try {
    obj = JSON.parse(zlib.inflateRawSync(Buffer.from(clean.slice(PREFIX[kind].length), 'base64url')).toString('utf8'));
  } catch {
    throw new Error('That code is incomplete or damaged. Copy it again in full.');
  }
  if (!obj || obj.v !== VERSION || !/^v=0/.test(String(obj.s || ''))) throw new Error('That code is from a different Saturn Client version.');
  return { kind, sdp: obj.s, ...(obj.m || {}) };
}

module.exports = { encode, decode, PREFIX, VERSION };
