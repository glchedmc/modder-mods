'use strict';
// End-to-end check of Direct (free) hosting inside Electron: a fake "LAN
// world" (TCP echo) and fake voice server (UDP echo) on the host side; a
// client connects to the joiner's localhost port through real WebRTC.
// Run: xvfb-run -a npx electron scripts/p2p-smoke.js
const { app } = require('electron');
const net = require('net');
const dgram = require('dgram');
const { startP2P } = require('../electron/p2p-host');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
const out = (m) => process.stdout.write(`[p2p-smoke] ${m}\n`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const result = { ok: false };
  try {
    const world = net.createServer((s) => s.pipe(s));
    await new Promise((r) => world.listen(0, '127.0.0.1', r));
    const worldPort = world.address().port;
    const voice = dgram.createSocket('udp4');
    await new Promise((r) => voice.bind(0, '127.0.0.1', r));
    const voicePort = voice.address().port;
    voice.on('message', (m, ri) => voice.send(Buffer.concat([Buffer.from('echo:'), m]), ri.port, ri.address));

    const p2p = startP2P({ hostPort: () => worldPort, voicePort: () => voicePort, joinPort: 25565 });
    const m = p2p.manager;
    const invite = await m.createInvite({ instanceId: 'smoke', name: 'Smoke world' });
    out(`invite ${invite.code.length} chars, NAT ${invite.nat.type}: ${invite.nat.message}`);
    const joined = await m.join(invite.code, { name: 'Friend' });
    out(`reply ${joined.code.length} chars, local port ${joined.localPort}, voice ${joined.voicePort}`);
    await m.acceptReply(invite.id, joined.code);
    for (let i = 0; i < 100 && !m.list().every((s) => s.state === 'connected'); i++) await wait(100);
    const states = m.list().map((s) => `${s.role}:${s.state}:${s.pair ? s.pair.label : '-'}`);
    out(`states ${states.join(' ')}`);
    // TCP through the tunnel (1 MB to exercise chunking and ordering).
    const payload = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 31) & 255;
    const got = await new Promise((resolve, reject) => {
      const c = net.connect(joined.localPort, '127.0.0.1');
      const chunks = []; let n = 0;
      c.on('data', (d) => { chunks.push(d); n += d.length; if (n >= payload.length) { c.end(); resolve(Buffer.concat(chunks)); } });
      c.on('error', reject);
      c.write(payload);
      setTimeout(() => reject(new Error(`tcp timeout after ${n} bytes`)), 15000);
    });
    out(`tcp echo ${got.equals(payload) ? 'OK' : 'MISMATCH'} (${got.length} bytes)`);
    // UDP voice through the tunnel.
    await wait(300);
    const udpOk = await new Promise((resolve) => {
      const u = dgram.createSocket('udp4');
      u.on('message', (msg) => { u.close(); resolve(msg.toString()); });
      u.bind(0, '127.0.0.1', () => {
        const t = setInterval(() => u.send(Buffer.from('voice-ping'), joined.voicePort, '127.0.0.1'), 200);
        setTimeout(() => { clearInterval(t); try { u.close(); } catch { /* */ } resolve(null); }, 5000);
        u.on('close', () => clearInterval(t));
      });
    });
    out(`udp echo ${udpOk === 'echo:voice-ping' ? 'OK' : `FAIL (${udpOk})`}`);
    result.ok = got.equals(payload) && udpOk === 'echo:voice-ping';
    result.nat = invite.nat;
    m.closeAll();
  } catch (e) {
    out(`error ${e.stack}`);
  }
  out(result.ok ? 'PASS' : 'FAIL');
  app.exit(result.ok ? 0 : 1);
});
