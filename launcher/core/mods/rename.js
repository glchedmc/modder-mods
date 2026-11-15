'use strict';
// Renaming mods from the launcher. The display name only lives in instance.json
// (mod.displayName). Renaming the file is optional and done safely: same folder,
// same extension, no path parts, no clobbering, and .disabled is kept in sync.
const fsp = require('fs/promises');
const path = require('path');
const { exists } = require('../util');

function cleanDisplayName(name) {
  if (name === null || name === undefined) return null;
  const s = String(name).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return s || null;
}

/** Returns a safe file name keeping the original extension, or throws. */
function safeFileName(input, originalFile) {
  const ext = (/\.(jar|zip|litemod)$/i.exec(originalFile) || ['.jar'])[0].toLowerCase();
  let base = String(input || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  base = base.replace(/\.disabled$/i, '');
  if (base.toLowerCase().endsWith(ext)) base = base.slice(0, -ext.length);
  if (!base || /[/\\:]/.test(base) || base.startsWith('.') || base === '..') {
    throw Object.assign(new Error('Use a plain file name without slashes.'), { code: 'BAD_NAME' });
  }
  base = base.replace(/[<>"|?*]/g, '-').slice(0, 120);
  return `${base}${ext}`;
}

function diskName(mod, file = mod.file) {
  return mod.enabled === false ? `${file}.disabled` : file;
}

async function moveFile(instanceDir, mod, newFile, allMods = []) {
  if (newFile === mod.file) return mod;
  const dir = path.join(instanceDir, mod.folder || 'mods');
  if (allMods.some((m) => m !== mod && m.file.toLowerCase() === newFile.toLowerCase() && (m.folder || 'mods') === (mod.folder || 'mods'))) {
    throw Object.assign(new Error(`Another mod already uses ${newFile}.`), { code: 'EXISTS' });
  }
  const from = path.join(dir, diskName(mod));
  const to = path.join(dir, diskName(mod, newFile));
  const caseOnly = from.toLowerCase() === to.toLowerCase();
  if (!caseOnly && ((await exists(to)) || (await exists(path.join(dir, newFile))) || (await exists(path.join(dir, `${newFile}.disabled`))))) {
    throw Object.assign(new Error(`${newFile} already exists in ${mod.folder || 'mods'}.`), { code: 'EXISTS' });
  }
  if (await exists(from)) {
    if (caseOnly) { const tmp = `${from}.rename-${process.pid}`; await fsp.rename(from, tmp); await fsp.rename(tmp, to); }
    else await fsp.rename(from, to);
  }
  return { ...mod, file: newFile, originalFile: mod.originalFile || mod.file };
}

/**
 * opts: {name?: string|null, fileName?: string}
 * Returns {mod, undo} where undo is the opts that put things back (call with mod.file).
 */
async function renameMod(instanceDir, mod, opts = {}, allMods = []) {
  if (mod.source === 'companion' && opts.fileName) throw new Error('The companion mod file is managed by the launcher.');
  let next = { ...mod };
  const undo = {};
  if ('name' in opts) {
    undo.name = mod.displayName || null;
    const n = cleanDisplayName(opts.name);
    if (n && n !== mod.title) next.displayName = n; else delete next.displayName;
  }
  if (opts.fileName) {
    const f = safeFileName(opts.fileName, mod.file);
    if (f !== mod.file) {
      undo.fileName = mod.file;
      const hadOriginal = Boolean(mod.originalFile);
      next = await moveFile(instanceDir, next, f, allMods);
      if (next.file === mod.originalFile) delete next.originalFile;
      if (!hadOriginal) undo.clearOriginal = true;
    }
  }
  return { mod: next, undo };
}

/** Back to the downloaded title and file name. */
async function resetMod(instanceDir, mod, allMods = []) {
  const undo = { name: mod.displayName || null };
  let next = { ...mod };
  delete next.displayName;
  if (mod.originalFile && mod.originalFile !== mod.file) {
    undo.fileName = mod.file;
    next = await moveFile(instanceDir, next, mod.originalFile, allMods);
    delete next.originalFile;
  }
  return { mod: next, undo };
}

module.exports = { renameMod, resetMod, safeFileName, cleanDisplayName };
