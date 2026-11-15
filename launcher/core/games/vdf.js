'use strict';
// Valve KeyValues text format (libraryfolders.vdf, appmanifest_*.acf):
//   "key" "value"   or   "key" { ...nested... }
// Quoted or bare tokens, // comments, and \" \\ \n \t escapes inside quotes.
// Keys are kept as written; use get() for case-insensitive lookup.

function tokenize(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\uFEFF') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '{' || c === '}') { tokens.push(c); i++; continue; }
    if (c === '"') {
      let s = '';
      i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[i + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else s += text[i++];
      }
      i++;
      tokens.push({ s });
      continue;
    }
    // Bare token (also skips [$WIN32]-style conditionals as plain tokens).
    let s = '';
    while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++];
    if (/^\[\$.*\]$/.test(s)) continue;
    tokens.push({ s });
  }
  return tokens;
}

/** Parses KeyValues text into nested plain objects. Duplicate keys: last one wins. */
function parse(text) {
  const tokens = tokenize(String(text || ''));
  let pos = 0;
  function block() {
    const obj = {};
    while (pos < tokens.length) {
      const t = tokens[pos++];
      if (t === '}') return obj;
      if (t === '{') continue; // stray brace
      const key = t.s;
      const next = tokens[pos];
      if (next === '{') { pos++; obj[key] = block(); }
      else if (next && next !== '}') { pos++; obj[key] = next.s; }
      else obj[key] = '';
    }
    return obj;
  }
  return block();
}

/** Case-insensitive key lookup (Valve files mix "AppState"/"appstate", "LibraryFolders"/"libraryfolders"). */
function get(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  const k = Object.keys(obj).find((x) => x.toLowerCase() === key.toLowerCase());
  return k === undefined ? undefined : obj[k];
}

module.exports = { parse, get, tokenize };
