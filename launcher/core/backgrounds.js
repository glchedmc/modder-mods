'use strict';
// Custom wallpaper files live in the launcher data folder (not in the repo).
// Preset scenes are rendered in the UI; this module only validates and stores files.
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { exists } = require('./util');

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
const VIDEO_EXT = new Set(['mp4', 'webm']);
const MAX_BYTES = 80 * 1024 * 1024;

const PRESET_IDS = [
  'highlands', 'dawn', 'midday', 'sunset', 'night', 'cherry', 'autumn', 'snowy', 'ocean', 'desert',
  'solid-midnight', 'solid-navy', 'solid-slate', 'solid-ink', 'solid-fog', 'solid-ivory',
  'solid-blush', 'solid-sand', 'solid-sage', 'solid-teal', 'solid-lavender', 'solid-terracotta',
  'solid-custom',
  'grad-twilight', 'grad-dawn', 'grad-space', 'grad-mint', 'grad-rosegold', 'grad-dusk', 'grad-fog', 'grad-ember',
  'aurora', 'glassflow', 'starfield', 'prism', 'mesh',
];

const SPECIAL_IDS = new Set(['custom', 'inherit', 'art', ...PRESET_IDS]);

function extOf(file) {
  return path.extname(String(file || '')).slice(1).toLowerCase();
}

function kindOf(ext) {
  if (VIDEO_EXT.has(ext)) return 'video';
  if (IMAGE_EXT.has(ext)) return 'image';
  return null;
}

function isAllowedExt(ext) {
  return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
}

function isPresetId(id) {
  return PRESET_IDS.includes(id);
}

function isBackgroundId(id) {
  return SPECIAL_IDS.has(id);
}

function dir(dirs) {
  return dirs.backgrounds;
}

function safePath(dirs, file) {
  const base = path.basename(String(file || ''));
  if (!base || base !== String(file) || base === '.' || base === '..') {
    throw new Error('Invalid background file');
  }
  const root = path.resolve(dir(dirs));
  const full = path.resolve(root, base);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Background path is outside the data folder');
  if (!isAllowedExt(extOf(base))) throw new Error('Use a png, jpg, webp, gif, mp4, or webm file.');
  return full;
}

function mediaUrl(file) {
  return `glass-bg://file/${encodeURIComponent(path.basename(String(file)))}`;
}

async function importFile(dirs, sourcePath, { originalName } = {}) {
  if (!sourcePath) throw new Error('No file selected');
  const ext = extOf(sourcePath);
  if (!isAllowedExt(ext)) throw new Error('Use a png, jpg, webp, gif, mp4, or webm file.');
  let stat;
  try { stat = await fsp.stat(sourcePath); } catch {
    throw new Error('That file could not be read.');
  }
  if (!stat.isFile()) throw new Error('Not a file');
  if (stat.size > MAX_BYTES) throw new Error('That file is larger than 80 MB.');
  const id = crypto.randomBytes(8).toString('hex');
  const file = `${id}.${ext}`;
  await fsp.mkdir(dir(dirs), { recursive: true });
  const dest = path.join(dir(dirs), file);
  await fsp.copyFile(sourcePath, dest);
  return {
    id,
    file,
    name: path.basename(originalName || sourcePath),
    kind: kindOf(ext),
    ext,
  };
}

async function removeFile(dirs, file) {
  if (!file) return;
  const full = safePath(dirs, file);
  await fsp.rm(full, { force: true });
}

async function fileExists(dirs, file) {
  if (!file) return false;
  try { return await exists(safePath(dirs, file)); } catch { return false; }
}

module.exports = {
  IMAGE_EXT, VIDEO_EXT, MAX_BYTES, PRESET_IDS,
  extOf, kindOf, isAllowedExt, isPresetId, isBackgroundId,
  dir, safePath, mediaUrl, importFile, removeFile, fileExists,
};
