'use strict';
// 0.1.4: Linux support, glass strength, Host World providers (Direct P2P,
// Tailscale, own IP + UPnP, e4mc), voice chat setup, skin editor, player skins.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const dgram = require('dgram');
const zlib = require('zlib');

const codec = require('../core/p2p/codec');
const { classifyNat, describePair, FAILED_MESSAGE } = require('../core/p2p/nat');
const { P2PManager, CHUNK } = require('../core/p2p/manager');
const hosting = require('../core/hosting');
const upnp = require('../core/upnp');
const tailscale = require('../core/tailscale');
const { SecretStore, platformCipher, PLAIN_MAGIC } = require('../core/secrets');
const settingsStore = require('../core/settings');
const mic = require('../core/mic');
const java = require('../core/java');
const instances = require('../core/instances');
const { LauncherService } = require('../core/service');
const { plainCipher } = require('../core/secrets');
const { SkinLibrary } = require('../core/skins/library');
const lookup = require('../core/skins/lookup');
const loaders = require('../core/loaders');

function crc32(buf) {
  let c; const table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, rgba = Buffer.alloc(w * h * 4, 255)) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Direct (free) P2P ----------
const FAKE_SDP = 'v=0\r\no=- 46117 2 IN IP4 127.0.0.1\r\ns=-\r\na=ice-ufrag:abcd\r\na=ice-pwd:0123456789abcdef01234567\r\na=candidate:1 1 udp 2122260223 192.168.1.42 54321 typ host\r\n';

test('p2p codec: invite/reply round trip, tolerant paste, clear errors', () => {
  const inv = codec.encode('offer', { sdp: FAKE_SDP, name: 'Izak', voicePort: 24454, sid: 'abc123' });
  assert.ok(inv.startsWith('SATURN-INVITE-'));
  assert.ok(inv.length < 600, 'compressed invite stays short');
  const pasted = `  "${inv.slice(0, 40)}\n${inv.slice(40)}"  `;
  const d = codec.decode(pasted, 'offer');
  assert.equal(d.kind, 'offer'); assert.equal(d.sdp, FAKE_SDP); assert.equal(d.name, 'Izak'); assert.equal(d.voicePort, 24454); assert.equal(d.sid, 'abc123');
  const rep = codec.encode('answer', { sdp: FAKE_SDP, name: 'Steve' });
  assert.throws(() => codec.decode(rep, 'offer'), /reply code/);
  assert.throws(() => codec.decode(inv, 'answer'), /invite code/);
  assert.throws(() => codec.decode('hello'), /not a Saturn Client/);
  assert.throws(() => codec.decode(inv.slice(0, inv.length - 30)), /incomplete or damaged/);
  assert.throws(() => codec.decode(''), /Paste a code/);
  assert.throws(() => codec.encode('offer', { sdp: 'nope' }), /session description/);
});

test('p2p NAT: open, cone, symmetric, blocked and pair labels', () => {
  const host = { type: 'host', address: '192.168.1.42', port: 5000, protocol: 'udp' };
  assert.equal(classifyNat([host]).type, 'blocked');
  assert.equal(classifyNat([]).type, 'unknown');
  assert.equal(classifyNat([{ type: 'host', address: '203.0.113.5', port: 5000 }, { type: 'srflx', address: '203.0.113.5', port: 5000, relatedAddress: '203.0.113.5', relatedPort: 5000 }]).type, 'open');
  const cone = classifyNat([host, { type: 'srflx', address: '198.51.100.7', port: 61000, relatedAddress: '192.168.1.42', relatedPort: 5000 }, { type: 'srflx', address: '198.51.100.7', port: 61000, relatedAddress: '192.168.1.42', relatedPort: 5000 }]);
  assert.equal(cone.type, 'cone'); assert.equal(cone.publicIp, '198.51.100.7');
  const sym = classifyNat([host, { type: 'srflx', address: '198.51.100.7', port: 61000, relatedAddress: '192.168.1.42', relatedPort: 5000 }, { type: 'srflx', address: '198.51.100.7', port: 61007, relatedAddress: '192.168.1.42', relatedPort: 5000 }]);
  assert.equal(sym.type, 'symmetric'); assert.match(sym.message, /Tailscale/);
  assert.equal(classifyNat([host, { type: 'srflx', address: '1.2.3.4', port: 1, protocol: 'tcp' }]).type, 'blocked', 'TCP candidates do not count');
  assert.equal(describePair('host', 'host').kind, 'lan');
  assert.equal(describePair('srflx', 'prflx').kind, 'p2p');
  assert.equal(describePair('relay', 'host').kind, 'relay');
  assert.match(FAILED_MESSAGE, /symmetric NAT/);
});

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

