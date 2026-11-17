'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const msa = require('../core/auth/msa');
const { SignInManager, friendly } = require('../core/auth/session');
const { AuthLog, redact } = require('../core/auth/log');
const { listenForRedirect } = require('../core/auth/loopback');

const root = path.join(__dirname, '..');
const r = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'saturn-auth-'));
const tick = (ms = 20) => new Promise((x) => setTimeout(x, ms));
const CLIENT = '8e130755-4b0b-4252-bc49-40cfa995f0d3';

function harness({ msaOver = {}, uiOver = {} } = {}) {
  const events = [];
  const saved = [];
  const dir = tmp();
  const log = new AuthLog(dir);
  const calls = { window: 0, external: [], exchange: [] };
  let resolveWindow;
  const fakeMsa = {
    ...msa,
    exchangeCode: async (c, o) => { calls.exchange.push(o); return { access_token: 'AT', refresh_token: 'RT' }; },
    completeLogin: async () => ({ name: 'Izak', uuid: 'u', accessToken: 'mc', refreshToken: 'RT', expiresAt: 1 }),
    startDeviceCode: async () => ({ user_code: 'ABCD1234', device_code: 'DEV', verification_uri: 'https://www.microsoft.com/link', expires_in: 900, interval: 5 }),
    pollToken: async () => ({ access_token: 'AT', refresh_token: 'RT' }),
    ...msaOver,
  };
  const ui = {
    openWindow: ({ url, redirectUri }) => { calls.window++; calls.url = url; calls.redirectUri = redirectUri; const result = new Promise((x) => { resolveWindow = x; }); return { result, focus: () => { calls.focused = (calls.focused || 0) + 1; }, close: () => resolveWindow(null) }; },
    openExternal: async (u) => { calls.external.push(u); },
    ...uiOver,
  };
  const mgr = new SignInManager({ msa: fakeMsa, ui, clientId: async () => CLIENT, save: async (a) => saved.push(a), emit: (ch, d) => events.push(d), log });
  return { mgr, events, saved, calls, log, dir, redirect: (url) => resolveWindow(url) };
}

test('PKCE + authorize URL: loopback redirect, S256, state, consumer account picker', () => {
  const pk = msa.makePkce();
  assert.ok(pk.verifier.length >= 43 && /^[A-Za-z0-9_-]+$/.test(pk.verifier));
  assert.match(pk.challenge, /^[A-Za-z0-9_-]{43}$/);
  const url = new URL(msa.buildAuthorizeUrl({ clientId: CLIENT, redirectUri: 'http://localhost', challenge: pk.challenge, state: pk.state }));
  assert.equal(url.origin + url.pathname, 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
  assert.equal(url.searchParams.get('client_id'), CLIENT);
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'XboxLive.signin offline_access');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  const crypto = require('crypto');
  assert.equal(crypto.createHash('sha256').update(pk.verifier).digest('base64url'), pk.challenge);
});

test('redirect parsing: code, errors, and a state check', () => {
  assert.deepEqual(msa.parseRedirect('http://localhost/?code=abc&state=s1', 's1'), { code: 'abc' });
  assert.equal(msa.parseRedirect('http://localhost/?code=abc&state=other', 's1').error, 'state_mismatch');
  assert.equal(msa.parseRedirect('http://localhost/?error=access_denied&error_description=The+user+said+no', 's1').description, 'The user said no');
  assert.equal(msa.parseRedirect('http://localhost/', 's1').error, 'no_code');
  assert.equal(msa.parseRedirect('not a url', 's1').error, 'bad_redirect');
});

