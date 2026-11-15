'use strict';
// A small Nostr relay pool: several relays, publish to all, subscribe to all, de-duplicate, reconnect.
const { matchFilters } = require('nostr-tools');
const { verifyEvent } = require('./crypto');

// Free public relays (checked Nov 2026: all accept gift wraps and forward ephemeral events). Editable in Settings.
const DEFAULT_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://offchain.pub', 'wss://relay.damus.io'];

class RelayConn {
  constructor(pool, url) {
    this.pool = pool; this.url = url; this.ws = null; this.state = 'idle'; this.error = null;
    this.backoff = 1000; this.timer = null; this.pendingOk = new Map(); this.closed = false; this.lastEventAt = 0;
  }
  connect() {
    if (this.closed) return;
    this.state = 'connecting'; this.pool.changed();
    let ws;
    try { ws = new this.pool.WebSocket(this.url); } catch (e) { this.fail(e); return; }
    this.ws = ws;
    const openTimer = setTimeout(() => { if (this.state === 'connecting') { try { ws.terminate ? ws.terminate() : ws.close(); } catch { /* */ } this.fail(new Error('timeout')); } }, 10000);
    ws.onopen = () => {
      clearTimeout(openTimer);
      this.state = 'open'; this.error = null; this.backoff = 1000; this.pool.changed();
      for (const [id, sub] of this.pool.subs) this.sendReq(id, sub);
      for (const ev of this.pool.outbox.values()) this.send(['EVENT', ev]);
    };
    ws.onmessage = (m) => this.onMessage(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString());
    ws.onerror = (e) => { this.error = (e && e.message) || 'connection error'; };
    ws.onclose = () => { clearTimeout(openTimer); if (this.ws === ws) this.fail(new Error(this.error || 'closed')); };
  }
  fail(err) {
    this.ws = null;
    for (const [, w] of this.pendingOk) w(false, 'disconnected');
    this.pendingOk.clear();
    if (this.closed) { this.state = 'closed'; this.pool.changed(); return; }
    this.state = 'error'; this.error = err.message; this.pool.changed();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), this.backoff);
    if (this.timer.unref) this.timer.unref();
    this.backoff = Math.min(this.backoff * 2, 60000);
  }
  send(msg) {
    if (this.state !== 'open' || !this.ws) return false;
    try { this.ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  }
  sendReq(id, sub) { this.send(['REQ', id, ...sub.filters]); }
  onMessage(text) {
    let msg; try { msg = JSON.parse(text); } catch { return; }
    if (!Array.isArray(msg)) return;
    const [type] = msg;
    if (type === 'EVENT') {
      const [, subId, ev] = msg;
      this.lastEventAt = Date.now();
      this.pool.onEvent(subId, ev, this.url);
    } else if (type === 'OK') {
      const [, id, ok, reason] = msg;
      const w = this.pendingOk.get(id); if (w) { this.pendingOk.delete(id); w(Boolean(ok), reason || ''); }
    } else if (type === 'EOSE') {
      const sub = this.pool.subs.get(msg[1]); if (sub && sub.onEose) sub.onEose(this.url);
    } else if (type === 'NOTICE' || type === 'CLOSED') {
      this.error = String(msg[msg.length - 1] || '').slice(0, 200);
    }
  }
  publish(ev) {
    return new Promise((resolve) => {
      if (!this.send(['EVENT', ev])) { resolve({ url: this.url, ok: false, reason: 'not connected' }); return; }
      const t = setTimeout(() => { this.pendingOk.delete(ev.id); resolve({ url: this.url, ok: false, reason: 'no answer' }); }, 6000);
      if (t.unref) t.unref();
      this.pendingOk.set(ev.id, (ok, reason) => { clearTimeout(t); resolve({ url: this.url, ok, reason }); });
    });
  }
  close() {
    this.closed = true; clearTimeout(this.timer);
    if (this.ws) { try { this.ws.close(); } catch { /* */ } }
    this.ws = null; this.state = 'closed';
  }
}

