'use strict';
// Fallback for "sign in with my default browser": a one-shot HTTP server on localhost that catches
// Microsoft's redirect (http://localhost:<port>/?code=…). Binds an ephemeral port, accepts only the
// first request that carries code/error, shows a friendly page, and always shuts itself down.
const http = require('http');

const PAGE = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px -apple-system,Segoe UI,Roboto,sans-serif;background:#1b1e52;color:#fff;display:grid;place-items:center;height:100vh;margin:0}div{text-align:center;max-width:420px;padding:32px;border-radius:24px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2)}h1{font-size:22px;margin:0 0 8px}p{opacity:.8;margin:0}</style><div><h1>${title}</h1><p>${body}</p></div>`;

/**
 * @returns {Promise<{port:number, redirectUri:string, result:Promise<string|null>, close:()=>void}>}
 * result resolves to the full redirect URL (with code/error), or null on timeout/close.
 */
function listenForRedirect({ timeoutMs = 5 * 60e3 } = {}) {
  return new Promise((resolve, reject) => {
    let done;
    const result = new Promise((r) => { done = r; });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const failed = url.searchParams.has('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(failed ? PAGE('Sign-in didn’t finish', 'Go back to Saturn to see what happened.') : PAGE('You’re signed in', 'You can close this tab and return to Saturn.'));
      finish(`http://localhost:${server.address().port}${req.url}`);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref();
    function finish(v) {
      clearTimeout(timer);
      done(v);
      setTimeout(() => { try { server.close(); } catch { /* closed */ } }, 300).unref();
    }
    server.once('error', reject);
    // Port 0 = any free port. No host: listens on both ::1 and 127.0.0.1, so "localhost" works either way.
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ port, redirectUri: `http://localhost:${port}`, result, close: () => finish(null) });
    });
  });
}

module.exports = { listenForRedirect };
