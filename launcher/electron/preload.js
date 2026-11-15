'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const METHODS = [
  'getSettings', 'setSettings', 'secretStatus', 'setSecret', 'listVersions', 'loaderVersions',
  'listInstances', 'createInstance', 'updateInstance', 'removeInstance', 'launch',
  'searchMods', 'installMod', 'removeMod', 'toggleMod', 'checkMods',
  'listSchematics', 'addSchematics', 'removeSchematic', 'searchSchematics', 'downloadSchematic',
  'startPort', 'listJobs', 'cancelJob', 'listAccounts', 'startSignIn', 'signOut',
  'getCompanion', 'setCompanion', 'appInfo', 'openFolder', 'openUrl', 'pickSchematicFiles',
  'importBackground', 'removeBackgroundFile', 'backgroundUrl', 'pickBackgroundFile',
  'renameMod', 'resetModName',
  'listSkins', 'addSkin', 'updateSkin', 'removeSkin', 'selectSkin', 'accountProfile', 'applySkin', 'setAccountCape',
  'skinAiProviders', 'generateSkinImage',
  'getCosmetics', 'setCosmetics', 'addCustomCape', 'removeCustomCape',
  'hostStatus', 'installHostingMod', 'hostWorld',
  'micStatus', 'requestMic', 'openMicSettings', 'setAppIcon', 'pickImageFile', 'migrationInfo',
  'hostNetwork', 'upnpMap', 'upnpUnmap', 'tailscaleStatus', 'setDdnsName', 'updateDdns', 'enableVoiceChat',
  'p2pList', 'p2pCreateInvite', 'p2pAcceptReply', 'p2pJoin', 'p2pClose',
  'lookupPlayerSkin', 'storageInfo', 'detectJava', 'copyText',
  'socialState', 'socialMessages', 'socialSend', 'socialFind', 'socialAddFriend', 'socialAccept', 'socialDecline', 'socialRemove',
  'socialSetActive', 'socialSaveWorld', 'socialRemoveWorld', 'socialInvite', 'socialJoin', 'socialCancelJoin', 'socialQr', 'socialPlay', 'socialSetProfile',
];

const api = {};
for (const m of METHODS) {
  api[m] = async (...args) => {
    const r = await ipcRenderer.invoke(`api:${m}`, ...args);
    if (r && r.ok === false) { const e = new Error(r.error); e.code = r.code; throw e; }
    return r && 'value' in r ? r.value : r;
  };
}

const CHANNELS = ['launch:progress', 'launch:state', 'launch:log', 'grok:job', 'auth:update', 'host:update', 'p2p:update', 'social:update', 'social:event', 'nav'];
contextBridge.exposeInMainWorld('glass', {
  api,
  pathsFromFiles(fileList) {
    try { return Array.from(fileList || []).map((f) => webUtils.getPathForFile(f)).filter(Boolean); }
    catch { return []; }
  },
  on(channel, fn) {
    if (!CHANNELS.includes(channel)) throw new Error(`Unknown channel ${channel}`);
    const h = (_e, data) => fn(data);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
});