class RelayPool {
  constructor(urls = DEFAULT_RELAYS, { WebSocket = require('ws'), onChange = () => {} } = {}) {
    this.WebSocket = WebSocket;
    this.onChange = onChange;
    this.subs = new Map();
    this.seen = new Map(); // event id -> time, for de-duplication across relays
    this.outbox = new Map(); // events published while nothing was connected
    this.relays = [];
    this.setRelays(urls);
  }
  setRelays(urls) {
    const want = [...new Set((urls || []).map((u) => String(u).trim()).filter((u) => /^wss?:\/\/[^\s]+$/i.test(u)))];
    for (const r of this.relays) if (!want.includes(r.url)) r.close();
    const keep = this.relays.filter((r) => want.includes(r.url));
    for (const u of want) if (!keep.some((r) => r.url === u)) { const r = new RelayConn(this, u); keep.push(r); r.connect(); }
    this.relays = keep;
    this.changed();
  }
  changed() { try { this.onChange(this.status()); } catch { /* */ } }
  status() { return this.relays.map((r) => ({ url: r.url, state: r.state, error: r.state === 'open' ? null : r.error })); }
  connectedCount() { return this.relays.filter((r) => r.state === 'open').length; }
  waitForConnection(ms = 8000) {
    if (this.connectedCount()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const start = Date.now();
      const t = setInterval(() => { if (this.closed || this.connectedCount() || Date.now() - start > ms) { clearInterval(t); resolve(this.connectedCount() > 0); } }, 50);
      if (t.unref) t.unref();
    });
  }

  /** Sends to every connected relay; resolves when one accepts (or all fail). */
  async publish(ev) {
    if (!this.connectedCount()) { this.outbox.set(ev.id, ev); return { ok: false, queued: true, results: [] }; }
    const results = await new Promise((resolve) => {
      const out = []; let done = false;
      const ps = this.relays.map((r) => r.publish(ev).then((res) => {
        out.push(res);
        if (!done && res.ok) { done = true; resolve(out); }
      }));
      Promise.all(ps).then(() => { if (!done) resolve(out); });
    });
    const ok = results.some((r) => r.ok);
    if (!ok) this.outbox.set(ev.id, ev); else this.outbox.delete(ev.id);
    return { ok, results };
  }

  subscribe(id, filters, onEvent, { onEose } = {}) {
    const sub = { filters, onEvent, onEose };
    this.subs.set(id, sub);
    for (const r of this.relays) r.sendReq(id, sub);
    return () => this.unsubscribe(id);
  }
  unsubscribe(id) {
    this.subs.delete(id);
    for (const r of this.relays) r.send(['CLOSE', id]);
  }
  /** One-shot query: collects events until every connected relay sent EOSE (or the timeout). */
  query(filters, { timeout = 5000 } = {}) {
    const id = `q${Math.random().toString(36).slice(2, 10)}`;
    return new Promise((resolve) => {
      const events = new Map(); const eose = new Set();
      const finish = () => { clearTimeout(t); this.unsubscribe(id); resolve([...events.values()]); };
      const t = setTimeout(finish, timeout);
      if (t.unref) t.unref();
      this.subscribe(id, filters, (ev) => events.set(ev.id, ev), {
        onEose: (url) => { eose.add(url); if (eose.size >= Math.max(1, this.connectedCount())) finish(); },
      });
    });
  }

  onEvent(subId, ev, url) {
    const sub = this.subs.get(subId);
    if (!sub || !ev || typeof ev.id !== 'string') return;
    const key = `${subId}:${ev.id}`; // de-duplicate per subscription (the same event comes from every relay)
    if (this.seen.has(key)) return;
    if (!matchFilters(sub.filters, ev) || !verifyEvent(ev)) return;
    this.seen.set(key, Date.now());
    if (this.seen.size > 5000) { const cut = [...this.seen.keys()].slice(0, 2500); for (const k of cut) this.seen.delete(k); }
    sub.onEvent(ev, url);
  }
  close() { this.closed = true; for (const r of this.relays) r.close(); this.relays = []; this.subs.clear(); }
}

module.exports = { RelayPool, DEFAULT_RELAYS };
