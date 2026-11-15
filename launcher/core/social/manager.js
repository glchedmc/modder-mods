'use strict';
// Saturn Friends: identity, friends, encrypted chat, presence and one-click world joins over Nostr relays.
// No Saturn server: messages are NIP-59 gift wraps (NIP-44 encrypted) stored by public relays,
// live signaling uses the same wrap in the ephemeral range so relays forward it without storing it.
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const c = require('./crypto');
const { RelayPool, DEFAULT_RELAYS } = require('./pool');

const PRESENCE_EVERY = 60 * 1000;
const PRESENCE_STALE = 150 * 1000;
const SIGNAL_MAX_AGE = 120; // seconds; older live messages are ignored
const JOIN_TIMEOUT = 30 * 1000;
const MAX_MESSAGES = 500;
const MAX_TEXT = 2000;
const LIVE = new Set(['hello', 'presence', 'join-req', 'p2p-offer', 'p2p-answer', 'join-err']);

const rid = () => crypto.randomBytes(6).toString('hex');
const clean = (s, n = 48) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);

function emptyState() {
  return { v: 1, friends: {}, messages: {}, unread: {}, worlds: { mine: {}, shared: {} }, processed: [], lastSync: 0 };
}

class SocialManager {
  /**
   * hooks: {
   *   profile(): {displayName, mcName}            names to show friends
   *   presence(): {state, instance}               'online' | 'playing' + the running instance
   *   hostState(instanceId): {running, hosting, reason}
   *   instanceInfo(instanceId): {name, mcVersion, loader}
   *   p2pCreateInvite(instanceId), p2pAcceptReply(sid, code), p2pJoin(code, name), p2pClose(sid)
   *   notify({title, body, pk, kind}), isFocused()
   * }
   */
  constructor({ file, keyStore, relays = DEFAULT_RELAYS, discoverable = true, WebSocket, emit = () => {}, hooks = {} }) {
    this.file = file;
    this.keyStore = keyStore;
    this.relayUrls = relays;
    this.discoverable = discoverable;
    this.WebSocket = WebSocket;
    this.emitFn = emit;
    this.hooks = hooks;
    this.state = emptyState();
    this.presence = new Map(); // pubkey -> {state, instance, hosting, name, at}
    this.joins = new Map(); // reqId -> joiner-side join attempt
    this.hosting = new Map(); // reqId -> host-side pending join
    this.activeChat = null;
    this.lastPresence = '';
    this.timers = [];
    this.started = false;
  }

  // ---------- lifecycle ----------
  async start() {
    if (this.started) return this.summary();
    try { this.state = { ...emptyState(), ...JSON.parse(await fsp.readFile(this.file, 'utf8')) }; } catch { this.state = emptyState(); }
    let secret = await this.keyStore.get();
    if (!secret) { secret = c.newIdentity().secretHex; await this.keyStore.set(secret); }
    this.id = c.identityFrom(secret);
    this.pool = new RelayPool(this.relayUrls, { WebSocket: this.WebSocket, onChange: () => this.changed() });
    const since = (this.state.lastSync || c.now() - 7 * 86400) - c.TWO_DAYS - 60;
    this.pool.subscribe('saturn-inbox', [{ kinds: [c.KIND.WRAP], '#p': [this.id.pubkey], since }], (ev) => this.onWrap(ev), {
      onEose: () => { this.state.lastSync = c.now(); this.save(); },
    });
    this.pool.subscribe('saturn-live', [{ kinds: [c.KIND.EPHEMERAL_WRAP], '#p': [this.id.pubkey], since: c.now() - 30 }], (ev) => this.onWrap(ev));
    this.started = true;
    this.timers.push(setInterval(() => this.refreshPresence(true), PRESENCE_EVERY));
    this.timers.push(setInterval(() => this.expirePresence(), 15000));
    for (const t of this.timers) if (t.unref) t.unref();
    this.pool.waitForConnection(15000).then((ok) => {
      if (!ok || !this.started) return;
      this.publishProfile().catch(() => {});
      this.sayHello();
    });
    this.changed();
    return this.summary();
  }

  async stop() {
    if (!this.started) return;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    try { await Promise.race([this.broadcastLive({ t: 'presence', state: 'offline' }), new Promise((r) => setTimeout(r, 1500))]); } catch { /* quitting */ }
    this.started = false;
    await this.saveNow();
    this.pool.close();
  }

