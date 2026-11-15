'use strict';
// Hidden window that owns the WebRTC peer connections for Direct (free)
// hosting. Pure data plumbing: the main process (core/p2p/manager.js) does
// all TCP/UDP work. No TURN relay: if ICE cannot punch through, it fails.
/* global p2pBridge, RTCPeerConnection */
const peers = new Map(); // sid -> { pc, channels: Map<label, RTCDataChannel>, queue: Map<label, Uint8Array[]> }
const HIGH = 4 * 1024 * 1024;
const LOW = 1024 * 1024;

const emit = (evt) => p2pBridge.emit(evt);

function gather(pc, timeoutMs = 7000) {
  const cands = [];
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; resolve(cands); };
    pc.addEventListener('icecandidate', (e) => {
      if (!e.candidate) { finish(); return; }
      const c = e.candidate;
      cands.push({ type: c.type, address: c.address, port: c.port, relatedAddress: c.relatedAddress, relatedPort: c.relatedPort, protocol: c.protocol, url: e.url || null });
    });
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') finish(); });
    setTimeout(finish, timeoutMs);
  });
}

async function selectedPair(pc) {
  try {
    const stats = await pc.getStats();
    let pairId = null;
    stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId; });
    let pair = null;
    stats.forEach((r) => { if (r.type === 'candidate-pair' && (r.id === pairId || (!pairId && r.nominated && r.state === 'succeeded'))) pair = r; });
    if (!pair) return null;
    const l = stats.get(pair.localCandidateId);
    const r = stats.get(pair.remoteCandidateId);
    return { local: l && l.candidateType, remote: r && r.candidateType };
  } catch { return null; }
}

function wire(sid, peer, dc) {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = LOW;
  peer.channels.set(dc.label, dc);
  dc.onopen = () => emit({ ev: 'ch-open', sid, ch: dc.label });
  dc.onmessage = (e) => { if (typeof e.data !== 'string') emit({ ev: 'data', sid, ch: dc.label, data: new Uint8Array(e.data) }); };
  dc.onclose = () => { peer.channels.delete(dc.label); peer.queue.delete(dc.label); emit({ ev: 'ch-close', sid, ch: dc.label }); };
  dc.onbufferedamountlow = () => flush(peer, dc);
}

function flush(peer, dc) {
  const q = peer.queue.get(dc.label);
  while (q && q.length && dc.readyState === 'open' && dc.bufferedAmount < HIGH) dc.send(q.shift());
}

function send(peer, label, data) {
  const dc = peer.channels.get(label);
  if (!dc || dc.readyState !== 'open') return;
  if (label === 'udp') { if (dc.bufferedAmount < HIGH) dc.send(data); return; } // voice: drop when congested
  const q = peer.queue.get(label) || [];
  peer.queue.set(label, q);
  if (!q.length && dc.bufferedAmount < HIGH) dc.send(data);
  else { q.push(data); }
}

async function create(cmd) {
  const { sid, role } = cmd;
  const pc = new RTCPeerConnection({ iceServers: cmd.iceServers || [], iceCandidatePoolSize: 0 });
  const peer = { pc, channels: new Map(), queue: new Map(), role };
  peers.set(sid, peer);
  pc.ondatachannel = (e) => wire(sid, peer, e.channel);
  let reported = '';
  pc.onconnectionstatechange = async () => {
    const st = pc.connectionState;
    if (st === reported) return;
    reported = st;
    emit({ ev: 'state', sid, state: st, pair: st === 'connected' ? await selectedPair(pc) : null });
  };
  const gathered = gather(pc);
  if (role === 'host') {
    wire(sid, peer, pc.createDataChannel('ctl', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
  } else {
    await pc.setRemoteDescription({ type: 'offer', sdp: cmd.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
  }
  const candidates = await gathered;
  emit({ ev: 'local-sdp', sid, sdp: pc.localDescription.sdp, candidates });
}

p2pBridge.onCommand(async (cmd) => {
  const peer = peers.get(cmd.sid);
  try {
    switch (cmd.op) {
      case 'create': await create(cmd); break;
      case 'answer': if (peer) await peer.pc.setRemoteDescription({ type: 'answer', sdp: cmd.sdp }); break;
      case 'open':
        if (peer && !peer.channels.has(cmd.ch)) wire(cmd.sid, peer, peer.pc.createDataChannel(cmd.ch, cmd.ch === 'udp' ? { ordered: false, maxRetransmits: 0 } : { ordered: true }));
        break;
      case 'send': if (peer) send(peer, cmd.ch, cmd.data); break;
      case 'close-ch': if (peer) { const dc = peer.channels.get(cmd.ch); if (dc) dc.close(); } break;
      case 'close': if (peer) { try { peer.pc.close(); } catch { /* */ } peers.delete(cmd.sid); } break;
      default: break;
    }
  } catch (e) {
    emit({ ev: 'error', sid: cmd.sid, message: e && e.message ? e.message : String(e) });
  }
});
p2pBridge.ready();