test('primary flow: window opens once, redirect is caught, code exchanged with the same redirect URI, account saved', async () => {
  const h = harness();
  const v = await h.mgr.start();
  assert.equal(v.method, 'window');
  assert.equal(h.calls.window, 1);
  assert.equal(h.calls.redirectUri, 'http://localhost');
  const state = new URL(h.calls.url).searchParams.get('state');
  h.redirect(`http://localhost/?code=THECODE&state=${state}`);
  await tick();
  assert.equal(h.calls.exchange.length, 1);
  assert.equal(h.calls.exchange[0].code, 'THECODE');
  assert.equal(h.calls.exchange[0].redirectUri, 'http://localhost');
  assert.ok(h.calls.exchange[0].verifier);
  assert.equal(h.saved[0].name, 'Izak');
  assert.deepEqual(h.events.map((e) => e.state), ['progress', 'progress', 'done']);
  assert.equal(h.mgr.status().active, false);
});

test('duplicate clicks and re-renders never open a second window or request; the first is re-shown', async () => {
  const h = harness();
  const [a, b, c] = await Promise.all([h.mgr.start(), h.mgr.start(), h.mgr.start()]);
  assert.equal(h.calls.window, 1);
  assert.equal(a.id, b.id);
  assert.equal(b.id, c.id);
  const again = await h.mgr.start();
  assert.equal(again.id, a.id);
  assert.equal(h.calls.window, 1);
  assert.ok(h.calls.focused >= 1, 'existing window brought to the front');
  h.mgr.cancel();
});

test('closing the window is a quiet cancel, never an error toast', async () => {
  const h = harness();
  await h.mgr.start();
  h.redirect(null);
  await tick();
  assert.deepEqual(h.events.map((e) => e.state), ['cancelled']);
  assert.equal(h.mgr.status().active, false);
  // And cancelling from the app (sheet closed) emits nothing and closes the window.
  const h2 = harness();
  await h2.mgr.start();
  h2.mgr.cancel();
  await tick();
  assert.deepEqual(h2.events, []);
});

test('Microsoft errors become readable messages, are logged, and never leak tokens', async () => {
  const h = harness();
  await h.mgr.start();
  h.redirect('http://localhost/?error=access_denied&state=x');
  await tick();
  assert.equal(h.events[0].state, 'error');
  assert.match(h.events[0].error, /declined/i);
  const log = fs.readFileSync(path.join(h.dir, 'auth.log'), 'utf8');
  assert.match(log, /sign-in: failed/);
  assert.ok(!/ABCD1234|THECODE/.test(log), 'no codes in the log');

  const h2 = harness({ msaOver: { exchangeCode: async () => { throw new Error('fetch failed'); } } });
  await h2.mgr.start();
  const st = new URL(h2.calls.url).searchParams.get('state');
  h2.redirect(`http://localhost/?code=c&state=${st}`);
  await tick();
  const err = h2.events.find((e) => e.state === 'error');
  assert.match(err.error, /couldn.t reach Microsoft/i);
  assert.match(friendly({ code: 'APP_NOT_APPROVED', message: 'x' }), /Mojang approval/);
  assert.match(friendly(new Error('invalid_request: redirect_uri is not valid')), /sign-in address/i);
});

test('state mismatch (a stray redirect) fails instead of signing in', async () => {
  const h = harness();
  await h.mgr.start();
  h.redirect('http://localhost/?code=evil&state=WRONG');
  await tick();
  assert.equal(h.calls.exchange.length, 0);
  assert.equal(h.events.find((e) => e.state === 'error').code, 'STATE_MISMATCH');
});

test('browser fallback: real loopback server catches the redirect on an ephemeral port', async () => {
  const lb = await listenForRedirect({ timeoutMs: 5000 });
  assert.match(lb.redirectUri, /^http:\/\/localhost:\d+$/);
  const noise = await new Promise((res) => http.get(`http://127.0.0.1:${lb.port}/favicon.ico`, (rs) => { rs.resume(); res(rs.statusCode); }));
  assert.equal(noise, 404, 'ignores requests without a code');
  const page = await new Promise((res) => http.get(`http://127.0.0.1:${lb.port}/?code=abc&state=s`, (rs) => { let b = ''; rs.on('data', (d) => (b += d)); rs.on('end', () => res({ status: rs.statusCode, b })); }));
  assert.equal(page.status, 200);
  assert.match(page.b, /signed in/i);
  assert.equal(await lb.result, `http://localhost:${lb.port}/?code=abc&state=s`);
  await tick(400);
  await assert.rejects(new Promise((res, rej) => http.get(`http://127.0.0.1:${lb.port}/`, res).on('error', rej)), 'server shuts itself down');
  const lb2 = await listenForRedirect({ timeoutMs: 50 });
  assert.equal(await lb2.result, null, 'times out cleanly');
});