test('p2p manager: invite -> reply -> TCP game tunnel and UDP voice tunnel', async () => {
  const world = net.createServer((s) => s.pipe(s));
  await new Promise((r) => world.listen(0, '127.0.0.1', r));
  const voice = dgram.createSocket('udp4');
  await new Promise((r) => voice.bind(0, '127.0.0.1', r));
  voice.on('message', (m, ri) => voice.send(Buffer.concat([Buffer.from('pong:'), m]), ri.port, ri.address));
  const events = [];
  const pair = fakeWorkerPair();
  const host = pair.make({ hostPort: () => world.address().port, voicePort: () => voice.address().port, emit: (ch, list) => events.push([ch, list.length]) });
  const friend = pair.make({ joinPort: 0 });
  try {
    const inv = await host.createInvite({ instanceId: 'w1', name: 'Izak world', mcVersion: '26.3' });
    assert.equal(inv.state, 'waiting-reply'); assert.equal(inv.nat.type, 'cone');
    const joined = await friend.join(inv.code, { name: 'Steve' });
    assert.equal(joined.state, 'waiting-host'); assert.ok(joined.localPort > 0); assert.match(joined.joinAddress, /^localhost/);
    assert.equal(joined.voicePort, voice.address().port, 'joiner binds the host voice port locally');
    await assert.rejects(host.acceptReply(inv.id, inv.code), /invite code/);
    await host.acceptReply(inv.id, joined.code);
    await wait(30);
    assert.equal(host.list()[0].state, 'connected'); assert.equal(host.list()[0].peerName, 'Steve');
    assert.equal(friend.list()[0].pair.kind, 'p2p');
    const payload = Buffer.alloc(CHUNK * 3 + 123); for (let i = 0; i < payload.length; i++) payload[i] = (i * 7) & 255;
    const echoed = await new Promise((resolve, reject) => {
      const c = net.connect(joined.localPort, '127.0.0.1'); const parts = []; let n = 0;
      c.on('data', (d) => { parts.push(d); n += d.length; if (n >= payload.length) { c.end(); resolve(Buffer.concat(parts)); } });
      c.on('error', reject); c.write(payload);
    });
    assert.ok(echoed.equals(payload), 'game bytes survive the tunnel in order');
    const pong = await new Promise((resolve) => {
      const u = dgram.createSocket('udp4');
      u.on('message', (m) => { u.close(); resolve(m.toString()); });
      u.bind(0, '127.0.0.1', () => u.send(Buffer.from('ping'), joined.voicePort, '127.0.0.1'));
    });
    assert.equal(pong, 'pong:ping', 'voice packets go both ways');
    assert.ok(events.length > 0 && events.every(([ch]) => ch === 'p2p:update'));
  } finally {
    host.closeAll(); friend.closeAll(); world.close(); voice.close();
  }
  assert.equal(host.list().length, 0);
});

test('p2p manager: world not open and ICE failure give clear messages', async () => {
  const pair = fakeWorkerPair();
  const closed = net.createServer(); await new Promise((r) => closed.listen(0, '127.0.0.1', r)); const deadPort = closed.address().port; closed.close();
  const host = pair.make({ hostPort: () => deadPort, voicePort: () => 0 });
  const friend = pair.make({ joinPort: 0 });
  try {
    const inv = await host.createInvite({ instanceId: 'w' });
    const j = await friend.join(inv.code);
    await host.acceptReply(inv.id, j.code); await wait(20);
    const c = net.connect(j.localPort, '127.0.0.1'); c.on('error', () => {});
    await wait(150);
    assert.match(host.list()[0].error, /Open to LAN/);
    host.handle({ ev: 'state', sid: inv.id, state: 'failed' });
    assert.equal(host.list()[0].state, 'failed'); assert.match(host.list()[0].error, /Tailscale or your own IP/);
    await assert.rejects(host.acceptReply('nope', j.code), /closed/);
    await assert.rejects(friend.join('SATURN-INVITE-garbage'), /damaged/);
  } finally { host.closeAll(); friend.closeAll(); }
});

