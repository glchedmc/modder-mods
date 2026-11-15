// Browser-preview stand-in for Friends & chat (the real one runs over Nostr relays in the main process).
const PK = {
  me: 'a1'.repeat(32), sam: 'b2'.repeat(32), maya: 'c3'.repeat(32), theo: 'd4'.repeat(32), ava: 'e5'.repeat(32), nico: 'f6'.repeat(32),
};
const CODE = { me: 'SAT-7XK3-QF9D', sam: 'SAT-L1NX-4SAM', maya: 'SAT-M4YA-SKY2', theo: 'SAT-TH30-W00D', ava: 'SAT-AVA9-ZK2P', nico: 'SAT-N1C0-8RQX' };
const npub = (k) => `npub1${k.slice(0, 2)}x9q${'7xk3qf9dl0m'.repeat(5).slice(0, 51)}`;

export function createSocialMock({ emit, wait }) {
  const t0 = Date.now();
  const min = (m) => t0 - m * 60e3;
  const st = {
    me: { pubkey: PK.me, npub: npub('me'), code: CODE.me, name: 'Izak', mcName: null, discoverable: true },
    friends: [
      { pubkey: PK.sam, name: 'Sam', status: 'friend', presence: { state: 'playing', instance: { name: 'Linux SMP', mcVersion: '26.3', loader: 'fabric' }, hosting: [] } },
      { pubkey: PK.maya, name: 'Maya', status: 'friend', presence: { state: 'hosting', instance: { name: 'Skyblock', mcVersion: '26.3', loader: 'fabric' }, hosting: ['sky1'] } },
      { pubkey: PK.nico, name: 'Nico', status: 'friend', presence: { state: 'online', hosting: [] } },
      { pubkey: PK.theo, name: 'Theo', status: 'friend', presence: { state: 'offline', hosting: [], lastSeen: min(180) } },
      { pubkey: PK.ava, name: 'Ava', status: 'incoming', presence: null },
    ],
    messages: {
      [PK.sam]: [
        { id: 'm1', dir: 'in', text: 'got the launcher working on Linux 🎉', at: min(42), type: 'text' },
        { id: 'm2', dir: 'out', text: 'nice!! glass looks ok on your end?', at: min(41), type: 'text' },
        { id: 'm3', dir: 'in', text: 'turned it down to medium, runs smooth now', at: min(40), type: 'text' },
        { id: 'm4', dir: 'out', text: 'Join my world “Survival with Sam” in Saturn Client (Friends → Worlds).', at: min(12), type: 'invite', world: { id: 'w1', name: 'Survival with Sam', host: PK.me } },
        { id: 'm5', dir: 'in', text: 'joining in 5, grabbing food', at: min(10), type: 'text' },
        { id: 'm6', dir: 'in', text: 'do we have voice chat on?', at: min(2), type: 'text' },
      ],
      [PK.maya]: [
        { id: 'k1', dir: 'in', text: 'Join my world “Maya’s Skyblock” in Saturn Client (Friends → Worlds).', at: min(25), type: 'invite', world: { id: 'sky1', name: 'Maya’s Skyblock', host: PK.maya } },
        { id: 'k2', dir: 'in', text: 'island 2 is ready, come help with the farm', at: min(24), type: 'text' },
      ],
      [PK.theo]: [{ id: 't1', dir: 'out', text: 'gg yesterday', at: min(60 * 20), type: 'text' }],
    },
    unread: { [PK.sam]: 2, [PK.maya]: 2 },
    worlds: {
      mine: [{ id: 'w1', instanceId: 'fabric-26-3', name: 'Survival with Sam', mcVersion: '26.3', loader: 'fabric', members: [PK.sam, PK.nico], createdAt: min(600) }],
      shared: [
        { id: 'sky1', host: PK.maya, name: 'Maya’s Skyblock', mcVersion: '26.3', loader: 'fabric', addedAt: min(300) },
        { id: 'lx1', host: PK.sam, name: 'Linux SMP', mcVersion: '26.3', loader: 'fabric', addedAt: min(900) },
      ],
    },
    joins: [],
    active: null,
  };
  const name = (pk) => (st.friends.find((f) => f.pubkey === pk) || {}).name || 'Friend';
  const presence = (pk) => (st.friends.find((f) => f.pubkey === pk) || {}).presence || { state: 'offline', hosting: [] };
  const summary = () => {
    const friends = st.friends.map((f) => {
      const msgs = st.messages[f.pubkey] || []; const last = msgs[msgs.length - 1];
      return { ...f, code: CODE[Object.keys(PK).find((k) => PK[k] === f.pubkey)] || 'SAT-0000-0000', npub: npub(f.name), unread: st.unread[f.pubkey] || 0, last: last ? { text: last.text, at: last.at, dir: last.dir, type: last.type } : null };
    });
    return {
      ready: true, me: st.me,
      relays: [{ url: 'wss://nos.lol', state: 'open' }, { url: 'wss://relay.primal.net', state: 'open' }, { url: 'wss://nostr.mom', state: 'open' }, { url: 'wss://offchain.pub', state: 'open' }, { url: 'wss://relay.damus.io', state: 'connecting' }],
      connected: 4, friends,
      worlds: {
        mine: st.worlds.mine.map((w) => ({ ...w, memberNames: w.members.map((pk) => ({ pubkey: pk, name: name(pk) })), hosting: w.id === 'w1' && st.hostingW1 })),
        shared: st.worlds.shared.map((w) => ({ ...w, hostName: name(w.host), hostState: presence(w.host).state, live: presence(w.host).hosting.includes(w.id) })),
      },
      joins: st.joins.map((j) => ({ ...j, hostName: name(j.host) })),
      unreadTotal: Object.values(st.unread).reduce((a, b) => a + b, 0),
      requests: st.friends.filter((f) => f.status === 'incoming').length,
    };
  };
  const changed = () => emit('social:update', summary());
  const api = {
    socialState: async () => summary(),
    socialMessages: async (pk) => (st.messages[pk] || []).slice(),
    socialSend: async (pk, text) => {
      const m = { id: `o${Date.now()}`, dir: 'out', text, at: Date.now(), type: 'text', status: 'sent' };
      (st.messages[pk] = st.messages[pk] || []).push(m); changed(); emit('social:message', { pk }); return m;
    },
    socialFind: async (q) => { await wait(500); if (!/sat-|npub/i.test(q)) throw new Error('That isn’t a friend code. Codes look like SAT-7XK3-QF9D (or paste an npub).'); return { pubkey: 'aa'.repeat(32), name: 'Riley', code: q.toUpperCase() }; },
    socialAddFriend: async (q) => { await wait(400); st.friends.push({ pubkey: 'aa'.repeat(32), name: 'Riley', status: 'outgoing', presence: null }); changed(); return summary(); },
    socialAccept: async (pk) => { const f = st.friends.find((x) => x.pubkey === pk); f.status = 'friend'; f.presence = { state: 'online', hosting: [] }; changed(); return summary(); },
    socialDecline: async (pk) => { st.friends = st.friends.filter((x) => x.pubkey !== pk); changed(); return summary(); },
    socialRemove: async (pk) => { st.friends = st.friends.filter((x) => x.pubkey !== pk); changed(); return summary(); },
    socialSetActive: async (pk) => { st.active = pk; if (pk && st.unread[pk]) { delete st.unread[pk]; changed(); } return true; },
    socialSaveWorld: async (w) => {
      const id = w.id || `w${Date.now()}`;
      const nw = { id, instanceId: w.instanceId, name: w.name, mcVersion: '26.3', loader: 'fabric', members: w.members || [], createdAt: Date.now() };
      st.worlds.mine = [...st.worlds.mine.filter((x) => x.id !== id), nw]; changed(); return nw;
    },
    socialRemoveWorld: async (id) => { st.worlds.mine = st.worlds.mine.filter((x) => x.id !== id); changed(); return summary(); },
    socialInvite: async (pk, worldId) => {
      const w = st.worlds.mine.find((x) => x.id === worldId); if (!w.members.includes(pk)) w.members.push(pk);
      const m = { id: `i${Date.now()}`, dir: 'out', text: `Join my world “${w.name}” in Saturn Client (Friends → Worlds).`, at: Date.now(), type: 'invite', world: { id: w.id, name: w.name, host: PK.me } };
      (st.messages[pk] = st.messages[pk] || []).push(m); changed(); emit('social:message', { pk }); return m;
    },
    socialJoin: async (host, worldId) => {
      const w = st.worlds.shared.find((x) => x.id === worldId && x.host === host);
      if (presence(host).state === 'offline') throw new Error(`${name(host)} is offline. They need Saturn open and the world running.`);
      const j = { reqId: `j${Date.now()}`, host, worldId, worldName: w ? w.name : 'World', mcVersion: '26.3', loader: 'fabric', state: 'asking' };
      st.joins = [...st.joins.filter((x) => !(x.host === host && x.worldId === worldId)), j]; changed();
      setTimeout(() => { j.state = 'connecting'; changed(); }, 900);
      setTimeout(() => {
        j.state = 'connected'; j.joinAddress = 'localhost'; j.localPort = 25565; j.pair = { kind: 'p2p', label: 'Direct · peer-to-peer (hole punched)' }; j.voiceUp = true; changed();
        emit('social:event', { type: 'join-ready', pk: host, text: `Connected to ${j.worldName}. Join localhost in Minecraft.`, joinAddress: 'localhost', reqId: j.reqId });
      }, 2200);
      return { ...j, hostName: name(host) };
    },
    socialCancelJoin: async (reqId) => { st.joins = st.joins.filter((x) => x.reqId !== reqId); changed(); return true; },
    socialQr: async () => qrSvg(),
    socialPlay: async () => { await wait(300); return { pid: 1 }; },
    socialSetProfile: async (patch) => { if (patch.socialDisplayName !== undefined) st.me.name = patch.socialDisplayName || 'Saturn player'; if (patch.socialDiscoverable !== undefined) st.me.discoverable = patch.socialDiscoverable; changed(); return summary(); },
  };
  // Lets screenshot scripts fake an incoming invite.
  if (typeof window !== 'undefined') {
    window.__saturnMock = {
      invite() {
        const m = { id: `x${Date.now()}`, dir: 'in', text: 'Join my world “Maya’s Skyblock” in Saturn Client (Friends → Worlds).', at: Date.now(), type: 'invite', world: { id: 'sky1', name: 'Maya’s Skyblock', host: PK.maya } };
        st.messages[PK.maya].push(m); st.unread[PK.maya] = (st.unread[PK.maya] || 0) + 1; changed();
        emit('social:event', { type: 'invite', pk: PK.maya, name: 'Maya', text: m.text, world: m.world });
      },
      hostW1() { st.hostingW1 = true; changed(); },
    };
  }
  return api;
}

// Static QR-looking image for previews (the app renders a real QR of your npub).
function qrSvg() {
  const n = 29; let rects = '';
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#14163a"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#14163a"/>`;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inF = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
    if (!inF && rnd() > 0.52) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#14163a"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/>${rects}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
