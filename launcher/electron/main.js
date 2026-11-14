'use strict';
const { app, BrowserWindow, ipcMain, safeStorage, shell, nativeTheme, dialog } = require('electron');
const path = require('path');
const { LauncherService } = require('../core/service');

let win;
let service;

function resourcesDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'resources') : path.join(__dirname, '..', 'resources');
}

function createWindow() {
  const mac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    title: 'Glass Launcher',
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 26, y: 26 },
    vibrancy: mac ? 'under-window' : undefined,
    visualEffectState: 'active',
    backgroundColor: mac ? '#00000000' : '#1b1e52',
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'renderer-dist', 'index.html'));
}

const emit = (channel, data) => { if (win && !win.isDestroyed()) win.webContents.send(channel, data); };

// Every renderer call goes through this allow-list; secrets are write-only from the UI.
const METHODS = [
  'getSettings', 'setSettings', 'secretStatus', 'setSecret', 'listVersions', 'loaderVersions',
  'listInstances', 'createInstance', 'updateInstance', 'removeInstance', 'launch',
  'searchMods', 'installMod', 'removeMod', 'toggleMod', 'checkMods',
  'listSchematics', 'addSchematics', 'removeSchematic', 'searchSchematics', 'downloadSchematic',
  'startPort', 'listJobs', 'cancelJob', 'listAccounts', 'startSignIn', 'signOut',
  'getCompanion', 'setCompanion',
];

app.whenReady().then(async () => {
  service = await new LauncherService({
    dataDir: app.getPath('userData'),
    cipher: safeStorage,
    resourcesDir: resourcesDir(),
    emit,
  }).init();

  for (const m of METHODS) {
    ipcMain.handle(`api:${m}`, async (_e, ...args) => {
      try {
        return { ok: true, value: await service[m](...args) };
      } catch (err) {
        return { ok: false, error: err.message, code: err.code };
      }
    });
  }
  ipcMain.handle('api:openFolder', (_e, id) => shell.openPath(service.instanceDir(id)));
  ipcMain.handle('api:openUrl', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  ipcMain.handle('api:pickSchematicFiles', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Add schematics',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Schematics', extensions: ['litematic', 'schem', 'schematic', 'nbt', 'zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return { ok: true, value: r.canceled ? [] : r.filePaths };
  });
  ipcMain.handle('api:appInfo', () => ({ ok: true, value: { version: app.getVersion(), platform: process.platform, arch: process.arch, dataDir: app.getPath('userData'), electron: process.versions.electron, dark: nativeTheme.shouldUseDarkColors } }));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