// ---------- hosting helpers ----------
test('hosting: providers, LAN port, CGNAT, DDNS names, join addresses, voice_host', () => {
  assert.equal(hosting.DEFAULT_PROVIDER, 'p2p');
  assert.deepEqual(Object.keys(hosting.PROVIDERS), ['p2p', 'tailscale', 'direct', 'e4mc']);
  assert.equal(hosting.PROVIDERS.e4mc.voice, false);
  assert.equal(hosting.parseLanPort('[Server thread/INFO]: Started serving on 51234'), 51234);
  assert.equal(hosting.parseLanPort('Local game hosted on port 25565'), 25565);
  assert.equal(hosting.parseLanPort('nothing'), null);
  assert.ok(hosting.isCgnatIp('100.72.1.9')); assert.ok(!hosting.isCgnatIp('100.200.1.9'));
  assert.ok(hosting.isPrivateIp('192.168.0.4') && hosting.isPrivateIp('10.1.2.3') && hosting.isPrivateIp('172.20.0.1')); assert.ok(!hosting.isPrivateIp('8.8.8.8'));
  assert.deepEqual(hosting.natVerdict({ publicIp: '203.0.113.9', routerIp: '203.0.113.9' }), { cgnat: false, known: true });
  assert.equal(hosting.natVerdict({ publicIp: '203.0.113.9', routerIp: '100.64.3.2' }).cgnat, true);
  assert.equal(hosting.natVerdict({ publicIp: '203.0.113.9', routerIp: '198.51.100.2' }).cgnat, true, 'double NAT');
  assert.equal(hosting.natVerdict({}).known, false);
  const steps = hosting.routerSteps({ localIp: '192.168.1.42', gateway: '192.168.1.1' });
  assert.ok(steps.some((s) => s.includes('TCP 25565 → 192.168.1.42')) && steps.some((s) => s.includes('UDP 24454')) && steps[0].includes('192.168.1.1'));
  assert.equal(hosting.cleanDdnsName(' https://MyWorld.duckdns.org/ '), 'myworld.duckdns.org');
  assert.equal(hosting.cleanDdnsName(''), '');
  assert.throws(() => hosting.cleanDdnsName('not a host'), /host name/);
  assert.equal(hosting.duckdnsSubdomain('myworld.duckdns.org'), 'myworld'); assert.equal(hosting.duckdnsSubdomain('mc.example.com'), null);
  const ts = { ip4: '100.101.1.2', dnsName: 'mac.tail1.ts.net' };
  assert.equal(hosting.joinAddressFor('direct', { publicIp: '203.0.113.9' }), '203.0.113.9');
  assert.equal(hosting.joinAddressFor('direct', { publicIp: '203.0.113.9', ddnsName: 'w.duckdns.org', mcPort: 25570 }), 'w.duckdns.org:25570');
  assert.equal(hosting.joinAddressFor('tailscale', { tailscale: ts }), 'mac.tail1.ts.net');
  assert.equal(hosting.joinAddressFor('p2p', { p2pLocalPort: 25566 }), 'localhost:25566');
  assert.equal(hosting.voiceHostFor('direct', { publicIp: '203.0.113.9' }), '203.0.113.9:24454');
  assert.equal(hosting.voiceHostFor('direct', { publicIp: '203.0.113.9', ddnsName: 'w.duckdns.org', voicePort: 24500 }), 'w.duckdns.org:24500');
  assert.equal(hosting.voiceHostFor('tailscale', { tailscale: { ip4: '100.101.1.2' } }), '100.101.1.2:24454');
  assert.equal(hosting.voiceHostFor('p2p', { publicIp: '1.2.3.4' }), '', 'P2P joiners use their local tunnel');
  assert.equal(hosting.voiceHostFor('e4mc', {}), '');
});

