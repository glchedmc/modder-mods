'use strict';
// One Microsoft sign-in at a time. Starting again while a code is still valid returns the SAME code
// (so double clicks or a re-rendering UI can never spawn a second request or cancel the first),
// cancelling is silent, and every failure is logged and reported with a readable message.
const defaultMsa = require('./msa');
const defaultLoopback = require('./loopback');

const FRIENDLY = [
  [/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|socket/i, 'Saturn couldn’t reach Microsoft. Check your internet connection (or VPN/firewall) and try again.'],
  [/expired/i, 'The sign-in code expired. Start again to get a new one.'],
  [/declined|access_denied/i, 'Sign-in was declined. Start again if that was a mistake.'],
  [/redirect_uri|not registered|AADSTS50011/i, 'Microsoft rejected this app’s sign-in address. Use “Use a code instead” below, and send the log so it can be fixed.'],
  [/AADSTS70000|consent|unauthorized_client|invalid_client/i, 'Microsoft didn’t accept this app’s sign-in settings. Use “Use a code instead” below, and send the log.'],
];

function friendly(e) {
  if (e && e.code === 'APP_NOT_APPROVED') return 'Microsoft sign-in is waiting on Mojang approval for this app.';
  if (e && e.code) {
    if (['NO_CLIENT_ID', 'NO_PROFILE'].includes(e.code)) return e.message;
  }
  const msg = (e && e.message) || String(e);
  for (const [re, text] of FRIENDLY) if (re.test(msg)) return text;
  return msg;
}

class SignInManager {
  /**
   * @param o.ui  {openWindow({url, redirectUri}) -> {result: Promise<string|null>, focus(), close()}, openExternal(url)} supplied by Electron's main process.
   *              openWindow resolves `result` with the redirect URL (code or error), or null when the user closes the window.
   */
  constructor({ msa = defaultMsa, loopback = defaultLoopback, ui = null, clientId, save, emit, log, now = Date.now, maxNetworkFailures = 6 }) {
    Object.assign(this, { msa, loopback, ui, clientId, save, emit, log, now, maxNetworkFailures });
    this.session = null;
    this.starting = null;
  }

  /** Public view of the active session (never the device_code, verifier or state). */
  view(s = this.session) {
    if (!s) return null;
    const v = { method: s.method, state: s.state, id: s.id };
    if (s.method === 'code') Object.assign(v, { userCode: s.userCode, verificationUri: s.verificationUri, expiresAt: s.expiresAt, expiresIn: Math.max(0, Math.round((s.expiresAt - this.now()) / 1000)) });
    return v;
  }

  status() { return this.session ? { active: true, ...this.view() } : { active: false }; }

  /** The browser page to open for an active device-code session, or null. */
  pageUrl() { return this.session && this.session.method === 'code' && this.session.state === 'waiting' ? this.session.verificationUri : null; }

  /** Brings the Microsoft window to the front (window method). */
  focus() { const s = this.session; if (s && s.focus) { s.focus(); return true; } return false; }

  /**
   * method: 'window' (default, an in-app Microsoft login window), 'browser' (default browser + localhost
   * redirect) or 'code' (device code, for when neither works). Calling again while the same method is
   * active just re-shows it, so double clicks and re-renders can't start a second sign-in.
   */
  async start({ method = 'window', fresh = false } = {}) {
    if (this.starting) return this.starting;
    const s = this.session;
    if (s && s.method === method && !fresh && s.state !== 'error' && (s.method !== 'code' || s.expiresAt - this.now() > 15000)) {
      this.log.info(`sign-in: ${method} sign-in already running, showing it again (duplicate start ignored)`);
      if (method === 'window') this.focus();
      return this.view();
    }
    this.starting = this.begin(method).finally(() => { this.starting = null; });
    return this.starting;
  }

  async begin(method) {
    const clientId = await this.clientId();
    if (!clientId) return { needsClientId: true };
    this.cancel('replaced');
    this.log.info(`sign-in: starting (${method}, client ${String(clientId).slice(0, 8)}…)`);
    if (method === 'code') return this.beginCode(clientId);
    return this.beginRedirect(clientId, method);
  }

