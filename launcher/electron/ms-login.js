'use strict';
// The Microsoft sign-in window: a normal browser window on Microsoft's login page, like the official
// launcher. When Microsoft redirects to http://localhost (the app's registered loopback redirect) we
// catch that URL before any request leaves the machine, close the window, and hand the URL back.
const { BrowserWindow, shell } = require('electron');

const SAFE_HTTPS = /^https:\/\//i;
const isRedirect = (url, redirectUri) => {
  try {
    const u = new URL(url);
    const r = new URL(redirectUri);
    return u.protocol === 'http:' && u.hostname === r.hostname && (u.searchParams.has('code') || u.searchParams.has('error'));
  } catch { return false; }
};

/**
 * @param {{parent?: BrowserWindow, url: string, redirectUri: string, log?: object}} o
 * @returns {{result: Promise<string|null>, focus: () => void, close: () => void}}
 */
function openMicrosoftLogin({ parent, url, redirectUri, log }) {
  let settle;
  const result = new Promise((r) => { settle = r; });
  let finished = false;
  const partition = `saturn-msa-${Date.now().toString(36)}`; // in-memory: no cookies survive, nothing is remembered
  const win = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 420,
    minHeight: 560,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    title: 'Sign in to Microsoft',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  const wc = win.webContents;
  // Microsoft's pages are happiest with a plain browser identity.
  wc.setUserAgent(wc.getUserAgent().replace(/\s(Electron|saturn-client|Saturn Client)\/\S+/gi, ''));

  const done = (value, why) => {
    if (finished) return;
    finished = true;
    if (log) log.info(`sign-in window: ${why}`);
    settle(value);
    setImmediate(() => { if (!win.isDestroyed()) win.destroy(); });
  };
  const catchUrl = (event, target) => {
    if (!isRedirect(target, redirectUri)) return false;
    if (event && event.preventDefault) event.preventDefault();
    done(target, 'caught the redirect from Microsoft');
    return true;
  };

  // Catch it before the network: this is what makes "localhost" work with no server running.
  wc.session.webRequest.onBeforeRequest({ urls: ['http://localhost/*', 'http://localhost:*/*'] }, (details, cb) => {
    if (isRedirect(details.url, redirectUri)) { done(details.url, 'caught the redirect from Microsoft'); cb({ cancel: true }); } else cb({});
  });
  wc.on('will-redirect', catchUrl);
  wc.on('will-navigate', catchUrl);
  wc.on('did-fail-load', (_e, code, desc, failedUrl, isMain) => {
    if (isMain && catchUrl(null, failedUrl)) return;
    if (isMain && code !== -3 && !finished) { // -3 = aborted (normal while we cancel the redirect)
      if (log) log.warn(`sign-in window: page failed to load (${code} ${desc})`);
      wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<body style="font:15px -apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#333"><div style="text-align:center;max-width:340px"><h3>Couldn’t reach Microsoft</h3><p>Check your internet connection, then close this window and try again.</p><p style="color:#888;font-size:12px">${String(desc).replace(/[<>&]/g, '')}</p></div></body>`)}`);
    }
  });
  // Links Microsoft opens in new windows (privacy, help) go to the real browser.
  wc.setWindowOpenHandler(({ url: u }) => { if (SAFE_HTTPS.test(u)) shell.openExternal(u).catch(() => {}); return { action: 'deny' }; });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => done(null, 'closed by the user before finishing'));
  // Safety net: a window left open for 15 minutes gives up.
  const timer = setTimeout(() => done(null, 'timed out after 15 minutes'), 15 * 60e3);
  timer.unref();
  win.on('closed', () => clearTimeout(timer));

  wc.loadURL(url).catch((e) => { if (!finished && log) log.warn('sign-in window: loadURL rejected', e.message); });
  return {
    result,
    focus() { if (!win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } },
    close() { done(null, 'closed by Saturn'); },
  };
}

module.exports = { openMicrosoftLogin, isRedirect };