test('hosting: voicechat-server.properties paths and edits keep other settings', async () => {
  const dir = tmp('sat-voice-');
  assert.equal(hosting.voiceConfigPath({ type: 'client', loader: 'fabric' }, dir), path.join(dir, 'config', 'voicechat', 'voicechat-server.properties'));
  assert.equal(hosting.voiceConfigPath({ type: 'server', loader: 'paper' }, dir), path.join(dir, 'plugins', 'voicechat', 'voicechat-server.properties'));
  assert.equal(hosting.voiceConfigPath({ type: 'server', loader: 'fabric-server' }, dir), path.join(dir, 'config', 'voicechat', 'voicechat-server.properties'));
  const inst = { type: 'client', loader: 'fabric' };
  assert.deepEqual(await hosting.readVoiceConfig(inst, dir), { file: hosting.voiceConfigPath(inst, dir), exists: false, port: 24454, voiceHost: '' });
  let v = await hosting.writeVoiceConfig(inst, dir, { voiceHost: '203.0.113.9:24454' });
  assert.equal(v.exists, true); assert.equal(v.voiceHost, '203.0.113.9:24454'); assert.equal(v.port, 24454);
  const file = hosting.voiceConfigPath(inst, dir);
  fs.writeFileSync(file, '# comment\nport=24500\nmax_voice_distance=48.0\nvoice_host=old:1\n');
  v = await hosting.writeVoiceConfig(inst, dir, { voiceHost: '' });
  const txt = fs.readFileSync(file, 'utf8');
  assert.match(txt, /# comment/); assert.match(txt, /max_voice_distance=48.0/); assert.match(txt, /^voice_host=$/m); assert.match(txt, /^port=24500$/m);
  assert.equal(v.port, 24500);
  assert.equal(hosting.setProperties('a=1\n', { b: '2' }), 'a=1\nb=2\n');
});

// ---------- UPnP ----------
function fakeIgd({ fault } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      if (req.url === '/desc.xml') {
        res.end(`<?xml version="1.0"?><root><device><deviceList><device><serviceList><service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/IPConn</controlURL></service></serviceList></device></deviceList></device></root>`);
        return;
      }
      calls.push({ action: req.headers.soapaction, body });
      if (/GetExternalIPAddress/.test(req.headers.soapaction)) { res.end('<s:Envelope><s:Body><u:GetExternalIPAddressResponse><NewExternalIPAddress>203.0.113.9</NewExternalIPAddress></u:GetExternalIPAddressResponse></s:Body></s:Envelope>'); return; }
      if (fault && /AddPortMapping/.test(req.headers.soapaction)) { res.statusCode = 500; res.end(`<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>${fault}</errorCode><errorDescription>ConflictInMappingEntry</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`); return; }
      res.end('<s:Envelope><s:Body><u:AddPortMappingResponse/></s:Body></s:Envelope>');
    });
  });
  return { server, calls };
}

test('upnp: SSDP parsing, description, port mapping and router errors', async () => {
  const h = upnp.parseSsdpResponse('HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=120\r\nLOCATION: http://192.168.1.1:5000/desc.xml\r\nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n');
  assert.equal(h.location, 'http://192.168.1.1:5000/desc.xml');
  assert.equal(upnp.parseSsdpResponse('garbage'), null);
  assert.equal(upnp.parseDescription('<root><service><serviceType>urn:x:service:Layer3Forwarding:1</serviceType><controlURL>/a</controlURL></service></root>', 'http://r/'), null);
  assert.match(upnp.soapEnvelope('urn:x', 'AddPortMapping', { NewPortMappingDescription: 'a<b' }), /a&lt;b/);
  const { server, calls } = fakeIgd();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const loc = `http://127.0.0.1:${server.address().port}/desc.xml`;
    const gw = await upnp.findGateway({ locations: [`http://127.0.0.1:1/nothing.xml`, loc] });
    assert.ok(gw, 'skips dead routers and finds the WAN service');
    assert.equal(gw.controlUrl, `http://127.0.0.1:${server.address().port}/ctl/IPConn`);
    assert.equal(await gw.externalIp(), '203.0.113.9');
    await gw.addPortMapping({ externalPort: 24454, protocol: 'udp', internalClient: '192.168.1.42', description: 'Saturn Client Voice chat' });
    const add = calls.find((c) => /AddPortMapping/.test(c.action));
    assert.match(add.body, /<NewProtocol>UDP<\/NewProtocol>/); assert.match(add.body, /<NewInternalClient>192.168.1.42<\/NewInternalClient>/); assert.match(add.body, /<NewExternalPort>24454</);
  } finally { server.close(); }
  const bad = fakeIgd({ fault: 718 });
  await new Promise((r) => bad.server.listen(0, '127.0.0.1', r));
  try {
    const gw = await upnp.findGateway({ locations: [`http://127.0.0.1:${bad.server.address().port}/desc.xml`] });
    await assert.rejects(gw.addPortMapping({ externalPort: 25565, internalClient: '192.168.1.42' }), (e) => /already mapped to another device/.test(e.message) && e.code === 718);
  } finally { bad.server.close(); }
});

