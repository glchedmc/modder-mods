'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const METHODS = [
  'getSettings', 'setSettings', 'secretStatus', 'setSecret', 'listVersions', 'loaderVersions',
  'listInstances', 'createInstance', 'updateInstance', 'removeInstance', 'launch',
  'searchMods', 'installMod', 'removeMod', 'toggleMod', 'checkMods',
  'startPort', 'listJobs', 'cancelJob', 'listAccounts', 'startSignIn', 'signOut',
  'getCompanion', 'setCompanion', 'appInfo', 'openFolder',
];

const api = {};
for (const m of METHODS) {
  api[m] = async (...args) => {
    const r = await ipcRenderer.invoke(`api:${m}`, ...args);
    if (r && r.ok === false) { const e = new Error(r.error); e.code = r.code; throw e; }
    return r && 'value' in r ? r.value : r;
  };
}

const CHANNELS = ['launch:progress', 'launch:state', 'launch:log', 'grok:job', 'auth:update'];
contextBridge.exposeInMainWorld('glass', {
  api,
  on(channel, fn) {
    if (!CHANNELS.includes(channel)) throw new Error(`Unknown channel ${channel}`);
    const h = (_e, data) => fn(data);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
});
