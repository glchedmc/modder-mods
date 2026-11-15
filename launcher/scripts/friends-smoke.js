'use strict';
// Two Saturn installs in one Electron process: Friends over a local Nostr relay + real WebRTC Direct tunnel.
// Izak shares a world, Sam adds him by code, they chat, Sam clicks Join and bytes flow through the tunnel.
// Run: xvfb-run -a npx electron scripts/friends-smoke.js   (add RELAYS=public to use the public relays)
const { app } = require('electron');
const os = require('os'); const fs = require('fs'); const path = require('path'); const net = require('net');
const { startP2P } = require('../electron/p2p-host');
const { startDevRelay } = require('../core/social/devRelay');
const { SocialManager } = require('../core/social/manager');
const { DEFAULT_RELAYS } = require('../core/social/pool');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
const out = (m) => process.stdout.write(`[friends-smoke] ${m}\n`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error(`timeout: ${label}`); await wait(50); } return Date.now() - t; }

function user(name, relays, p2p, host) {
  let key = null; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturn-fs-'));
  const m = new SocialManager({
    file: path.join(dir, 'social.json'), keyStore: { get: async () => key, set: async (v) => { key = v; } }, relays,
    hooks: {
      profile: () => ({ displayName: name }), presence: () => ({ state: 'online' }),
      hostState: (id) => ((host.hosting || {})[id] || { hosting: false, reason: 'Open to LAN first.' }),
      instanceInfo: async () => ({ name: 'Fabric 26.3', mcVersion: '26.3', loader: 'fabric' }),
      p2pCreateInvite: (id) => p2p.manager.createInvite({ instanceId: id, name: 'Survival', mcVersion: '26.3' }),
      p2pAcceptReply: (sid, code) => p2p.manager.acceptReply(sid, code),
      p2pJoin: (code, n) => p2p.manager.join(code, { name: n, preferPort: 0 }),
      p2pClose: (sid) => p2p.manager.close(sid),
      notify: (n) => out(`  notify ${name}: ${n.title} — ${n.body}`),
    },
  });
  return m;
}

app.whenReady().then(async () => {
  let code = 1;
  try {
    const world = net.createServer((s) => s.pipe(s));
    await new Promise((r) => world.listen(0, '127.0.0.1', r));
    const relay = process.env.RELAYS === 'public' ? null : await startDevRelay();
    const relays = relay ? [relay.url] : DEFAULT_RELAYS;
    out(`relays: ${relays.join(', ')}`);
    const izakP2P = startP2P({ hostPort: () => world.address().port, voicePort: () => 0 });
    const samP2P = startP2P({ joinPort: 0 });
    const izakHost = {};
    const izak = user('Izak', relays, izakP2P, izakHost);
    const sam = user('Sam', relays, samP2P, {});
    const p2pTick = setInterval(() => { izak.onP2PUpdate(izakP2P.manager.list()); sam.onP2PUpdate(samP2P.manager.list()); }, 100);
    await izak.start(); await sam.start();
    await until(() => izak.pool.connectedCount() && sam.pool.connectedCount(), 15000, 'relays');
    await wait(1200);
    await sam.addFriend(izak.me().code);
    await until(() => izak.summary().requests === 1, 15000, 'request');
    await izak.acceptFriend(sam.id.pubkey);
    await until(() => sam.isFriend(izak.id.pubkey), 15000, 'accept');
    out('friends: Sam added Izak by code, Izak accepted');
    await sam.sendMessage(izak.id.pubkey, 'hey from Linux');
    await until(() => izak.messages(sam.id.pubkey).length === 1, 15000, 'chat');
    out(`chat: "${izak.messages(sam.id.pubkey)[0].text}"`);
    const w = await izak.saveWorld({ instanceId: 'fabric', name: 'Survival with Sam', members: [] });
    await izak.inviteToWorld(sam.id.pubkey, w.id);
    await until(() => sam.summary().worlds.shared.length === 1, 15000, 'world');
    izakHost.hosting = { fabric: { hosting: true } };
    izak.refreshPresence(true);
    await until(() => sam.summary().worlds.shared[0].live, 15000, 'live');
    out('world: shared with Sam and live');
    const t0 = Date.now();
    const j = await sam.joinWorld(izak.id.pubkey, w.id);
    await until(() => (sam.joins.get(j.reqId) || {}).state === 'connected', 30000, 'join');
    const jj = sam.joins.get(j.reqId);
    out(`join: one click -> connected in ${Date.now() - t0} ms via ${jj.pair ? jj.pair.label : '?'}, address ${jj.joinAddress} (port ${jj.localPort})`);
    const payload = Buffer.alloc(256 * 1024); for (let i = 0; i < payload.length; i++) payload[i] = (i * 13) & 255;
    const got = await new Promise((resolve, reject) => {
      const s = net.connect(jj.localPort, '127.0.0.1'); const parts = []; let n = 0;
      s.on('data', (d) => { parts.push(d); n += d.length; if (n >= payload.length) { s.end(); resolve(Buffer.concat(parts)); } });
      s.on('error', reject); s.write(payload);
    });
    if (!got.equals(payload)) throw new Error('payload mismatch');
    out('tunnel: 256 KB echoed through the WebRTC data channel');
    clearInterval(p2pTick);
    await izak.stop(); await sam.stop(); izakP2P.manager.closeAll(); samP2P.manager.closeAll(); world.close(); if (relay) await relay.close();
    out('PASS'); code = 0;
  } catch (e) { out(`FAIL ${e.stack}`); }
  app.exit(code);
});