// ---------- Tailscale ----------
test('tailscale: status parsing and detection without a binary', async () => {
  const s = tailscale.parseStatus({ BackendState: 'Running', Self: { HostName: 'izaks-mac', DNSName: 'izaks-mac.tail3c9e1.ts.net.', TailscaleIPs: ['100.101.42.7', 'fd7a:115c:a1e0::1'] }, CurrentTailnet: { Name: 'izak@example.com', MagicDNSEnabled: true }, Peer: { a: { Online: true }, b: { Online: false } } });
  assert.equal(s.running, true); assert.equal(s.ip4, '100.101.42.7'); assert.equal(s.dnsName, 'izaks-mac.tail3c9e1.ts.net'); assert.equal(s.peersOnline, 1); assert.equal(s.peers, 2);
  const off = tailscale.parseStatus('{"BackendState":"NeedsLogin","AuthURL":"https://login.tailscale.com/a/x","Self":{}}');
  assert.equal(off.running, false); assert.equal(off.needsLogin, true); assert.equal(off.authUrl, 'https://login.tailscale.com/a/x'); assert.equal(off.dnsName, null);
  const none = await tailscale.status({ platform: 'linux', exists: () => false, exec: async () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; } });
  assert.equal(none.installed, false); assert.equal(none.state, 'NotInstalled'); assert.match(none.install.command, /install\.sh/);
  const mac = await tailscale.status({ platform: 'darwin', exists: (p) => p.startsWith('/Applications'), exec: async () => JSON.stringify({ BackendState: 'Running', Self: { TailscaleIPs: ['100.64.0.5'] } }) });
  assert.equal(mac.running, true); assert.equal(mac.ip4, '100.64.0.5'); assert.match(mac.bin, /Tailscale.app/);
  assert.ok(tailscale.candidates('linux').includes('/usr/bin/tailscale'));
});

// ---------- Linux: keys, Java, mic ----------
test('secrets: keychain/keyring/private-file modes; file fallback round trips at 0600', async () => {
  const fakeSafe = (backend, available = true) => ({
    isEncryptionAvailable: () => available, getSelectedStorageBackend: () => backend,
    encryptString: (s) => Buffer.from(`enc:${s}`), decryptString: (b) => b.toString().replace(/^enc:/, ''),
  });
  assert.equal(platformCipher(fakeSafe(null), 'darwin').mode, 'keychain');
  assert.equal(platformCipher(fakeSafe('gnome_libsecret'), 'linux').mode, 'keyring');
  assert.match(platformCipher(fakeSafe('kwallet5'), 'linux').label, /kwallet5/);
  const weak = platformCipher(fakeSafe('basic_text'), 'linux');
  assert.equal(weak.mode, 'file'); assert.equal(weak.cipher.isEncryptionAvailable(), false);
  assert.equal(platformCipher(fakeSafe('gnome_libsecret', false), 'linux').mode, 'file');
  const dir = tmp('sat-sec-');
  const file = path.join(dir, 'secrets.bin');
  const store = new SecretStore(file, weak.cipher);
  await store.set('duckdnsToken', 'tok-123');
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.startsWith(PLAIN_MAGIC));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(await new SecretStore(file, platformCipher(fakeSafe('gnome_libsecret'), 'linux').cipher).get('duckdnsToken'), 'tok-123', 'a later keyring can still read the file');
  const ring = new SecretStore(path.join(dir, 'ring.bin'), platformCipher(fakeSafe('gnome_libsecret'), 'linux').cipher);
  await ring.set('xaiApiKey', 'k'); assert.ok(fs.readFileSync(path.join(dir, 'ring.bin'), 'utf8').startsWith('enc:'));
  const strict = new SecretStore(path.join(dir, 'strict.bin'), { isEncryptionAvailable: () => false, encryptString: () => null, decryptString: () => '' });
  await assert.rejects(strict.set('a', 'b'), /not available/);
});

test('java: finds system JDKs per OS; mic on Linux needs no prompt', async () => {
  const root = tmp('sat-jvm-');
  fs.mkdirSync(path.join(root, 'java-25-openjdk-amd64', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'java-21-openjdk-amd64', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'current'), { recursive: true });
  const dirs = await java.systemJavaDirs({ name: 'linux' }, { roots: [root, path.join(root, 'missing')] });
  assert.deepEqual(dirs.map((d) => path.basename(d)), ['java-25-openjdk-amd64', 'java-21-openjdk-amd64']);
  fs.writeFileSync(path.join(root, 'java-25-openjdk-amd64', 'bin', 'java'), '');
  assert.equal(await java.javaBinIn(dirs[0], { name: 'linux' }), path.join(root, 'java-25-openjdk-amd64', 'bin', 'java'));
  assert.equal(java.adoptiumOs({ name: 'linux' }), 'linux'); assert.equal(java.adoptiumArch({ arch: 'x86_64' }), 'x64');
  const m = mic.describe('not-determined', 'linux');
  assert.equal(m.status, 'granted'); assert.equal(m.canPrompt, false); assert.equal(m.soundSettings, true); assert.match(m.hint, /PipeWire|PulseAudio/);
  assert.equal(mic.shouldPromptOnLaunch({}, 'not-determined', 'linux'), false);
  assert.equal(mic.describe('not-determined', 'darwin').canPrompt, true);
});