  newSession(method, extra = {}) {
    const ctl = new AbortController();
    const session = { id: `${this.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ctl, method, state: 'waiting', ...extra };
    this.session = session;
    return session;
  }

  async beginRedirect(clientId, method) {
    const pk = this.msa.makePkce();
    let redirectUri = 'http://localhost';
    let handle;
    try {
      if (method === 'browser') {
        const lb = await this.loopback.listenForRedirect();
        redirectUri = lb.redirectUri;
        handle = { result: lb.result, close: lb.close, focus: null };
      }
      const url = this.msa.buildAuthorizeUrl({ clientId, redirectUri, challenge: pk.challenge, state: pk.state });
      if (method === 'window') {
        if (!this.ui || !this.ui.openWindow) throw Object.assign(new Error('The sign-in window isn’t available in this build.'), { code: 'NO_WINDOW' });
        handle = this.ui.openWindow({ url, redirectUri });
      } else {
        if (!this.ui || !this.ui.openExternal) throw Object.assign(new Error('Can’t open your browser from here.'), { code: 'NO_BROWSER' });
        await this.ui.openExternal(url);
        this.log.info('sign-in: opened the Microsoft page in the default browser');
      }
    } catch (e) {
      if (handle && handle.close) handle.close();
      this.log.error(`sign-in: could not start the ${method} sign-in`, e);
      const err = new Error(method === 'browser' ? `Couldn’t open your browser: ${e.message}` : friendly(e));
      err.code = e.code || 'START_FAILED';
      throw err;
    }
    const session = this.newSession(method, { redirectUri, close: handle.close, focus: handle.focus });
    session.ctl.signal.addEventListener('abort', () => { try { handle.close(); } catch { /* already closed */ } });
    this.log.info(`sign-in: ${method === 'window' ? 'Microsoft sign-in window opened' : `waiting for the browser redirect on ${redirectUri}`}`);
    this.runRedirect(session, clientId, pk, handle);
    return this.view(session);
  }

  runRedirect(session, clientId, pk, handle) {
    (async () => {
      try {
        const returned = await handle.result;
        if (session.ctl.signal.aborted) return;
        if (!returned) {
          // Window closed (or the browser never came back): not an error, just stop and tell the UI.
          this.log.info('sign-in: the sign-in window was closed or timed out before finishing');
          session.state = 'cancelled';
          this.emit('auth:update', { state: 'cancelled', method: session.method });
          if (this.session === session) this.session = null;
          return;
        }
        const r = this.msa.parseRedirect(returned, pk.state);
        if (r.error) {
          const e = new Error(r.error === 'access_denied' ? 'Sign-in was declined.' : `Microsoft sign-in failed: ${r.description || r.error}`);
          e.code = r.error.toUpperCase();
          throw e;
        }
        session.state = 'finishing';
        this.log.info('sign-in: Microsoft returned a code, exchanging it');
        this.emit('auth:update', { state: 'progress', step: 'Microsoft' });
        const token = await this.msa.exchangeCode(clientId, { code: r.code, verifier: pk.verifier, redirectUri: session.redirectUri });
        await this.finish(session, token);
      } catch (e) {
        this.fail(session, e);
      }
    })();
  }

  async finish(session, token) {
    if (session.ctl.signal.aborted) return;
    session.state = 'finishing';
    this.emit('auth:update', { state: 'progress', step: 'Xbox Live' });
    this.log.info('sign-in: signing in to Xbox Live and Minecraft');
    const account = await this.msa.completeLogin(token);
    if (session.ctl.signal.aborted) return;
    await this.save(account);
    session.state = 'done';
    this.log.info(`sign-in: done (profile ${account.name})`);
    this.emit('auth:update', { state: 'done', name: account.name });
    if (this.session === session) this.session = null;
    try { session.close && session.close(); } catch { /* closed */ }
  }

  fail(session, e) {
    if (session.ctl.signal.aborted || (e && e.code === 'CANCELLED')) { this.log.info('sign-in: cancelled'); return; }
    session.state = 'error';
    this.log.error('sign-in: failed', e);
    try { session.close && session.close(); } catch { /* closed */ }
    this.emit('auth:update', { state: 'error', error: friendly(e), code: (e && e.code) || 'FAILED', detail: e && e.message, method: session.method });
  }

  async beginCode(clientId) {
    let device;
    try {
      device = await this.msa.startDeviceCode(clientId);
    } catch (e) {
      this.log.error('sign-in: device code request failed', e);
      const err = new Error(friendly(e));
      err.code = e.code || 'DEVICE_CODE';
      throw err;
    }
    const session = this.newSession('code', { userCode: device.user_code, verificationUri: device.verification_uri || 'https://www.microsoft.com/link', expiresAt: this.now() + (device.expires_in || 900) * 1000 });
    this.log.info(`sign-in: code issued, valid ${device.expires_in}s, page ${session.verificationUri}`);
    (async () => {
      try {
        const token = await this.pollWithRetry(clientId, device, session);
        if (session.ctl.signal.aborted) return;
        this.log.info('sign-in: Microsoft approved the code');
        await this.finish(session, token);
      } catch (e) { this.fail(session, e); }
    })();
    return this.view(session);
  }

  /** pollToken, but a flaky connection doesn't end the sign-in: only repeated failures do. */
  async pollWithRetry(clientId, device, session) {
    let failures = 0;
    for (;;) {
      try {
        const left = Math.max(1, Math.round((session.expiresAt - this.now()) / 1000));
        return await this.msa.pollToken(clientId, { ...device, expires_in: left }, { signal: session.ctl.signal });
      } catch (e) {
        if (session.ctl.signal.aborted) { const c = new Error('Sign-in cancelled'); c.code = 'CANCELLED'; throw c; }
        const net = /fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|HTTP 5|HTTP 429/i.test(e.message) && !/Microsoft sign-in failed|expired/i.test(e.message);
        if (!net || ++failures > this.maxNetworkFailures) throw e;
        this.log.warn(`sign-in: network hiccup while waiting (${failures}/${this.maxNetworkFailures})`, e.message);
      }
    }
  }

  /** Stops waiting and closes the login window. Silent: no error event, so the UI never flashes "cancelled". */
  cancel(reason = 'user') {
    const s = this.session;
    if (!s) return false;
    s.ctl.abort();
    this.session = null;
    this.log.info(`sign-in: stopped (${reason})`);
    return true;
  }
}

module.exports = { SignInManager, friendly };
