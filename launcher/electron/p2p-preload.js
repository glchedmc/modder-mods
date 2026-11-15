'use strict';
// Bridge for the hidden P2P worker window (WebRTC lives in Chromium).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('p2pBridge', {
  onCommand(fn) { ipcRenderer.on('p2p:cmd', (_e, cmd) => fn(cmd)); },
  emit(evt) { ipcRenderer.send('p2p:evt', evt); },
  ready() { ipcRenderer.send('p2p:ready'); },
});