test('browser method uses the loopback URI and opens the system browser; code method is the small fallback', async () => {
  const h = harness();
  const v = await h.mgr.start({ method: 'browser' });
  assert.equal(v.method, 'browser');
  assert.equal(h.calls.external.length, 1);
  const u = new URL(h.calls.external[0]);
  assert.match(u.searchParams.get('redirect_uri'), /^http:\/\/localhost:\d+$/);
  h.mgr.cancel();
  const v2 = await h.mgr.start({ method: 'code' });
  assert.equal(v2.method, 'code');
  assert.equal(v2.userCode, 'ABCD1234');
  assert.equal(v2.device_code, undefined, 'device_code never leaves the main process');
  await tick();
  assert.deepEqual(h.events.map((e) => e.state), ['progress', 'done']);
});

test('browser that fails to open reports it instead of hanging', async () => {
  const h = harness({ uiOver: { openExternal: async () => { throw new Error('no handler'); } } });
  await assert.rejects(h.mgr.start({ method: 'browser' }), /Couldn.t open your browser/);
  assert.equal(h.mgr.status().active, false);
});

test('auth log: file in the logs dir, tokens and codes redacted', () => {
  const dir = tmp();
  const log = new AuthLog(dir);
  log.error('boom device_code=ABCDEFGHIJKL1234 access_token: eyJhbGciOi.eyJzdWIiOiIx.sig refresh_token=0.AAAAAAAAAA', new Error('XBL3.0 x=123;secrettoken'));
  const text = fs.readFileSync(path.join(dir, 'auth.log'), 'utf8');
  assert.match(text, /ERROR/);
  assert.ok(!/ABCDEFGHIJKL1234|secrettoken|eyJhbGciOi|0\.AAAAAAAAAA/.test(text), text);
  assert.equal(redact('Bearer abcdefghijkl'), 'Bearer [redacted]');
});

test('wiring: login window, logs dir, IPC, preload, renderer sheet with fallbacks and guards', () => {
  const main = r('electron/main.js');
  assert.match(main, /logsDir: app\.getPath\('logs'\)/);
  assert.match(main, /openMicrosoftLogin\(\{ parent: win/);
  assert.match(main, /api:openSignInPage/);
  assert.match(main, /api:revealAuthLog/);
  assert.match(main, /unhandledRejection/);
  const win = r('electron/ms-login.js');
  assert.match(win, /onBeforeRequest/);
  assert.match(win, /sandbox: true/);
  assert.match(win, /contextIsolation: true/);
  for (const m of ['cancelSignIn', 'focusSignIn', 'authLogInfo', 'openSignInPage', 'revealAuthLog']) assert.ok(r('electron/preload.js').includes(`'${m}'`), m);
  const ui = r('renderer/src/views/Settings.jsx');
  assert.match(ui, /started\.current/, 'start guarded against re-renders');
  assert.match(ui, /useCallback\(\(\) => setSignIn\(false\), \[\]\)/, 'stable onClose');
  assert.match(ui, /Use my browser instead/);
  assert.match(ui, /Use a code instead/);
  assert.match(ui, /Copy code/);
  assert.match(ui, /Open in browser/);
  assert.match(ui, /Show log/);
  assert.match(r('renderer/src/App.jsx'), /!document\.querySelector\('\.signin-sheet'\)/);
});

test('CSP unchanged for the app window (sign-in happens in its own sandboxed window)', () => {
  const html = r('renderer/index.html');
  assert.match(html, /default-src 'self'/);
  assert.ok(!/localhost/.test(html));
});
