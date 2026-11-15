'use strict';
// Minimal UPnP IGD client (no dependencies): finds the router with SSDP, then
// asks its WANIPConnection / WANPPPConnection service to open ports.
const dgram = require('dgram');
const http = require('http');
const https = require('https');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1',
  'urn:schemas-upnp-org:service:WANPPPConnection:1',
];

/** Parses an SSDP HTTP-over-UDP response into lower-cased headers. */
function parseSsdpResponse(text) {
  const lines = String(text || '').split(/\r?\n/);
  if (!/^HTTP\/1\.[01] 200/i.test(lines[0] || '') && !/^NOTIFY/i.test(lines[0] || '')) return null;
  const headers = {};
  for (const l of lines.slice(1)) {
    const i = l.indexOf(':');
    if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  return headers.location ? headers : null;
}

/** Sends M-SEARCH and resolves with unique LOCATION urls seen before the timeout. */
function ssdpSearch({ timeout = 2500 } = {}) {
  return new Promise((resolve) => {
    const found = new Set();
    let sock;
    try { sock = dgram.createSocket({ type: 'udp4', reuseAddr: true }); } catch { resolve([]); return; }
    const finish = () => { try { sock.close(); } catch { /* closed */ } resolve([...found]); };
    sock.on('error', finish);
    sock.on('message', (msg) => { const h = parseSsdpResponse(msg.toString()); if (h) found.add(h.location); });
    sock.bind(0, () => {
      for (const st of SEARCH_TARGETS) {
        const m = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDR}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`);
        sock.send(m, SSDP_PORT, SSDP_ADDR, () => {});
      }
      setTimeout(finish, timeout);
    });
  });
}

function request(url, { method = 'GET', headers = {}, body = null, timeout = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers, timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('Router did not answer in time')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const tag = (xml, name) => { const m = new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i').exec(xml); return m ? m[1].trim() : null; };

/** Finds the WAN connection service in a device description. */
function parseDescription(xml, location) {
  const base = tag(xml, 'URLBase') || location;
  const services = String(xml).match(/<service>[\s\S]*?<\/service>/gi) || [];
  for (const s of services) {
    const type = tag(s, 'serviceType') || '';
    if (/WAN(IP|PPP)Connection/i.test(type)) {
      const ctrl = tag(s, 'controlURL');
      if (ctrl) return { serviceType: type, controlUrl: new URL(ctrl, base).href };
    }
  }
  return null;
}

function soapEnvelope(serviceType, action, args = {}) {
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = Object.entries(args).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('');
  return `<?xml version="1.0"?>\r\n<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${serviceType}">${body}</u:${action}></s:Body></s:Envelope>`;
}

/** Router error code/description from a SOAP fault, or null. */
function parseSoapFault(xml) {
  if (!/Fault/i.test(xml || '')) return null;
  const code = tag(xml, 'errorCode');
  const desc = tag(xml, 'errorDescription') || tag(xml, 'faultstring');
  return { code: code ? Number(code) : null, message: desc || 'Router refused the request' };
}

class Gateway {
  constructor({ serviceType, controlUrl, location }) { this.serviceType = serviceType; this.controlUrl = controlUrl; this.location = location; }

  async call(action, args) {
    const r = await request(this.controlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${this.serviceType}#${action}"` },
      body: soapEnvelope(this.serviceType, action, args),
    });
    const fault = parseSoapFault(r.body);
    if (r.status >= 400 || fault) {
      const e = new Error(friendlyFault(fault, r.status));
      e.code = fault && fault.code;
      throw e;
    }
    return r.body;
  }

  async externalIp() { return tag(await this.call('GetExternalIPAddress', {}), 'NewExternalIPAddress'); }

  addPortMapping({ externalPort, internalPort = externalPort, protocol = 'TCP', internalClient, description = 'Saturn Client', leaseDuration = 0 }) {
    return this.call('AddPortMapping', {
      NewRemoteHost: '', NewExternalPort: externalPort, NewProtocol: protocol.toUpperCase(),
      NewInternalPort: internalPort, NewInternalClient: internalClient, NewEnabled: 1,
      NewPortMappingDescription: description, NewLeaseDuration: leaseDuration,
    });
  }

  deletePortMapping({ externalPort, protocol = 'TCP' }) {
    return this.call('DeletePortMapping', { NewRemoteHost: '', NewExternalPort: externalPort, NewProtocol: protocol.toUpperCase() });
  }
}

function friendlyFault(fault, status) {
  if (!fault) return `Router answered HTTP ${status}`;
  const known = {
    402: 'Router rejected the request (invalid arguments).',
    606: 'Router requires authorization for UPnP changes.',
    718: 'That port is already mapped to another device on your network.',
    724: 'Router only allows the same internal and external port.',
    725: 'Router only supports permanent mappings.',
  };
  return known[fault.code] || `${fault.message}${fault.code ? ` (${fault.code})` : ''}`;
}

/** Discovers the first router with a WAN connection service. */
async function findGateway({ timeout, locations } = {}) {
  const locs = locations || (await ssdpSearch({ timeout }));
  for (const location of locs) {
    try {
      const r = await request(location);
      const svc = parseDescription(r.body, location);
      if (svc) return new Gateway({ ...svc, location });
    } catch { /* try the next one */ }
  }
  return null;
}

/** The local IPv4 address the OS would use to talk to `host`. */
function localAddressFor(host) {
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    s.on('error', () => { try { s.close(); } catch { /* */ } resolve(null); });
    s.connect(1900, host, () => { let a = null; try { a = s.address().address; } catch { /* */ } s.close(); resolve(a); });
  });
}

module.exports = { parseSsdpResponse, parseDescription, parseSoapFault, soapEnvelope, ssdpSearch, findGateway, localAddressFor, Gateway, friendlyFault };
