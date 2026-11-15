'use strict';
// Saturn 0.1.5: Friends + chat over Nostr, presence, worlds and one-click join signaling.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');

const c = require('../core/social/crypto');
const { RelayPool } = require('../core/social/pool');
const { startDevRelay } = require('../core/social/devRelay');
const { SocialManager } = require('../core/social/manager');
const { fakeWorkerPair } = require('./helpers/fake-p2p');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, label = 'condition') {
  const start = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${label}`); await wait(20); }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'saturn-social-'));
const memKey = () => { let v = null; return { get: async () => v, set: async (x) => { v = x; } }; };

test('nostr crypto: gift wrap round trip, wrong recipient and forged sender are rejected', () => {
  const a = c.identityFrom(c.newIdentity().secretHex);
  const b = c.identityFrom(c.newIdentity().secretHex);
  const e = c.identityFrom(c.newIdentity().secretHex);
  const w = c.wrap(a.sk, b.pubkey, c.rumor(a.sk, c.KIND.CHAT, 'hey', [['p', b.pubkey]]));
  assert.equal(w.kind, 1059); assert.deepEqual(w.tags, [['p', b.pubkey]]);
  assert.notEqual(w.pubkey, a.pubkey, 'outer wrap uses a throwaway key');
  assert.ok(w.created_at <= c.now() && w.created_at > c.now() - c.TWO_DAYS - 5, 'timestamp is randomized into the past');
  assert.ok(!w.content.includes('hey'));
  const r = c.unwrap(b.sk, w);
  assert.equal(r.content, 'hey'); assert.equal(r.pubkey, a.pubkey);
  assert.throws(() => c.unwrap(e.sk, w), 'only the recipient can open it');
  // Forged: Eve seals a rumor that claims to be from Alice.
  const forged = c.rumor(e.sk, c.KIND.CHAT, 'i am alice'); forged.pubkey = a.pubkey;
  const fw = c.wrap(e.sk, b.pubkey, forged);
  assert.throws(() => c.unwrap(b.sk, fw), /mismatch|id/);
  const live = c.wrap(a.sk, b.pubkey, c.rumor(a.sk, c.KIND.SATURN, '{}'), { ephemeral: true });
  assert.equal(live.kind, 21059); assert.ok(c.now() - live.created_at < 3);
});

test('friend codes: format, parsing, npub and lookups', () => {
  const a = c.identityFrom(c.newIdentity().secretHex);
  const code = c.friendCode(a.pubkey);
  assert.match(code, /^SAT-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const p = c.parseFriendInput(code.toLowerCase().replace(/-/g, ' '));
  assert.equal(p.kind, 'code'); assert.ok(c.matchesCode(a.pubkey, p.prefix)); assert.equal(p.tag, c.codeTag(a.pubkey));
  assert.equal(c.parseFriendInput(a.npub).pubkey, a.pubkey);
  assert.equal(c.parseFriendInput(`nostr:${a.npub}`).pubkey, a.pubkey);
  assert.throws(() => c.parseFriendInput('hello'), /friend code/);
});

test('dev relay + pool: publish, filters, ephemeral not stored, reconnect resubscribes', async () => {
  const relay = await startDevRelay();
  const a = c.identityFrom(c.newIdentity().secretHex);
  const pool = new RelayPool([relay.url]);
  try {
    assert.ok(await pool.waitForConnection(3000));
    const got = [];
    pool.subscribe('s', [{ kinds: [1], authors: [a.pubkey] }], (ev) => got.push(ev));
    const ev = c.signed(a.sk, 1, 'one');
    assert.equal((await pool.publish(ev)).ok, true);
    await until(() => got.length === 1, 2000, 'live event');
    await pool.publish(c.signed(a.sk, 20001, 'ephemeral'));
    assert.equal(relay.events.filter((e) => e.kind === 20001).length, 0);
    const q = await pool.query([{ kinds: [1], authors: [a.pubkey] }]);
    assert.equal(q.length, 1);
    relay.dropClients();
    await wait(100);
    await until(() => pool.connectedCount() === 1, 5000, 'reconnect');
    await pool.publish(c.signed(a.sk, 1, 'two'));
    await until(() => got.length === 2, 3000, 'event after reconnect');
    const bad = { ...c.signed(a.sk, 1, 'x'), content: 'tampered' };
    assert.equal((await pool.publish(bad)).ok, false, 'relay refuses a bad signature');
  } finally { pool.close(); await relay.close(); }
});

function makeUser(relayUrl, { name, dir = tmp(), key = memKey(), p2p, host = {} } = {}) {
  const events = []; const notes = [];
  const m = new SocialManager({
    file: path.join(dir, 'social.json'), keyStore: key, relays: [relayUrl], emit: (ch, d) => events.push([ch, d]),
    hooks: {
      profile: () => ({ displayName: name }),
      presence: () => host.presence || { state: 'online' },
      hostState: (id) => (host.hosting && host.hosting[id]) || { hosting: false, reason: 'Open to LAN first.' },
      instanceInfo: async (id) => ({ name: `Instance ${id}`, mcVersion: '26.3', loader: 'fabric' }),
      p2pCreateInvite: (id) => p2p.createInvite({ instanceId: id, name: `Instance ${id}`, mcVersion: '26.3' }),
      p2pAcceptReply: (sid, code) => p2p.acceptReply(sid, code),
      p2pJoin: (code, n) => p2p.join(code, { name: n }),
      p2pClose: (sid) => p2p.close(sid),
      notify: (n) => notes.push(n),
      isFocused: () => false,
    },
  });
  return { m, events, notes, dir, key, host };
}

test('two Saturn installs: add by code, chat both ways, presence, world members and one-click join through the tunnel', async () => {
  const relay = await startDevRelay();
  const world = net.createServer((s) => s.pipe(s)); // stands in for the host's Open to LAN world
  await new Promise((r) => world.listen(0, '127.0.0.1', r));
  const pair = fakeWorkerPair();
  let izakSessions = [];
  let samSessions = [];
  const izakP2P = pair.make({ hostPort: () => world.address().port, voicePort: () => 0, emit: (_ch, list) => { izakSessions = list; } });
  const samP2P = pair.make({ joinPort: 0, emit: (_ch, list) => { samSessions = list; } });
  const izak = makeUser(relay.url, { name: 'Izak', p2p: izakP2P });
  const sam = makeUser(relay.url, { name: 'Sam (Linux)', p2p: samP2P });
  try {
    await izak.m.start(); await sam.m.start();
    await until(() => izak.m.pool.connectedCount() && sam.m.pool.connectedCount(), 3000, 'relay');
    await until(() => relay.events.some((e) => e.kind === 0 && e.pubkey === sam.m.id.pubkey), 3000, 'profile published');

    // Izak adds Sam with the short code; Sam accepts.
    const samCode = sam.m.me().code;
    const found = await izak.m.findByCode(samCode);
    assert.equal(found.pubkey, sam.m.id.pubkey); assert.equal(found.name, 'Sam (Linux)');
    await izak.m.addFriend(samCode);
    assert.equal(izak.m.summary().friends[0].status, 'outgoing');
    await until(() => sam.m.summary().requests === 1, 3000, 'friend request');
    assert.ok(sam.notes.some((n) => n.kind === 'request'));
    assert.equal(sam.m.summary().friends[0].name, 'Izak');
    await sam.m.acceptFriend(izak.m.id.pubkey);
    await until(() => izak.m.isFriend(sam.m.id.pubkey), 3000, 'accept');
    await assert.rejects(izak.m.addFriend(izak.m.me().code), /own code/);

    // Presence arrives after accepting.
    await until(() => izak.m.presenceOf(sam.m.id.pubkey).state === 'online', 3000, 'presence');

    // Chat both ways, with unread counts and notifications.
    await izak.m.sendMessage(sam.m.id.pubkey, 'yo, want to play?');
    await until(() => sam.m.messages(izak.m.id.pubkey).length === 1, 3000, 'message to Sam');
    assert.equal(sam.m.summary().unreadTotal, 1);
    assert.ok(sam.notes.some((n) => n.kind === 'message' && n.body === 'yo, want to play?'));
    sam.m.setActiveChat(izak.m.id.pubkey);
    assert.equal(sam.m.summary().unreadTotal, 0);
    await sam.m.sendMessage(izak.m.id.pubkey, 'sure, host it');
    await until(() => izak.m.messages(sam.m.id.pubkey).length === 2, 3000, 'reply');
    assert.deepEqual(izak.m.messages(sam.m.id.pubkey).map((x) => x.dir), ['out', 'in']);
    const stored = relay.events.filter((e) => e.kind === 1059);
    assert.ok(stored.length > 0 && stored.every((e) => !e.content.includes('host it')), 'relay only sees ciphertext');
    assert.ok(stored.every((e) => e.pubkey !== izak.m.id.pubkey && e.pubkey !== sam.m.id.pubkey), 'relay never sees who sent it');

    // Izak makes a world with Sam as a member and invites him in chat.
    const w = await izak.m.saveWorld({ instanceId: 'fabric-26-3', name: 'Survival with Sam', members: [] });
    await izak.m.inviteToWorld(sam.m.id.pubkey, w.id);
    await until(() => sam.m.summary().worlds.shared.length === 1, 3000, 'shared world');
    await until(() => sam.m.messages(izak.m.id.pubkey).some((x) => x.type === 'invite'), 3000, 'invite card');
    const invite = sam.m.messages(izak.m.id.pubkey).find((x) => x.type === 'invite');
    assert.equal(invite.world.id, w.id); assert.equal(invite.world.name, 'Survival with Sam');
    assert.equal(sam.m.summary().worlds.shared[0].live, false);

    // Not hosting yet: a join gets a friendly error.
    await sam.m.joinWorld(izak.m.id.pubkey, w.id);
    await until(() => sam.m.summary().joins.some((j) => j.state === 'failed'), 3000, 'join refused');
    assert.match(sam.m.summary().joins[0].error, /Open to LAN/);

    // Izak opens the world: presence says hosting, Sam sees it live.
    izak.host.hosting = { 'fabric-26-3': { running: true, hosting: true } };
    izak.m.refreshPresence();
    await until(() => sam.m.summary().worlds.shared[0].live, 3000, 'world live');
    assert.equal(izak.m.summary().worlds.mine[0].hosting, true);

    // One click: Sam joins. Offer/answer travel over encrypted live DMs, no pasting.
    const j = await sam.m.joinWorld(izak.m.id.pubkey, w.id);
    assert.equal(j.state, 'asking');
    await until(() => samSessions.length && samSessions[0].state === 'connected', 4000, 'p2p connected');
    sam.m.onP2PUpdate(samSessions); izak.m.onP2PUpdate(izakSessions);
    const ready = sam.m.summary().joins.find((x) => x.reqId === j.reqId);
    assert.equal(ready.state, 'connected'); assert.match(ready.joinAddress, /^localhost/);
    assert.ok(izak.notes.some((n) => n.kind === 'join'), 'host is told the friend joined');
    assert.ok(relay.stats.ephemeral > 0, 'signaling used ephemeral events');
    const echoed = await new Promise((resolve, reject) => {
      const s = net.connect(ready.localPort, '127.0.0.1'); let buf = '';
      s.on('data', (d) => { buf += d; if (buf.length >= 11) { s.end(); resolve(buf); } });
      s.on('error', reject); s.write('hello world');
    });
    assert.equal(echoed, 'hello world', 'Minecraft traffic flows through the tunnel');

    // A non-member asking is refused.
    izak.m.state.worlds.mine[w.id].members = [];
    await sam.m.cancelJoin(j.reqId);
    await sam.m.joinWorld(izak.m.id.pubkey, w.id);
    await until(() => sam.m.summary().joins.some((x) => x.state === 'failed' && /member/.test(x.error)), 3000, 'non-member refused');
  } finally {
    await izak.m.stop(); await sam.m.stop(); izakP2P.closeAll(); samP2P.closeAll(); world.close(); await relay.close();
  }
});

test('offline delivery, restart keeps identity and history, no duplicates, strangers ignored', async () => {
  const relay = await startDevRelay();
  const a = makeUser(relay.url, { name: 'Izak' });
  let b = makeUser(relay.url, { name: 'Sam' });
  const stranger = makeUser(relay.url, { name: 'Spam' });
  try {
    await a.m.start(); await b.m.start(); await stranger.m.start();
    await until(() => a.m.pool.connectedCount() && b.m.pool.connectedCount() && stranger.m.pool.connectedCount(), 3000, 'relay');
    await a.m.addFriend(b.m.id.npub);
    await until(() => b.m.summary().requests === 1, 3000, 'request');
    await b.m.acceptFriend(a.m.id.pubkey);
    await until(() => a.m.isFriend(b.m.id.pubkey), 3000, 'friends');
    const bKey = b.key; const bDir = b.dir; const bPub = b.m.id.pubkey;
    await b.m.stop();
    await a.m.sendMessage(bPub, 'sent while you were away');
    // Stranger can't DM without being a friend.
    stranger.m.state.friends[bPub] = { pubkey: bPub, status: 'friend' };
    await stranger.m.sendMessage(bPub, 'buy gold');
    b = makeUser(relay.url, { name: 'Sam', dir: bDir, key: bKey });
    await b.m.start();
    assert.equal(b.m.id.pubkey, bPub, 'same identity after restart');
    await until(() => b.m.messages(a.m.id.pubkey).length === 1, 3000, 'offline message');
    assert.equal(b.m.messages(a.m.id.pubkey)[0].text, 'sent while you were away');
    assert.equal(b.m.messages(stranger.m.id.pubkey).length, 0, 'stranger ignored');
    await b.m.stop();
    b = makeUser(relay.url, { name: 'Sam', dir: bDir, key: bKey });
    await b.m.start();
    await wait(400);
    assert.equal(b.m.messages(a.m.id.pubkey).length, 1, 'no duplicate after another restart');
    // Removing a friend clears them on both sides.
    await b.m.removeFriend(a.m.id.pubkey);
    await until(() => !a.m.isFriend(bPub), 3000, 'unfriended');
  } finally { await a.m.stop(); await b.m.stop(); await stranger.m.stop(); await relay.close(); }
});

test('service: Friends starts with the launcher, uses the display name, reports host state, and settings round-trip', async () => {
  const { LauncherService } = require('../core/service');
  const { plainCipher } = require('../core/secrets');
  const relay = await startDevRelay();
  const dir = tmp();
  const events = [];
  const svc = await new LauncherService({ dataDir: dir, cipher: plainCipher, resourcesDir: dir, emit: (ch, d) => events.push(ch) }).init();
  try {
    const s0 = await svc.getSettings();
    assert.equal(s0.socialEnabled, true); assert.equal(s0.socialDiscoverable, true); assert.deepEqual(s0.socialRelays, []);
    assert.equal(svc.socialState().ready, false);
    await svc.socialSetProfile({ socialDisplayName: 'Izak' });
    const st = await svc.startSocial({ relays: [relay.url] });
    assert.equal(st.ready, true); assert.equal(st.me.name, 'Izak'); assert.match(st.me.code, /^SAT-/);
    const key = await svc.secrets.get('nostrKey');
    assert.match(key, /^[0-9a-f]{64}$/, 'identity key lives in the secret store');
    await svc.social.saveNow();
    assert.ok(!fs.readFileSync(path.join(dir, 'social.json'), 'utf8').includes(key), 'social.json never holds the private key');
    assert.equal(svc.socialHostState('nope').hosting, false);
    svc.running.set('w', {}); svc.runningMeta.set('w', { name: 'W', mcVersion: '26.3', loader: 'fabric' });
    assert.match(svc.socialHostState('w').reason, /Open to LAN/);
    svc.lanPorts.set('w', 25565);
    assert.equal(svc.socialHostState('w').hosting, true);
    svc.running.delete('w'); svc.runningMeta.delete('w'); svc.lanPorts.delete('w');
    const after = await svc.socialSetProfile({ socialDisplayName: 'Izak D', socialRelays: ['wss://example.org', 'not a url'], socialNotifications: false });
    assert.equal(after.me.name, 'Izak D');
    assert.deepEqual((await svc.getSettings()).socialRelays, ['wss://example.org']);
    await svc.socialSetProfile({ socialRelays: [relay.url] });
    await assert.rejects(svc.socialAddFriend('not-a-code'), /friend code/);
    const off = await svc.socialSetProfile({ socialEnabled: false });
    assert.equal(off.ready, false); assert.equal(svc.social, null);
    await assert.rejects(async () => svc.socialSend('x', 'hi'), /turned off/);
    const on = await svc.socialSetProfile({ socialEnabled: true });
    assert.equal(on.ready, true); assert.equal(on.me.pubkey, st.me.pubkey, 'same identity after turning it back on');
  } finally { await svc.stopSocial(); await relay.close(); }
});

test('packaging 0.1.5: pure-JS Friends deps ship with the app; main and preload expose the social API', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  for (const d of ['nostr-tools', 'ws', 'qrcode']) assert.ok(pkg.dependencies[d], d);
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
  for (const m of ['socialState', 'socialSend', 'socialJoin', 'socialPlay', 'socialSetProfile']) { assert.ok(main.includes(`'${m}'`), m); assert.ok(preload.includes(`'${m}'`), m); }
  for (const ch of ['social:update', 'social:event', 'nav']) assert.ok(preload.includes(`'${ch}'`), ch);
  assert.match(main, /new Notification/);
});
