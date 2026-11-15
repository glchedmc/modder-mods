'use strict';
// Direct (free) hosting: the TCP/UDP side of the peer-to-peer tunnel.
//
// The WebRTC peer connection itself runs in a hidden Chromium window (the
// "worker", electron/p2p-worker.js) because Electron ships WebRTC there with
// no native modules. This class talks to it with small messages and does the
// socket work in the main process:
//   host:  each "tcp:N" data channel the friend opens -> TCP to the LAN world
//          (127.0.0.1:<Open to LAN port>); the "udp" channel <-> Simple Voice
//          Chat on 127.0.0.1:24454.
//   joiner: a TCP server on 127.0.0.1:25565 (Minecraft connects there) opens a
//          "tcp:N" channel per connection; a UDP socket on 127.0.0.1:24454 is
//          relayed over the unreliable "udp" channel.
const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const codec = require('./codec');
const { classifyNat, describePair, ICE_SERVERS, FAILED_MESSAGE } = require('./nat');

const CHUNK = 16 * 1024;
const MC_PORT = 25565;
const VOICE_PORT = 24454;

function listenTcp(server, port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const onErr = (e) => { server.off('listening', onOk); reject(e); };
    const onOk = () => { server.off('error', onErr); resolve(server.address().port); };
    server.once('error', onErr);
    server.once('listening', onOk);
    server.listen(port, host);
  });
}

function bindUdp(sock, port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const onErr = (e) => reject(e);
    sock.once('error', onErr);
    sock.bind(port, host, () => { sock.off('error', onErr); resolve(sock.address().port); });
  });
}

/** First free local TCP port from `preferred`, trying a few after it, then any. */
async function freeTcpPort(preferred = MC_PORT, tries = 10) {
  for (let p = preferred; preferred > 0 && p < preferred + tries; p += 1) {
    const s = net.createServer();
    try { const got = await listenTcp(s, p); await new Promise((r) => s.close(r)); return got; } catch { /* busy */ }
  }
  const s = net.createServer();
  const p = await listenTcp(s, 0);
  await new Promise((r) => s.close(r));
  return p;
}

class P2PManager {
  /**
   * @param {{send(cmd:object):void}} worker
   * @param {{emit?:Function, hostPort?:(instanceId:string)=>number|Promise<number>, voicePort?:(instanceId:string)=>number|Promise<number>, iceServers?:object[], gatherTimeoutMs?:number}} opts
   */
  constructor(worker, { emit = () => {}, hostPort = () => MC_PORT, voicePort = () => VOICE_PORT, iceServers = ICE_SERVERS, joinPort = MC_PORT } = {}) {
    this.worker = worker;
    this.emitFn = emit;
    this.hostPort = hostPort;
    this.voicePortFor = voicePort;
    this.iceServers = iceServers;
    this.joinPort = joinPort;
    this.sessions = new Map();
    this.waiters = new Map();
  }

  // ---------- public API ----------
  list() { return [...this.sessions.values()].map((s) => this.view(s)); }

  /** Host: makes an invite code for one friend. */
  async createInvite({ instanceId, name = 'Saturn world', mcVersion = '' } = {}) {
    const s = this.newSession('host', { instanceId, name });
    s.voicePort = Number(await this.voicePortFor(instanceId)) || VOICE_PORT;
    const local = await this.request(s, { op: 'create', role: 'host', iceServers: this.iceServers });
    s.nat = classifyNat(local.candidates);
    s.code = codec.encode('offer', { sdp: local.sdp, name, mcVersion, voicePort: s.voicePort, sid: s.id });
    s.state = 'waiting-reply';
    this.changed();
    return this.view(s);
  }

  /** Host: accepts the friend's reply code and starts connecting. */
  async acceptReply(sessionId, replyCode) {
    const s = this.need(sessionId, 'host');
    const reply = codec.decode(replyCode, 'answer');
    if (reply.sid && reply.sid !== s.id) throw new Error('That reply belongs to a different invite. Make sure your friend used this invite.');
    s.peerName = reply.name || null;
    s.state = 'connecting';
    this.changed();
    this.worker.send({ op: 'answer', sid: s.id, sdp: reply.sdp });
    return this.view(s);
  }

