// Live check against the public relays: two fresh identities add each other by code, chat, and swap join signaling.
// Usage: node scripts/social-live.js
const os = require('os'); const fs = require('fs'); const path = require('path');
const { SocialManager } = require('../core/social/manager');
const { DEFAULT_RELAYS } = require('../core/social/pool');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error(`timeout: ${label}`); await wait(100); } }
function user(name) {
  let key = null; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saturn-live-'));
  const sessions = new Map();
  return new SocialManager({
    file: path.join(dir, 's.json'), keyStore: { get: async () => key, set: async (v) => { key = v; } }, relays: DEFAULT_RELAYS,
    hooks: {
      profile: () => ({ displayName: name }), presence: () => ({ state: 'online' }),
      hostState: () => ({ hosting: true }), instanceInfo: async () => ({ name: 'Test', mcVersion: '26.3', loader: 'fabric' }),
      p2pCreateInvite: async () => ({ id: 'h1', code: 'SATURN-INVITE-test' }),
      p2pJoin: async (code) => { sessions.set('j1', code); return { id: 'j1', code: 'SATURN-REPLY-test', joinAddress: 'localhost' }; },
      p2pAcceptReply: async (sid, code) => { console.log(`  host got reply for ${sid}: ${code}`); return {}; },
      p2pClose: () => {},
    },
  });
}
(async () => {
  const a = user('Live A'); const b = user('Live B');
  await a.start(); await b.start();
  await until(() => a.pool.connectedCount() && b.pool.connectedCount(), 15000, 'relays');
  console.log('relays:', a.pool.status().map((r) => `${r.url}=${r.state}`).join(' '));
  await wait(2500);
  let t = Date.now(); await a.addFriend(b.me().code); console.log(`code lookup + request sent in ${Date.now() - t} ms`);
  t = Date.now(); await until(() => b.summary().requests === 1, 20000, 'request'); console.log(`request arrived in ${Date.now() - t} ms`);
  await b.acceptFriend(a.id.pubkey); await until(() => a.isFriend(b.id.pubkey), 20000, 'accept');
  t = Date.now(); await a.sendMessage(b.id.pubkey, 'hello over public relays');
  await until(() => b.messages(a.id.pubkey).length === 1, 20000, 'chat'); console.log(`chat delivered in ${Date.now() - t} ms`);
  await until(() => b.presenceOf(a.id.pubkey).state !== 'offline', 20000, 'presence');
  const w = await a.saveWorld({ instanceId: 'x', name: 'Live world', members: [b.id.pubkey] });
  await until(() => b.summary().worlds.shared.length === 1, 20000, 'world');
  a.refreshPresence(true); await until(() => b.summary().worlds.shared[0].live, 20000, 'live');
  t = Date.now(); const j = await b.joinWorld(a.id.pubkey, w.id);
  await until(() => (b.joins.get(j.reqId) || {}).state === 'connecting', 20000, 'offer'); await wait(1500);
  console.log(`join signaling (req -> offer -> answer) in ${Date.now() - t} ms`);
  await a.stop(); await b.stop(); console.log('PASS'); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