  setRelays(urls) { this.relayUrls = urls && urls.length ? urls : DEFAULT_RELAYS; if (this.pool) this.pool.setRelays(this.relayUrls); return this.summary(); }
  async setDiscoverable(on) { this.discoverable = Boolean(on); await this.publishProfile().catch(() => {}); return this.summary(); }

  // ---------- persistence ----------
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow().catch(() => {}), 300);
  }
  async saveNow() {
    clearTimeout(this.saveTimer);
    if (this.state.processed.length > 3000) this.state.processed = this.state.processed.slice(-2000);
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(this.state), { mode: 0o600 });
    await fsp.rename(tmp, this.file);
  }
  changed() {
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => { try { this.emitFn('social:update', this.summary()); } catch { /* */ } }, 40);
  }
  event(e) { try { this.emitFn('social:event', e); } catch { /* */ } }

  // ---------- identity ----------
  myName() {
    const p = (this.hooks.profile && this.hooks.profile()) || {};
    return clean(p.mcName || p.displayName || 'Saturn player');
  }
  me() {
    if (!this.id) return null;
    const p = (this.hooks.profile && this.hooks.profile()) || {};
    return { pubkey: this.id.pubkey, npub: this.id.npub, code: c.friendCode(this.id.pubkey), name: this.myName(), mcName: p.mcName || null, discoverable: this.discoverable };
  }
  async publishProfile() {
    const tags = this.discoverable ? [['t', c.codeTag(this.id.pubkey)], ['t', 'saturn-client']] : [];
    // Not discoverable: publish an empty profile so an old discoverable one is replaced.
    const content = this.discoverable ? JSON.stringify({ name: this.myName(), display_name: this.myName(), about: 'Plays Minecraft with Saturn Client' }) : '{}';
    return this.pool.publish(c.signed(this.id.sk, c.KIND.PROFILE, content, tags));
  }
  async profileChanged() {
    await this.publishProfile().catch(() => {});
    for (const f of this.friendList()) this.sendApp(f.pubkey, { t: 'profile', name: this.myName() }).catch(() => {});
    this.changed();
  }

  // ---------- sending ----------
  async sendApp(pubkey, payload, { live = LIVE.has(payload.t) } = {}) {
    const r = c.rumor(this.id.sk, c.KIND.SATURN, JSON.stringify(payload), [['p', pubkey]]);
    return this.pool.publish(c.wrap(this.id.sk, pubkey, r, { ephemeral: live }));
  }
  broadcastLive(payload) { return Promise.all(this.friendList().map((f) => this.sendApp(f.pubkey, payload, { live: true }).catch(() => null))); }

  // ---------- friends ----------
  friendList() { return Object.values(this.state.friends).filter((f) => f.status === 'friend'); }
  isFriend(pk) { const f = this.state.friends[pk]; return Boolean(f && f.status === 'friend'); }
  nameOf(pk) { const f = this.state.friends[pk]; return (f && f.name) || `${c.friendCode(pk)}`; }

  async findByCode(input) {
    const p = c.parseFriendInput(input);
    if (p.kind === 'pubkey') return { pubkey: p.pubkey, name: (this.state.friends[p.pubkey] || {}).name || null, code: c.friendCode(p.pubkey) };
    await this.pool.waitForConnection(8000);
    const evs = await this.pool.query([{ kinds: [c.KIND.PROFILE], '#t': [p.tag], limit: 20 }], { timeout: 6000 });
    const hits = evs.filter((e) => c.matchesCode(e.pubkey, p.prefix)).sort((a, b) => b.created_at - a.created_at);
    if (!hits.length) throw new Error(`No one found with ${p.code}. They need Saturn open with Friends on. You can paste their npub instead.`);
    let name = null; try { name = clean(JSON.parse(hits[0].content).name); } catch { /* */ }
    return { pubkey: hits[0].pubkey, name, code: p.code };
  }

  async addFriend(input) {
    const found = await this.findByCode(input);
    const pk = found.pubkey;
    if (pk === this.id.pubkey) throw new Error('That’s your own code.');
    const cur = this.state.friends[pk];
    if (cur && cur.status === 'friend') return this.summary();
    if (cur && cur.status === 'incoming') return this.acceptFriend(pk);
    this.state.friends[pk] = { pubkey: pk, name: found.name || null, status: 'outgoing', since: Date.now() };
    this.save(); this.changed();
    await this.sendApp(pk, { t: 'friend-req', name: this.myName() });
    return this.summary();
  }
  async acceptFriend(pk) {
    const f = this.state.friends[pk];
    if (!f) throw new Error('No request from them.');
    f.status = 'friend'; f.since = Date.now();
    this.save(); this.changed();
    await this.sendApp(pk, { t: 'friend-accept', name: this.myName() });
    this.sendPresenceTo(pk);
    return this.summary();
  }
  async declineFriend(pk) { delete this.state.friends[pk]; this.save(); this.changed(); return this.summary(); }
  async removeFriend(pk) {
    const was = this.isFriend(pk);
    delete this.state.friends[pk];
    delete this.state.unread[pk];
    for (const w of Object.values(this.state.worlds.mine)) w.members = w.members.filter((m) => m !== pk);
    for (const [k, w] of Object.entries(this.state.worlds.shared)) if (w.host === pk) delete this.state.worlds.shared[k];
    this.presence.delete(pk);
    this.save(); this.changed();
    if (was) await this.sendApp(pk, { t: 'unfriend' }).catch(() => {});
    return this.summary();
  }

  // ---------- chat ----------
  pushMessage(pk, m) {
    const list = this.state.messages[pk] || (this.state.messages[pk] = []);
    if (list.some((x) => x.id === m.id)) return false;
    list.push(m);
    list.sort((a, b) => a.at - b.at);
    if (list.length > MAX_MESSAGES) list.splice(0, list.length - MAX_MESSAGES);
    return true;
  }
  messages(pk) { return (this.state.messages[pk] || []).slice(-200); }
  async sendMessage(pk, text, { world } = {}) {
    if (!this.isFriend(pk)) throw new Error('You can only message friends.');
    const body = String(text || '').trim().slice(0, MAX_TEXT);
    if (!body) throw new Error('Type a message first.');
    const tags = [['p', pk]];
    if (world) tags.push(['saturn', 'invite', world.id]);
    const r = c.rumor(this.id.sk, c.KIND.CHAT, body, tags);
    const m = { id: r.id, dir: 'out', text: body, at: r.created_at * 1000, type: world ? 'invite' : 'text', world: world ? { id: world.id, name: world.name, host: this.id.pubkey } : undefined, status: 'sending' };
    this.pushMessage(pk, m); this.save(); this.changed();
    const res = await this.pool.publish(c.wrap(this.id.sk, pk, r));
    m.status = res.ok ? 'sent' : res.queued ? 'queued' : 'failed';
    this.save(); this.changed();
    return m;
  }
  markRead(pk) { if (this.state.unread[pk]) { delete this.state.unread[pk]; this.save(); this.changed(); } return true; }
  setActiveChat(pk) { this.activeChat = pk || null; if (pk) this.markRead(pk); return true; }
  unreadTotal() { return Object.entries(this.state.unread).filter(([pk]) => this.isFriend(pk)).reduce((n, [, v]) => n + v, 0); }

  // ---------- worlds ----------
  async saveWorld({ id, instanceId, name, members = [] }) {
    const info = (this.hooks.instanceInfo && await this.hooks.instanceInfo(instanceId)) || {};
    const wid = id || rid();
    const prev = this.state.worlds.mine[wid];
    const w = {
      id: wid, instanceId, name: clean(name || info.name || 'My world', 60),
      mcVersion: info.mcVersion || '', loader: info.loader || '', members: [...new Set(members)].filter((pk) => this.isFriend(pk)),
      createdAt: prev ? prev.createdAt : Date.now(),
    };
    this.state.worlds.mine[wid] = w;
    this.save(); this.changed();
    const removed = prev ? prev.members.filter((m) => !w.members.includes(m)) : [];
    const added = w.members.filter((m) => !prev || !prev.members.includes(m));
    await Promise.all([
      ...w.members.map((pk) => this.sendApp(pk, { t: 'world', world: this.publicWorld(w) }).catch(() => null)),
      ...removed.map((pk) => this.sendApp(pk, { t: 'world-remove', id: wid }).catch(() => null)),
    ]);
    if (added.length) this.refreshPresence(true);
    return w;
  }
  publicWorld(w) { return { id: w.id, name: w.name, mcVersion: w.mcVersion, loader: w.loader }; }
  async removeWorld(id) {
    const w = this.state.worlds.mine[id];
    if (!w) return this.summary();
    delete this.state.worlds.mine[id];
    this.save(); this.changed();
    await Promise.all(w.members.map((pk) => this.sendApp(pk, { t: 'world-remove', id }).catch(() => null)));
    return this.summary();
  }
  /** Adds the friend as a member and drops an invite card in your chat with them. */
  async inviteToWorld(pk, worldId) {
    const w = this.state.worlds.mine[worldId];
    if (!w) throw new Error('Pick one of your worlds.');
    if (!w.members.includes(pk)) await this.saveWorld({ ...w, members: [...w.members, pk] });
    else await this.sendApp(pk, { t: 'world', world: this.publicWorld(w) });
    return this.sendMessage(pk, `Join my world “${w.name}” in Saturn Client (Friends → Worlds).`, { world: w });
  }
  hostingNow() {
    const out = [];
    for (const w of Object.values(this.state.worlds.mine)) {
      const hs = this.hooks.hostState ? this.hooks.hostState(w.instanceId) : null;
      if (hs && hs.hosting) out.push(w.id);
    }
    return out;
  }

  // ---------- presence ----------
  computePresence() {
    const p = (this.hooks.presence && this.hooks.presence()) || { state: 'online' };
    const hosting = this.hostingNow();
    return { t: 'presence', state: hosting.length ? 'hosting' : p.state || 'online', instance: p.instance || null, hosting, name: this.myName() };
  }
  /** Sends presence when it changed (or always, for the heartbeat). */
  refreshPresence(force = false) {
    if (!this.started) return;
    const p = this.computePresence();
    const key = JSON.stringify(p);
    if (!force && key === this.lastPresence) return;
    this.lastPresence = key;
    // Only members learn which of your worlds are live.
    for (const f of this.friendList()) this.sendApp(f.pubkey, this.presenceFor(f.pubkey, p), { live: true }).catch(() => {});
    this.changed();
  }
  presenceFor(pk, p = this.computePresence()) {
    return { ...p, hosting: p.hosting.filter((id) => (this.state.worlds.mine[id] || { members: [] }).members.includes(pk)) };
  }
  sendPresenceTo(pk, t = 'presence') { return this.sendApp(pk, { ...this.presenceFor(pk), t }, { live: true }).catch(() => {}); }
  sayHello() {
    const p = this.computePresence();
    this.lastPresence = JSON.stringify(p);
    for (const f of this.friendList()) this.sendPresenceTo(f.pubkey, 'hello');
  }
  expirePresence() {
    let changed = false;
    for (const [pk, p] of this.presence) if (Date.now() - p.at > PRESENCE_STALE && p.state !== 'offline') { p.state = 'offline'; p.hosting = []; changed = true; void pk; }
    if (changed) this.changed();
  }
  presenceOf(pk) {
    const p = this.presence.get(pk);
    if (!p || p.state === 'offline' || Date.now() - p.at > PRESENCE_STALE) return { state: 'offline', hosting: [], lastSeen: (this.state.friends[pk] || {}).lastSeen || null };
    return p;
  }

  // ---------- one-click join (joiner) ----------
  async joinWorld(host, worldId) {
    const w = this.state.worlds.shared[`${host}:${worldId}`];
    if (!w) throw new Error('That world isn’t shared with you.');
    const pres = this.presenceOf(host);
    if (pres.state === 'offline') throw new Error(`${this.nameOf(host)} is offline. They need Saturn open and the world running.`);
    for (const j of this.joins.values()) if (j.host === host && j.worldId === worldId && ['asking', 'connecting', 'connected'].includes(j.state)) return this.viewJoin(j);
    const j = { reqId: rid(), host, worldId, worldName: w.name, mcVersion: w.mcVersion, loader: w.loader, state: 'asking', startedAt: Date.now() };
    this.joins.set(j.reqId, j);
    j.timer = setTimeout(() => { if (j.state === 'asking') this.failJoin(j, `No answer from ${this.nameOf(host)}. Make sure their world is open (Open to LAN).`); }, JOIN_TIMEOUT);
    this.changed();
    await this.sendApp(host, { t: 'join-req', reqId: j.reqId, worldId, name: this.myName() });
    return this.viewJoin(j);
  }
  failJoin(j, msg) {
    clearTimeout(j.timer);
    j.state = 'failed'; j.error = msg;
    if (j.sessionId && this.hooks.p2pClose) { try { this.hooks.p2pClose(j.sessionId); } catch { /* */ } }
    this.event({ type: 'join-failed', pk: j.host, text: msg });
    this.changed();
  }
  cancelJoin(reqId) {
    const j = this.joins.get(reqId);
    if (!j) return false;
    clearTimeout(j.timer);
    if (j.sessionId && this.hooks.p2pClose) { try { this.hooks.p2pClose(j.sessionId); } catch { /* */ } }
    this.joins.delete(reqId);
    this.changed();
    return true;
  }
  viewJoin(j) {
    const { timer, ...rest } = j; void timer;
    return { ...rest, hostName: this.nameOf(j.host) };
  }
  /** Called with the P2P session list whenever it changes, to follow join progress. */
  onP2PUpdate(list) {
    let changed = false;
    for (const j of this.joins.values()) {
      if (!j.sessionId) continue;
      const s = list.find((x) => x.id === j.sessionId);
      if (!s) { if (j.state === 'connected' || j.state === 'connecting') { j.state = 'ended'; changed = true; } continue; }
      if (s.state === 'connected' && j.state !== 'connected') {
        clearTimeout(j.timer);
        j.state = 'connected'; j.joinAddress = s.joinAddress; j.localPort = s.localPort; j.pair = s.pair || null; j.voiceUp = s.voiceUp;
        this.event({ type: 'join-ready', pk: j.host, text: `Connected to ${j.worldName}. Join ${s.joinAddress} in Minecraft.`, joinAddress: s.joinAddress, reqId: j.reqId });
        changed = true;
      } else if (s.state === 'failed' && j.state !== 'failed') { this.failJoin(j, s.error || 'Direct connection failed. Try Tailscale or Own IP in Host World.'); }
    }
    for (const h of this.hosting.values()) {
      const s = list.find((x) => x.id === h.sessionId);
      if (s && s.state === 'connected' && !h.notified) {
        h.notified = true;
        this.notify({ title: `${this.nameOf(h.friend)} joined`, body: `Connected to ${h.worldName}.`, pk: h.friend, kind: 'join' });
      }
    }
    if (changed) this.changed();
  }

  // ---------- incoming ----------
  async onWrap(ev) {
    if (this.state.processed.includes(ev.id)) return;
    let r;
    try { r = c.unwrap(this.id.sk, ev); } catch { return; }
    if (ev.kind === c.KIND.WRAP) { this.state.processed.push(ev.id); this.save(); }
    const from = r.pubkey;
    if (from === this.id.pubkey) return;
    try {
      if (r.kind === c.KIND.CHAT) this.onChat(from, r);
      else if (r.kind === c.KIND.SATURN) await this.onApp(from, r, JSON.parse(r.content));
    } catch (e) { void e; }
  }

  onChat(from, r) {
    if (!this.isFriend(from)) return; // only friends can message you
    const inviteTag = (r.tags || []).find((t) => t[0] === 'saturn' && t[1] === 'invite');
    const world = inviteTag ? this.state.worlds.shared[`${from}:${inviteTag[2]}`] : null;
    const m = { id: r.id, dir: 'in', text: String(r.content || '').slice(0, MAX_TEXT), at: Math.min(r.created_at * 1000, Date.now()), type: inviteTag ? 'invite' : 'text', world: inviteTag ? { id: inviteTag[2], name: world ? world.name : 'a world', host: from } : undefined };
    if (!this.pushMessage(from, m)) return;
    this.touch(from);
    const reading = this.activeChat === from && this.focused();
    if (!reading) this.state.unread[from] = (this.state.unread[from] || 0) + 1;
    this.save(); this.changed();
    this.event({ type: inviteTag ? 'invite' : 'message', pk: from, name: this.nameOf(from), text: m.text, world: m.world });
    if (!reading) this.notify({ title: inviteTag ? `${this.nameOf(from)} invited you` : this.nameOf(from), body: inviteTag ? `“${m.world.name}”: open Friends to join` : m.text, pk: from, kind: inviteTag ? 'invite' : 'message' });
  }

  touch(pk) { const f = this.state.friends[pk]; if (f) f.lastSeen = Date.now(); }
  focused() { return this.hooks.isFocused ? Boolean(this.hooks.isFocused()) : false; }
  notify(n) { if (this.hooks.notify) { try { this.hooks.notify(n); } catch { /* */ } } }

  async onApp(from, r, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (LIVE.has(msg.t) && c.now() - r.created_at > SIGNAL_MAX_AGE) return; // stale signaling
    const f = this.state.friends[from];
    switch (msg.t) {
      case 'friend-req': {
        const name = clean(msg.name) || null;
        if (f && f.status === 'friend') { f.name = name || f.name; await this.sendApp(from, { t: 'friend-accept', name: this.myName() }); break; }
        if (f && f.status === 'outgoing') { f.status = 'friend'; f.name = name || f.name; await this.sendApp(from, { t: 'friend-accept', name: this.myName() }); this.event({ type: 'friend', pk: from, name }); break; }
        this.state.friends[from] = { pubkey: from, name, status: 'incoming', since: Date.now() };
        this.event({ type: 'friend-request', pk: from, name });
        this.notify({ title: 'Friend request', body: `${name || c.friendCode(from)} wants to be friends`, pk: from, kind: 'request' });
        break;
      }
      case 'friend-accept':
        if (!f || f.status === 'incoming') return;
        if (f.status === 'outgoing') {
          f.status = 'friend'; f.name = clean(msg.name) || f.name; f.since = Date.now();
          this.event({ type: 'friend', pk: from, name: f.name });
          this.notify({ title: 'New friend', body: `${f.name || 'Your friend'} accepted your request`, pk: from, kind: 'friend' });
          this.sendPresenceTo(from);
        }
        break;
      case 'unfriend':
        if (f) { delete this.state.friends[from]; for (const [k, w] of Object.entries(this.state.worlds.shared)) if (w.host === from) delete this.state.worlds.shared[k]; this.presence.delete(from); }
        break;
      case 'profile': if (f) f.name = clean(msg.name) || f.name; break;
      case 'world': {
        if (!this.isFriend(from) || !msg.world || !msg.world.id) return;
        const key = `${from}:${clean(msg.world.id, 32)}`;
        const isNew = !this.state.worlds.shared[key];
        this.state.worlds.shared[key] = { id: clean(msg.world.id, 32), host: from, name: clean(msg.world.name, 60) || 'World', mcVersion: clean(msg.world.mcVersion, 24), loader: clean(msg.world.loader, 24), addedAt: isNew ? Date.now() : this.state.worlds.shared[key].addedAt };
        if (isNew) {
          this.event({ type: 'world', pk: from, name: this.nameOf(from), world: this.state.worlds.shared[key] });
          this.notify({ title: `${this.nameOf(from)} added you to a world`, body: `“${this.state.worlds.shared[key].name}”: join it from Friends`, pk: from, kind: 'world' });
        }
        break;
      }
      case 'world-remove': delete this.state.worlds.shared[`${from}:${clean(msg.id, 32)}`]; break;
      case 'hello':
      case 'presence': {
        if (!this.isFriend(from)) return;
        const prev = this.presenceOf(from);
        this.presence.set(from, { state: ['online', 'playing', 'hosting', 'offline'].includes(msg.state) ? msg.state : 'online', instance: msg.instance ? { name: clean(msg.instance.name), mcVersion: clean(msg.instance.mcVersion, 24), loader: clean(msg.instance.loader, 24) } : null, hosting: Array.isArray(msg.hosting) ? msg.hosting.map((x) => clean(x, 32)) : [], at: Date.now() });
        if (msg.name) f.name = clean(msg.name) || f.name;
        this.touch(from);
        if (msg.t === 'hello') this.sendPresenceTo(from);
        const now = this.presenceOf(from);
        for (const id of now.hosting) {
          if (!prev.hosting.includes(id)) {
            const w = this.state.worlds.shared[`${from}:${id}`];
            if (w) this.event({ type: 'hosting', pk: from, name: this.nameOf(from), world: w });
          }
        }
        this.changed();
        return; // presence isn't persisted
      }
      case 'join-req': await this.onJoinRequest(from, msg); return;
      case 'p2p-offer': await this.onOffer(from, msg); return;
      case 'p2p-answer': await this.onAnswer(from, msg); return;
      case 'join-err': {
        const j = this.joins.get(String(msg.reqId));
        if (j && j.host === from) this.failJoin(j, clean(msg.reason, 200) || 'The host couldn’t start the connection.');
        return;
      }
      default: return;
    }
    this.save(); this.changed();
  }

  // ---------- one-click join (host) ----------
  async onJoinRequest(from, msg) {
    const reqId = clean(msg.reqId, 32);
    const deny = (reason) => this.sendApp(from, { t: 'join-err', reqId, reason });
    if (!this.isFriend(from)) return;
    const w = this.state.worlds.mine[clean(msg.worldId, 32)];
    if (!w || !w.members.includes(from)) { await deny('You’re not a member of that world anymore.'); return; }
    const hs = this.hooks.hostState ? this.hooks.hostState(w.instanceId) : { hosting: false };
    if (!hs.hosting) { await deny(hs.reason || `${this.myName()} isn’t hosting “${w.name}” right now.`); return; }
    if (this.hosting.has(reqId)) return;
    try {
      const inv = await this.hooks.p2pCreateInvite(w.instanceId);
      this.hosting.set(reqId, { reqId, friend: from, sessionId: inv.id, worldId: w.id, worldName: w.name, at: Date.now() });
      await this.sendApp(from, { t: 'p2p-offer', reqId, code: inv.code });
      this.event({ type: 'joining', pk: from, name: this.nameOf(from), text: `${this.nameOf(from)} is joining ${w.name}` });
    } catch (e) { await deny(`Couldn’t start a Direct connection: ${e.message}`); }
  }
  async onOffer(from, msg) {
    const j = this.joins.get(String(msg.reqId));
    if (!j || j.host !== from || j.state !== 'asking') return;
    try {
      const s = await this.hooks.p2pJoin(String(msg.code), this.myName());
      j.sessionId = s.id; j.state = 'connecting'; j.joinAddress = s.joinAddress; j.localPort = s.localPort; j.nat = s.nat || null;
      clearTimeout(j.timer);
      j.timer = setTimeout(() => { if (j.state === 'connecting') this.failJoin(j, 'Couldn’t connect directly. Strict NAT on both sides? Try Tailscale or Own IP.'); }, JOIN_TIMEOUT);
      this.changed();
      await this.sendApp(from, { t: 'p2p-answer', reqId: j.reqId, code: s.code });
    } catch (e) { this.failJoin(j, e.message); }
  }
  async onAnswer(from, msg) {
    const h = this.hosting.get(String(msg.reqId));
    if (!h || h.friend !== from || h.answered) return;
    h.answered = true;
    try { await this.hooks.p2pAcceptReply(h.sessionId, String(msg.code)); } catch (e) { await this.sendApp(from, { t: 'join-err', reqId: h.reqId, reason: e.message }); }
  }

  // ---------- views ----------
  summary() {
    if (!this.id) return { ready: false };
    const friends = Object.values(this.state.friends).map((f) => {
      const msgs = this.state.messages[f.pubkey] || [];
      const last = msgs[msgs.length - 1] || null;
      return { pubkey: f.pubkey, name: f.name || null, code: c.friendCode(f.pubkey), npub: c.npubEncode(f.pubkey), status: f.status, since: f.since, presence: f.status === 'friend' ? this.presenceOf(f.pubkey) : null, unread: this.state.unread[f.pubkey] || 0, last: last ? { text: last.text, at: last.at, dir: last.dir, type: last.type } : null };
    });
    const mine = Object.values(this.state.worlds.mine).map((w) => ({ ...w, memberNames: w.members.map((pk) => ({ pubkey: pk, name: this.nameOf(pk) })), hosting: this.hostingNow().includes(w.id) }));
    const shared = Object.values(this.state.worlds.shared).filter((w) => this.isFriend(w.host)).map((w) => {
      const p = this.presenceOf(w.host);
      return { ...w, hostName: this.nameOf(w.host), hostState: p.state, live: p.hosting.includes(w.id) };
    });
    return {
      ready: true,
      me: this.me(),
      relays: this.pool ? this.pool.status() : [],
      connected: this.pool ? this.pool.connectedCount() : 0,
      friends,
      worlds: { mine, shared },
      joins: [...this.joins.values()].map((j) => this.viewJoin(j)),
      unreadTotal: this.unreadTotal(),
      requests: friends.filter((f) => f.status === 'incoming').length,
    };
  }
}

module.exports = { SocialManager, PRESENCE_STALE, SIGNAL_MAX_AGE };