test('settings: glass strength defaults, migration from glassIntensity, host provider', () => {
  const d = settingsStore.DEFAULTS;
  assert.equal(d.glassStrength, process.platform === 'linux' ? 0.45 : 0.75);
  assert.equal(d.reduceTransparency, false); assert.equal(d.hostProvider, 'p2p'); assert.equal(d.hostDdnsName, '');
  assert.equal(settingsStore.upgrade({ glassIntensity: 0.3 }).glassStrength, 0.3);
  assert.equal(settingsStore.upgrade({ glassIntensity: 0.3, glassStrength: 0 }).glassStrength, 0, 'explicit 0 (solid) wins');
  assert.equal(settingsStore.upgrade({ glassStrength: 4 }).glassStrength, 1);
  assert.equal('glassIntensity' in settingsStore.upgrade({ glassIntensity: 0.3 }), false);
});

test('glass vars: 0 is solid with no blur, max is clear, reduce transparency wins', async () => {
  const { glassVars, glassLabel, isSolid } = await import('../renderer/src/lib/glass.mjs');
  const solid = glassVars(0);
  assert.equal(solid['--glass-blur'], '0px'); assert.match(solid['--glass-bg'], /, 1\)$/); assert.equal(solid['--scrim-blur'], '0px');
  const max = glassVars(1);
  assert.equal(max['--glass-blur'], '36px'); assert.match(max['--glass-bg'], /0\.2\)$/);
  const mid = glassVars(0.45);
  assert.ok(parseInt(mid['--glass-blur'], 10) > 6 && parseInt(mid['--glass-blur'], 10) < 36);
  assert.deepEqual(glassVars(1, { reduceTransparency: true }), solid);
  assert.match(glassVars(0, { theme: 'light' })['--glass-bg'], /^rgba\(246, 248, 255, 1\)$/);
  assert.equal(glassLabel(0), 'Solid'); assert.equal(glassLabel(0.45), 'Medium'); assert.equal(glassLabel(1), 'Max');
  assert.ok(isSolid(0.8, true) && isSolid(0, false) && !isSolid(0.3, false));
  for (const k of ['--glass-blur', '--glass-sat', '--glass-bg', '--glass-bg-strong', '--sheen-1', '--scrim-blur', '--sheet-bg']) assert.ok(k in mid, k);
  const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'src', 'styles.css'), 'utf8');
  assert.ok(!/backdrop-filter: blur\(\d/.test(css.split('0.1.4: glass strength')[0].replace(/\.glass-preview[^}]*}/g, '')), 'panel blur always comes from a variable');
});

// ---------- skin editor ----------
test('skin editor: layers, mirror map, paint, fill and undo/redo', async () => {
  const ed = await import('../renderer/src/lib/skinEditor.mjs');
  const count = (m) => m.reduce((a, b) => a + b, 0);
  assert.equal(count(ed.layerMask('classic', 'base')), 1632);
  assert.equal(count(ed.layerMask('slim', 'base')), 1568, 'slim arms are one pixel narrower');
  assert.equal(count(ed.layerMask('classic', 'over')), 1632);
  assert.deepEqual(ed.pixelInfo(9, 8), { part: 'head', layer: 'base', face: 'front', fx: 1, fy: 0, fw: 8, fh: 8, x0: 8, y0: 8 });
  assert.equal(ed.pixelInfo(0, 0), null, 'unused corner');
  assert.deepEqual(ed.mirrorPixel(9, 8), [14, 8], 'head front mirrors onto itself');
  assert.deepEqual(ed.mirrorPixel(44, 20), [39, 52], 'right arm front -> left arm front');
  assert.deepEqual(ed.mirrorPixel(40, 20), [43, 52], 'outer side of right arm -> outer side of left arm');
  assert.deepEqual(ed.mirrorPixel(4, 20), [23, 52], 'right leg front -> left leg front');
  assert.deepEqual(ed.mirrorPixel(44, 36), [55, 52], 'right sleeve -> left sleeve');
  assert.deepEqual(ed.mirrorPixel(44, 20, 'slim'), [38, 52], 'slim arm mirror uses 3-wide faces');
  for (const [x, y] of [[9, 8], [44, 20], [40, 20], [20, 52], [33, 9]]) { const m = ed.mirrorPixel(x, y); assert.deepEqual(ed.mirrorPixel(m[0], m[1]), [x, y], 'mirror is its own inverse'); }
  const img = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
  const red = ed.hexToRgba('#ff0000');
  assert.equal(ed.paint(img, 44, 20, red, { layer: 'base', mirror: true }), 2);
  assert.deepEqual(ed.getRGBA(img, 39, 52), [255, 0, 0, 255]);
  assert.equal(ed.paint(img, 40, 0, red, { layer: 'base' }), 0, 'hat area is on the outer layer');
  assert.equal(ed.paint(img, 44, 20, red, { layer: 'base' }), 0, 'no-op when unchanged');
  const hist = new ed.History();
  hist.push(img);
  const next = ed.cloneImage(img);
  const filled = ed.floodFill(next, 9, 9, ed.hexToRgba('#00ff00'), { layer: 'base' });
  assert.equal(filled, 64, 'fill stays inside the head front face');
  assert.deepEqual(ed.getRGBA(next, 8, 8), [0, 255, 0, 255]); assert.deepEqual(ed.getRGBA(next, 16, 8), [0, 0, 0, 0]);
  const back = hist.undo(next);
  assert.deepEqual(ed.getRGBA(back, 8, 8), [0, 0, 0, 0]); assert.ok(hist.canRedo);
  const fwd = hist.redo(back);
  assert.deepEqual(ed.getRGBA(fwd, 8, 8), [0, 255, 0, 255]);
  assert.deepEqual(ed.line(0, 0, 3, 1), [[0, 0], [1, 0], [2, 1], [3, 1]]);
  assert.equal(ed.rgbaToHex([122, 168, 255, 255]), '#7aa8ff');
});

