'use strict';
const { app, BrowserWindow, ipcMain, safeStorage, shell, nativeTheme, dialog, protocol, net, systemPreferences, nativeImage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { LauncherService } = require('../core/service');
const backgrounds = require('../core/backgrounds');
const { exists } = require('../core/util');
const mic = require('../core/mic');
const { migrateDataDir } = require('../core/migrate');

app.setName('Saturn Client');
// Move data from the old "Glass Launcher" folder before anything opens it.
let migration = { migrated: false };
try { migration = migrateDataDir(app.getPath('appData'), app.getPath('userData')); } catch (e) { migration = { migrated: false, error: e.message }; }

const DOCK_ICONS = ['saturn', 'wireframe', 'crystal'];
function applyDockIcon(name) {
  if (process.platform !== 'darwin' || !app.dock) return false;
  const file = path.join(resourcesDir(), 'dock', `${DOCK_ICONS.includes(name) ? name : 'saturn'}.png`);
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return false;
  app.dock.setIcon(img);
  return true;
}

function micStatus() {
  const raw = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('microphone') : 'granted';
  return mic.describe(raw);
}

async function askMic() {
  if (process.platform !== 'darwin') return micStatus();
  const before = systemPreferences.getMediaAccessStatus('microphone');
  if (before === 'not-determined') await systemPreferences.askForMediaAccess('microphone');
  else if (before === 'denied') await shell.openExternal(mic.PRIVACY_URL);
  return micStatus();
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'glass-bg', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
]);

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
    title: 'Saturn Client',
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
  'importBackground', 'removeBackgroundFile', 'backgroundUrl',
  'renameMod', 'resetModName',
  'listSkins', 'addSkin', 'updateSkin', 'removeSkin', 'selectSkin', 'accountProfile', 'applySkin', 'setAccountCape',
  'skinAiProviders', 'generateSkinImage',
  'getCosmetics', 'setCosmetics', 'addCustomCape', 'removeCustomCape',
  'hostStatus', 'installHostingMod', 'hostWorld',
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
  protocol.handle('glass-bg', async (request) => {
    try {
      const url = new URL(request.url);
      const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const full = backgrounds.safePath(service.dirs, name);
      if (!(await exists(full))) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(full).href);
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
  });

  ipcMain.handle('api:micStatus', () => ({ ok: true, value: micStatus() }));
  ipcMain.handle('api:requestMic', async () => ({ ok: true, value: await askMic() }));
  ipcMain.handle('api:openMicSettings', async () => { if (process.platform === 'darwin') await shell.openExternal(mic.PRIVACY_URL); return { ok: true, value: true }; });
  ipcMain.handle('api:setAppIcon', async (_e, name) => {
    await service.setSettings({ appIcon: DOCK_ICONS.includes(name) ? name : 'saturn' });
    return { ok: true, value: applyDockIcon(name) };
  });
  ipcMain.handle('api:pickImageFile', async (_e, title) => {
    const r = await dialog.showOpenDialog(win, { title: title || 'Choose a PNG', properties: ['openFile'], filters: [{ name: 'PNG images', extensions: ['png'] }] });
    if (r.canceled) return { ok: true, value: null };
    const fsp = require('fs/promises');
    const buf = await fsp.readFile(r.filePaths[0]);
    if (buf.length > 4 * 1024 * 1024) return { ok: false, error: 'That image is too large.' };
    return { ok: true, value: { name: path.basename(r.filePaths[0]), dataUrl: `data:image/png;base64,${buf.toString('base64')}` } };
  });
  ipcMain.handle('api:migrationInfo', () => ({ ok: true, value: migration }));
  ipcMain.handle('api:openFolder', (_e, id) => shell.openPath(service.instanceDir(id)));
  ipcMain.handle('api:openUrl', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
  ipcMain.handle('api:pickBackgroundFile', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a background',
      properties: ['openFile'],
      filters: [
        { name: 'Images and videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: 'Videos', extensions: ['mp4', 'webm'] },
      ],
    });
    return { ok: true, value: r.canceled ? null : r.filePaths[0] };
  });
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
  const s = await service.getSettings();
  applyDockIcon(s.appIcon);
  createWindow();
  // First launch on macOS: ask for the microphone so voice chat mods (Simple Voice Chat)
  // work in game; Java runs as our child process and inherits this permission.
  if (mic.shouldPromptOnLaunch(s, process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('microphone') : 'granted')) {
    win.once('ready-to-show', async () => {
      await service.setSettings({ micPrompted: true });
      try { await systemPreferences.askForMediaAccess('microphone'); } catch { /* user can retry in Settings */ }
    });
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
