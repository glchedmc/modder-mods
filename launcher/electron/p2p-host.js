'use strict';
// Starts the hidden WebRTC worker window and connects it to a P2PManager.
const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');
const { P2PManager } = require('../core/p2p/manager');

function startP2P(opts = {}) {
  let win = null;
  let ready = false;
  const backlog = [];
  const worker = {
    send(cmd) {
      if (ready && win && !win.isDestroyed()) win.webContents.send('p2p:cmd', cmd);
      else backlog.push(cmd);
    },
  };
  const manager = new P2PManager(worker, opts);
  const open = () => {
    ready = false;
    win = new BrowserWindow({
      show: false,
      width: 200,
      height: 200,
      webPreferences: { preload: path.join(__dirname, 'p2p-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    win.loadFile(path.join(__dirname, 'p2p-worker.html'));
    win.on('closed', () => { win = null; ready = false; });
  };
  ipcMain.on('p2p:ready', (e) => {
    if (!win || e.sender !== win.webContents) return;
    ready = true;
    for (const c of backlog.splice(0)) win.webContents.send('p2p:cmd', c);
  });
  ipcMain.on('p2p:evt', (e, evt) => { if (win && e.sender === win.webContents) manager.handle(evt); });
  open();
  return { manager, window: () => win, reopen: () => { if (!win) open(); } };
}

module.exports = { startP2P };