test('player skins: query parsing, textures, lookup by name and UUID', async () => {
  assert.deepEqual(lookup.parseQuery('Notch'), { kind: 'name', value: 'Notch' });
  assert.deepEqual(lookup.parseQuery('069a79f4-44e9-4726-a5be-fca90e38aaf5'), { kind: 'uuid', value: '069a79f444e94726a5befca90e38aaf5' });
  assert.throws(() => lookup.parseQuery('bad name!'), /username/);
  const tex = (o) => ({ properties: [{ name: 'textures', value: Buffer.from(JSON.stringify({ textures: o })).toString('base64') }] });
  assert.deepEqual(lookup.parseTextures(tex({ SKIN: { url: 'http://textures.minecraft.net/texture/abc', metadata: { model: 'slim' } } })), { skinUrl: 'https://textures.minecraft.net/texture/abc', capeUrl: null, model: 'slim' });
  const skinPng = png(64, 64);
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o });
    if (url.includes('/lookup/name/Ghost')) return json({}, 404);
    if (url.includes('/lookup/name/')) return json({ id: '069a79f444e94726a5befca90e38aaf5', name: 'Notch' });
    if (url.includes('sessionserver')) return json({ id: '069a79f444e94726a5befca90e38aaf5', name: 'Notch', ...tex({ SKIN: { url: 'http://textures.minecraft.net/texture/abc' } }) });
    if (url.includes('textures.minecraft.net')) return { ok: true, status: 200, arrayBuffer: async () => skinPng };
    return json({}, 500);
  };
  const r = await lookup.lookupSkin('Notch', { fetch: fake });
  assert.equal(r.name, 'Notch'); assert.equal(r.uuid, '069a79f4-44e9-4726-a5be-fca90e38aaf5'); assert.equal(r.model, 'classic'); assert.match(r.skin, /^data:image\/png;base64,/);
  assert.ok(urls[2].startsWith('https://textures.minecraft.net'), 'skin is fetched over https');
  const byId = await lookup.lookupSkin('069a79f444e94726a5befca90e38aaf5', { fetch: fake });
  assert.equal(byId.name, 'Notch');
  await assert.rejects(lookup.lookupSkin('Ghost', { fetch: fake }), /No Minecraft player is called Ghost/);
  const noSkin = async (url) => (url.includes('sessionserver') ? { ok: true, status: 200, json: async () => ({ id: 'a'.repeat(32), name: 'Plain', properties: [] }) } : fake(url));
  await assert.rejects(lookup.lookupSkin('Plain', { fetch: noSkin }), /default skin/);
});

test('skin library: editor saves replace the PNG in place', async () => {
  const lib = new SkinLibrary(tmp('sat-skins-'));
  const e = await lib.add({ png: png(64, 64), name: 'Mine' });
  const red = Buffer.alloc(64 * 64 * 4); for (let i = 0; i < red.length; i += 4) { red[i] = 255; red[i + 3] = 255; }
  const upd = await lib.update(e.id, { png: png(64, 64, red), variant: 'slim', name: 'Mine v2' });
  assert.equal(upd.variant, 'slim'); assert.equal(upd.name, 'Mine v2'); assert.ok(upd.editedAt);
  assert.ok((await lib.get(e.id)).png.equals(png(64, 64, red)));
  await assert.rejects(lib.update(e.id, { png: png(10, 10) }), /64/);
});

