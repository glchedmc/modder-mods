'use strict';
// Nostr identity + NIP-44 / NIP-59 gift wrap for Saturn friends and chat.
// Chat uses NIP-17 (kind 14 rumors) so other Nostr DM apps can read it too.
const crypto = require('node:crypto');
const { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent, getEventHash, nip44, nip19 } = require('nostr-tools');

const KIND = {
  PROFILE: 0,
  SEAL: 13,
  CHAT: 14, // NIP-17 private direct message
  WRAP: 1059, // stored gift wrap (chat, friend requests, worlds)
  EPHEMERAL_WRAP: 21059, // same wrap in the ephemeral range: relays forward it live but don't store it
  SATURN: 24199, // rumor kind for Saturn app messages (presence, join signaling, worlds)
};
const TWO_DAYS = 2 * 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);
const randomPast = () => now() - crypto.randomInt(0, TWO_DAYS);

const toHex = (u8) => Buffer.from(u8).toString('hex');
const fromHex = (h) => {
  if (!/^[0-9a-f]{64}$/i.test(String(h || ''))) throw new Error('Bad key');
  return Uint8Array.from(Buffer.from(h, 'hex'));
};

function newIdentity() {
  const sk = generateSecretKey();
  return { secretHex: toHex(sk), pubkey: getPublicKey(sk) };
}
function identityFrom(secretHex) {
  const sk = fromHex(secretHex);
  return { sk, pubkey: getPublicKey(sk), npub: nip19.npubEncode(getPublicKey(sk)) };
}

// ---------- friend codes ----------
// Short code = 8 characters of the npub after "npub1", shown as SAT-XXXX-XXXX. It's a lookup hint only:
// the full key is always checked against the profile we find, and the npub can be shared instead.
const CODE_RE = /^(?:SAT-?)?([02-9ac-hj-np-z]{4})-?([02-9ac-hj-np-z]{4})$/i;
function friendCode(pubkey) {
  const npub = nip19.npubEncode(pubkey);
  const c = npub.slice(5, 13).toUpperCase();
  return `SAT-${c.slice(0, 4)}-${c.slice(4)}`;
}
function codeTag(pubkey) { return `saturn-${friendCode(pubkey).slice(4).replace('-', '').toLowerCase()}`; }
function parseFriendInput(input) {
  const raw = String(input || '').trim().replace(/^nostr:/i, '');
  if (/^npub1[02-9ac-hj-np-z]{58}$/i.test(raw)) {
    const d = nip19.decode(raw.toLowerCase());
    return { kind: 'pubkey', pubkey: d.data };
  }
  if (/^nprofile1/i.test(raw)) { const d = nip19.decode(raw.toLowerCase()); return { kind: 'pubkey', pubkey: d.data.pubkey, relays: d.data.relays || [] }; }
  if (/^[0-9a-f]{64}$/i.test(raw)) return { kind: 'pubkey', pubkey: raw.toLowerCase() };
  const m = CODE_RE.exec(raw.replace(/\s+/g, '').replace(/o/gi, '0'));
  if (m) {
    const prefix = `${m[1]}${m[2]}`.toLowerCase();
    return { kind: 'code', prefix, tag: `saturn-${prefix}`, code: `SAT-${m[1].toUpperCase()}-${m[2].toUpperCase()}` };
  }
  throw new Error('That isn’t a friend code. Codes look like SAT-7XK3-QF9D (or paste an npub).');
}
function matchesCode(pubkey, prefix) { return nip19.npubEncode(pubkey).slice(5, 13) === prefix; }

// ---------- NIP-59 gift wrap ----------
function rumor(sk, kind, content, tags = []) {
  const r = { kind, content, tags, created_at: now(), pubkey: getPublicKey(sk) };
  r.id = getEventHash(r);
  return r;
}

/** Seal a rumor for one recipient, then wrap it with a throwaway key. */
function wrap(sk, recipient, r, { ephemeral = false } = {}) {
  const seal = finalizeEvent({
    kind: KIND.SEAL,
    content: nip44.encrypt(JSON.stringify(r), nip44.getConversationKey(sk, recipient)),
    created_at: ephemeral ? now() : randomPast(),
    tags: [],
  }, sk);
  const throwaway = generateSecretKey();
  return finalizeEvent({
    kind: ephemeral ? KIND.EPHEMERAL_WRAP : KIND.WRAP,
    content: nip44.encrypt(JSON.stringify(seal), nip44.getConversationKey(throwaway, recipient)),
    created_at: ephemeral ? now() : randomPast(),
    tags: [['p', recipient]],
  }, throwaway);
}

/** Opens a gift wrap addressed to us; checks both signatures and that the rumor's author signed the seal. */
function unwrap(sk, ev) {
  if (!ev || (ev.kind !== KIND.WRAP && ev.kind !== KIND.EPHEMERAL_WRAP)) throw new Error('Not a gift wrap');
  if (!verifyEvent(ev)) throw new Error('Bad wrap signature');
  const seal = JSON.parse(nip44.decrypt(ev.content, nip44.getConversationKey(sk, ev.pubkey)));
  if (seal.kind !== KIND.SEAL || !verifyEvent(seal)) throw new Error('Bad seal');
  const r = JSON.parse(nip44.decrypt(seal.content, nip44.getConversationKey(sk, seal.pubkey)));
  if (r.pubkey !== seal.pubkey) throw new Error('Sender mismatch');
  if (getEventHash(r) !== r.id) throw new Error('Bad rumor id');
  return { ...r, wrapId: ev.id, ephemeral: ev.kind === KIND.EPHEMERAL_WRAP };
}

function signed(sk, kind, content, tags = []) { return finalizeEvent({ kind, content, tags, created_at: now() }, sk); }

module.exports = { KIND, TWO_DAYS, now, newIdentity, identityFrom, friendCode, codeTag, parseFriendInput, matchesCode, rumor, wrap, unwrap, signed, verifyEvent, npubEncode: (pk) => nip19.npubEncode(pk) };