  /** Joiner: reads an invite, opens local ports and returns a reply code. */
  async join(inviteCode, { name = 'Friend', preferPort } = {}) {
    const invite = codec.decode(inviteCode, 'offer');
    const s = this.newSession('join', { name: invite.name, peerName: invite.name });
    s.hostSid = invite.sid || null;
    s.mcVersion = invite.mcVersion || '';
    s.voicePort = Number(invite.voicePort) || VOICE_PORT;
    try {
      await this.openJoinerSockets(s, preferPort || this.joinPort);
      const local = await this.request(s, { op: 'create', role: 'join', iceServers: this.iceServers, sdp: invite.sdp });
      s.nat = classifyNat(local.candidates);
      s.code = codec.encode('answer', { sdp: local.sdp, name, sid: s.hostSid });
      s.state = 'waiting-host';
      this.changed();
      return this.view(s);
    } catch (e) {
      this.close(s.id);
      throw e;
    }
  }

  close(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.closed = true;
    for (const c of s.conns.values()) { try { c.socket.destroy(); } catch { /* */ } }
    s.conns.clear();
    if (s.server) { try { s.server.close(); } catch { /* */ } }
    if (s.udp) { try { s.udp.close(); } catch { /* */ } }
    this.worker.send({ op: 'close', sid: s.id });
    this.sessions.delete(sessionId);
    this.changed();
    return true;
  }

  closeAll() { for (const id of [...this.sessions.keys()]) this.close(id); }

  // ---------- events from the worker ----------
  handle(evt) {
    const s = this.sessions.get(evt.sid);
    if (!s) return;
    switch (evt.ev) {
      case 'local-sdp': this.resolve(s, evt); break;
      case 'error': if (!this.reject(s, new Error(evt.message))) { s.error = evt.message; this.changed(); } break;
      case 'state': this.onState(s, evt); break;
      case 'ch-open': this.onChannelOpen(s, evt.ch); break;
      case 'data': this.onData(s, evt.ch, Buffer.from(evt.data)); break;
      case 'ch-close': this.onChannelClose(s, evt.ch); break;
      default: break;
    }
  }

  // ---------- internals ----------
  newSession(role, extra) {
    const s = {
      id: crypto.randomBytes(6).toString('hex'), role, state: 'preparing', createdAt: Date.now(),
      conns: new Map(), nextConn: 1, bytesIn: 0, bytesOut: 0, voiceUp: false, ...extra,
    };
    this.sessions.set(s.id, s);
    this.changed();
    return s;
  }

  need(id, role) {
    const s = this.sessions.get(id);
    if (!s || (role && s.role !== role)) throw new Error('That connection was closed. Start again.');
    return s;
  }