// ---------- Fabric dedicated server + service ----------
test('fabric server: instance type, mods folder, loader candidates and jar url', async () => {
  const dirs = { instances: tmp('sat-inst-') };
  const meta = await instances.create(dirs, { name: 'SMP', loader: 'fabric-server', mcVersion: '26.3' });
  assert.equal(meta.type, 'server');
  assert.ok(fs.existsSync(path.join(dirs.instances, meta.id, 'mods')));
  const install = require('../core/mods/install');
  const fakeApi = { getVersions: async (pid, { loaders: l }) => { assert.deepEqual(l, ['fabric']); return [{ id: 'v1', project_id: pid, version_type: 'release', date_published: '2026-11-01', files: [{ primary: true, url: 'https://cdn.modrinth.com/x.jar', filename: 'voicechat-fabric.jar', hashes: { sha1: 'x' } }], dependencies: [] }]; } };
  const plan = await install.planModrinth({ ...meta, mods: [] }, '9eGKb6K1', { api: fakeApi });
  assert.equal(plan.plan.length, 1);
  assert.equal(loaders.LOADERS['fabric-server'].kind, 'server');
  assert.equal(loaders.fabricServerJarUrl('26.3', '0.20.1', '1.1.0'), 'https://meta.fabricmc.net/v2/versions/loader/26.3/0.20.1/1.1.0/server/jar');
});

test('service: host status, voice setup per provider, P2P wiring and storage info', async () => {
  const dir = tmp('sat-svc-');
  const svc = await new LauncherService({ dataDir: dir, cipher: plainCipher, resourcesDir: dir, secretStorage: { mode: 'file', label: 'Private file (no keyring found)' } }).init();
  assert.equal((await svc.storageInfo()).mode, 'file');
  const meta = await instances.create(svc.dirs, { name: 'World', loader: 'fabric', mcVersion: '26.3' });
  meta.mods.push({ source: 'modrinth', projectId: '9eGKb6K1', title: 'Simple Voice Chat', file: 'voicechat-fabric-2.6.27+26.3.jar', enabled: true });
  await instances.save(svc.dirs, meta);
  let st = await svc.hostStatus(meta.id);
  assert.equal(st.provider, 'p2p'); assert.equal(st.providers.length, 4); assert.equal(st.voiceChatInstalled, true); assert.equal(st.voice.configured, false); assert.equal(st.p2pAvailable, false);
  svc.watchHostLine(meta.id, '[Server thread/INFO]: Started serving on 40404');
  assert.equal(await svc.hostGamePort(meta.id), 40404);
  assert.equal((await svc.hostStatus(meta.id)).lanPort, 40404);
  await svc.setDdnsName('MyWorld.duckdns.org');
  const r = await svc.enableVoiceChat(meta.id, 'direct');
  assert.equal(r.installed, false); assert.equal(r.voice.voiceHost, 'myworld.duckdns.org:24454'); assert.match(r.note, /Forward UDP/);
  const p = await svc.enableVoiceChat(meta.id, 'p2p');
  assert.equal(p.voice.voiceHost, ''); assert.match(p.note, /localhost/);
  st = await svc.hostStatus(meta.id);
  assert.equal(st.voice.configured, true); assert.equal(st.ddnsName, 'myworld.duckdns.org');
  await assert.rejects(svc.updateDdns(), /DuckDNS token/);
  await assert.rejects(svc.p2pCreateInvite(meta.id), /not available/);
  assert.deepEqual(svc.p2pList(), []);
  svc.attachP2P({ list: () => ['x'] });
  assert.deepEqual(svc.p2pList(), ['x']);
  assert.ok((await svc.secretStatus()).duckdnsToken === false);
  svc.watchHostLine(meta.id, 'Stopping server');
  assert.equal(await svc.hostGamePort(meta.id), 25565);
});

test('linux packaging: AppImage/deb/tar.gz targets keep the CurseForge key as an extra resource', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(pkg.version, /^0\.1\.([4-9]|\d{2,})$/);
  const targets = pkg.build.linux.target.map((t) => (typeof t === 'string' ? t : t.target));
  for (const t of ['AppImage', 'deb', 'tar.gz']) assert.ok(targets.includes(t), t);
  assert.ok(pkg.build.extraResources.some((r) => r.from === 'core/builtin-private.js'));
  assert.ok(pkg.build.files.includes('electron/**'), 'P2P worker ships with the app');
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(gi, /core\/builtin-private\.js/); assert.match(gi, /secrets\//);
});
