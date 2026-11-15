'use strict';
const { P2PManager } = require('../../core/p2p/manager');

/** A stand-in for the WebRTC worker that links sessions in-process. */
function fakeWorkerPair() {
  const managers = [];
  const peers = new Map(); // sid -> other sid
  const owner = new Map(); // sid -> manager
  const opened = new Set();
  const send = (fromMgr) => (cmd) => setImmediate(() => {
    owner.set(cmd.sid, fromMgr);
    const other = peers.get(cmd.sid);
    const to = other && owner.get(other);
    switch (cmd.op) {
      case 'create':
        if (cmd.role === 'join') { const hostSid = /fake-offer-(\w+)/.exec(cmd.sdp)[1]; peers.set(cmd.sid, hostSid); peers.set(hostSid, cmd.sid); }
        fromMgr.handle({ ev: 'local-sdp', sid: cmd.sid, sdp: `v=0\r\nfake-${cmd.role === 'host' ? 'offer' : 'answer'}-${cmd.sid}\r\n`, candidates: [{ type: 'host', address: '10.0.0.2', port: 1 }, { type: 'srflx', address: '198.51.100.1', port: 9, relatedAddress: '10.0.0.2', relatedPort: 1 }] });
        break;
      case 'answer':
        fromMgr.handle({ ev: 'state', sid: cmd.sid, state: 'connected', pair: { local: 'srflx', remote: 'srflx' } });
        if (to) to.handle({ ev: 'state', sid: other, state: 'connected', pair: { local: 'srflx', remote: 'srflx' } });
        break;
      case 'open':
        if (!opened.has(`${cmd.sid}/${cmd.ch}`)) { opened.add(`${cmd.sid}/${cmd.ch}`); fromMgr.handle({ ev: 'ch-open', sid: cmd.sid, ch: cmd.ch }); if (to) to.handle({ ev: 'ch-open', sid: other, ch: cmd.ch }); }
        break;
      case 'send': if (to) to.handle({ ev: 'data', sid: other, ch: cmd.ch, data: new Uint8Array(cmd.data) }); break;
      case 'close-ch': if (to) to.handle({ ev: 'ch-close', sid: other, ch: cmd.ch }); break;
      default: break;
    }
  });
  const make = (opts) => { const m = new P2PManager({ send: (c) => send(m)(c) }, opts); managers.push(m); return m; };
  return { make };
}

module.exports = { fakeWorkerPair };