  request(s, cmd, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.waiters.delete(s.id); reject(new Error('Network setup timed out.')); }, timeoutMs);
      this.waiters.set(s.id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.worker.send({ ...cmd, sid: s.id });
    });
  }

  resolve(s, v) { const w = this.waiters.get(s.id); if (w) { this.waiters.delete(s.id); w.resolve(v); } }
  reject(s, e) { const w = this.waiters.get(s.id); if (w) { this.waiters.delete(s.id); w.reject(e); return true; } return false; }

  onState(s, evt) {
    const st = evt.state;
    if (st === 'connected') {
      s.state = 'connected';
      s.error = null;
      if (evt.pair) s.pair = describePair(evt.pair.local, evt.pair.remote);
      if (s.role === 'join' && !s.voiceUp) { s.voiceUp = true; this.worker.send({ op: 'open', sid: s.id, ch: 'udp' }); }
    } else if (st === 'failed') {
      s.state = 'failed';
      s.error = FAILED_MESSAGE;
    } else if (st === 'disconnected') {
      s.state = 'reconnecting';
    } else if (st === 'closed') {
      s.state = 'closed';
    }
    this.changed();
  }

  async openJoinerSockets(s, preferPort) {
    s.localPort = await freeTcpPort(preferPort);
    s.server = net.createServer((socket) => this.joinerConnection(s, socket));
    await listenTcp(s.server, s.localPort);
    s.udp = dgram.createSocket('udp4');
    try {
      await bindUdp(s.udp, s.voicePort);
      s.voiceLocal = true;
    } catch {
      s.voiceLocal = false;
      s.voiceNote = `Voice chat port ${s.voicePort} is busy on this computer, so voice will not connect. Close other Minecraft servers and rejoin.`;
      try { s.udp.close(); } catch { /* */ }
      s.udp = null;
    }
    if (s.udp) {
      s.udp.on('message', (msg, rinfo) => {
        s.voicePeer = rinfo;
        this.sendChunked(s, 'udp', msg, false);
      });
      s.udp.on('error', () => {});
    }
  }

  joinerConnection(s, socket) {
    if (s.state !== 'connected' && s.state !== 'reconnecting') { socket.destroy(); return; }
    const ch = `tcp:${s.nextConn++}`;
    const c = { socket, open: false, pending: [] };
    s.conns.set(ch, c);
    socket.setNoDelay(true);
    socket.on('data', (d) => { s.bytesOut += d.length; if (c.open) this.sendChunked(s, ch, d); else c.pending.push(d); });
    socket.on('close', () => { if (s.conns.get(ch) === c) { s.conns.delete(ch); this.worker.send({ op: 'close-ch', sid: s.id, ch }); this.changed(); } });
    socket.on('error', () => {});
    this.worker.send({ op: 'open', sid: s.id, ch });
    this.changed();
  }

  async onChannelOpen(s, ch) {
    if (ch === 'udp') {
      if (s.role === 'host' && !s.udp) {
        s.udp = dgram.createSocket('udp4');
        s.udp.on('message', (msg) => this.sendChunked(s, 'udp', msg, false));
        s.udp.on('error', () => {});
        await bindUdp(s.udp, 0).catch(() => {});
      }
      s.voiceUp = true;
      this.changed();
      return;
    }
    if (!ch.startsWith('tcp:')) return;
    if (s.role === 'join') {
      const c = s.conns.get(ch);
      if (!c) { this.worker.send({ op: 'close-ch', sid: s.id, ch }); return; }
      c.open = true;
      for (const d of c.pending.splice(0)) this.sendChunked(s, ch, d);
      return;
    }
    // Host: the friend opened a game connection; dial the LAN world.
    const port = Number(await this.hostPort(s.instanceId)) || MC_PORT;
    const socket = net.connect({ host: '127.0.0.1', port });
    const c = { socket, open: false, pending: [] };
    s.conns.set(ch, c);
    socket.setNoDelay(true);
    socket.on('connect', () => { c.open = true; for (const d of c.pending.splice(0)) socket.write(d); });
    socket.on('data', (d) => { s.bytesOut += d.length; this.sendChunked(s, ch, d); });
    socket.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') { s.error = `Your world is not open on port ${port}. Open it to LAN first (Esc → Open to LAN).`; this.changed(); }
    });
    socket.on('close', () => { if (s.conns.get(ch) === c) { s.conns.delete(ch); this.worker.send({ op: 'close-ch', sid: s.id, ch }); this.changed(); } });
    this.changed();
  }

  onData(s, ch, buf) {
    s.bytesIn += buf.length;
    if (ch === 'udp') {
      if (!s.udp) return;
      if (s.role === 'host') s.udp.send(buf, s.voicePort, '127.0.0.1');
      else if (s.voicePeer) s.udp.send(buf, s.voicePeer.port, s.voicePeer.address);
      return;
    }
    const c = s.conns.get(ch);
    if (!c) return;
    if (c.open || s.role === 'join') c.socket.write(buf);
    else c.pending.push(buf);
  }

  onChannelClose(s, ch) {
    const c = s.conns.get(ch);
    if (!c) return;
    s.conns.delete(ch);
    try { c.socket.end(); } catch { /* */ }
    this.changed();
  }

  sendChunked(s, ch, buf, split = true) {
    if (!split || buf.length <= CHUNK) { this.worker.send({ op: 'send', sid: s.id, ch, data: buf }); return; }
    for (let i = 0; i < buf.length; i += CHUNK) this.worker.send({ op: 'send', sid: s.id, ch, data: buf.subarray(i, i + CHUNK) });
  }

  view(s) {
    return {
      id: s.id, role: s.role, state: s.state, code: s.code || null, nat: s.nat || null, pair: s.pair || null,
      error: s.error || null, instanceId: s.instanceId || null, name: s.name || null, peerName: s.peerName || null,
      localPort: s.localPort || null, voicePort: s.voicePort || null, voiceLocal: s.voiceLocal !== false, voiceNote: s.voiceNote || null,
      voiceUp: Boolean(s.voiceUp), connections: s.conns.size, bytesIn: s.bytesIn, bytesOut: s.bytesOut, createdAt: s.createdAt,
      mcVersion: s.mcVersion || null,
      joinAddress: s.role === 'join' && s.localPort ? (s.localPort === MC_PORT ? 'localhost' : `localhost:${s.localPort}`) : null,
    };
  }

  changed() { try { this.emitFn('p2p:update', this.list()); } catch { /* */ } }
}

module.exports = { P2PManager, freeTcpPort, CHUNK };
