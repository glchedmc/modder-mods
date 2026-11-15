'use strict';
// Tiny in-memory Nostr relay (NIP-01 subset) for tests and LAN-only use. Not for the public internet.
const { WebSocketServer } = require('ws');
const { matchFilters, verifyEvent } = require('nostr-tools');

const isEphemeral = (k) => k >= 20000 && k < 30000;
const isReplaceable = (k) => k === 0 || k === 3 || (k >= 10000 && k < 20000);

function startDevRelay({ port = 0, host = '127.0.0.1' } = {}) {
  const events = [];
  const clients = new Set();
  const wss = new WebSocketServer({ port, host });
  const stats = { published: 0, ephemeral: 0 };
  wss.on('connection', (ws) => {
    const subs = new Map();
    const c = { ws, subs };
    clients.add(c);
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!Array.isArray(msg)) return;
      const [type] = msg;
      if (type === 'EVENT') {
        const ev = msg[1];
        if (!ev || !verifyEvent(ev)) { ws.send(JSON.stringify(['OK', ev && ev.id, false, 'invalid: bad signature'])); return; }
        stats.published++;
        if (isEphemeral(ev.kind)) stats.ephemeral++;
        else if (!events.some((e) => e.id === ev.id)) {
          if (isReplaceable(ev.kind)) { for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === ev.kind && events[i].pubkey === ev.pubkey) events.splice(i, 1); }
          events.push(ev);
        }
        ws.send(JSON.stringify(['OK', ev.id, true, '']));
        for (const o of clients) for (const [id, filters] of o.subs) if (matchFilters(filters, ev)) o.ws.send(JSON.stringify(['EVENT', id, ev]));
      } else if (type === 'REQ') {
        const [, id, ...filters] = msg;
        subs.set(id, filters);
        const limit = Math.min(...filters.map((f) => f.limit || 500));
        const hits = events.filter((e) => matchFilters(filters, e)).sort((a, b) => b.created_at - a.created_at).slice(0, limit);
        for (const e of hits) ws.send(JSON.stringify(['EVENT', id, e]));
        ws.send(JSON.stringify(['EOSE', id]));
      } else if (type === 'CLOSE') subs.delete(msg[1]);
    });
    ws.on('close', () => clients.delete(c));
  });
  return new Promise((resolve) => wss.on('listening', () => resolve({
    url: `ws://${host}:${wss.address().port}`,
    events, stats,
    dropClients() { for (const c of clients) c.ws.terminate(); },
    close: () => new Promise((r) => { for (const c of clients) c.ws.terminate(); wss.close(() => r()); }),
  })));
}

module.exports = { startDevRelay };
