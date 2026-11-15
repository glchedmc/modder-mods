'use strict';
// AI skin generation. The launcher asks an image model for either a front-view
// character (default, mapped onto the 64x64 skin layout in the renderer) or a
// skin texture sheet (experimental). Keys are the user's own, kept in the Keychain.
const { request } = require('../net');

const PROVIDERS = {
  grok: { label: 'Grok', secret: 'xaiApiKey', url: 'https://api.x.ai/v1/images/generations', model: 'grok-imagine-image-2.0', keyUrl: 'https://console.x.ai' },
  openai: { label: 'ChatGPT', secret: 'openaiApiKey', url: 'https://api.openai.com/v1/images/generations', model: 'gpt-image-1', keyUrl: 'https://platform.openai.com/api-keys' },
};
const MODES = ['character', 'texture'];

function buildPrompt(userPrompt, mode = 'character') {
  const idea = String(userPrompt || '').trim().slice(0, 600);
  if (!idea) throw Object.assign(new Error('Describe the skin you want.'), { code: 'EMPTY_PROMPT' });
  if (mode === 'texture') {
    return `A Minecraft Java Edition player skin texture file: the flat 64x64 UV atlas layout (head, body, arms and legs unwrapped exactly where the standard Steve skin template puts them), pixel art, crisp square pixels, no anti-aliasing, transparent unused areas, no text, no 3D render. Character: ${idea}.`;
  }
  return `Full-body pixel-art Minecraft character standing straight, facing the viewer, arms straight down at the sides, legs together, blocky Minecraft proportions (square head, rectangular body, arms and legs), centered, whole body visible from head to feet, flat even lighting, no shadows, plain pure white background, nothing else in the image. Character: ${idea}.`;
}

function requestBody(provider, { prompt, mode, model }) {
  const p = PROVIDERS[provider];
  if (provider === 'grok') {
    return { model: model || p.model, prompt, n: 1, response_format: 'b64_json', aspect_ratio: mode === 'texture' ? '1:1' : '2:3' };
  }
  return { model: model || p.model, prompt, n: 1, size: mode === 'texture' ? '1024x1024' : '1024x1536', background: mode === 'texture' ? 'transparent' : 'opaque', output_format: 'png' };
}

function friendlyError(provider, status, body) {
  const msg = (body && body.error && (body.error.message || body.error)) || (body && (body.message || body.detail)) || '';
  const label = PROVIDERS[provider].label;
  if (status === 401 || (status === 403 && /key|auth/i.test(msg))) return Object.assign(new Error(`${label} rejected the API key. Check it in Settings.`), { code: 'BAD_KEY' });
  if (status === 402 || /credit|billing|quota|insufficient/i.test(msg)) return Object.assign(new Error(`${label} needs API credits on your account first.`), { code: 'NO_CREDITS' });
  if (status === 400 && /safety|moderation|policy/i.test(msg)) return Object.assign(new Error('That prompt was blocked by the provider. Try a different description.'), { code: 'BLOCKED' });
  return Object.assign(new Error(`${label} image request failed (HTTP ${status})${msg ? `: ${String(msg).slice(0, 160)}` : ''}`), { code: 'FAILED', status });
}

/** Returns {b64, mime, model}. Never logs or returns the key. */
async function generate({ provider = 'grok', apiKey, prompt, mode = 'character', model, signal }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown provider ${provider}`);
  if (!apiKey) throw Object.assign(new Error(`Add your ${p.label} API key in Settings → Accounts & Keys.`), { code: 'NO_KEY', provider });
  const body = requestBody(provider, { prompt: buildPrompt(prompt, MODES.includes(mode) ? mode : 'character'), mode, model });
  const res = await request(p.url, { method: 'POST', signal, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 1);
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw friendlyError(provider, res.status, json);
  const item = json && json.data && json.data[0];
  if (!item) throw new Error('The image service returned no image.');
  let b64 = item.b64_json;
  if (!b64 && item.url) {
    const img = await request(item.url, {}, 1);
    b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
  }
  const head = Buffer.from(b64.slice(0, 16), 'base64');
  const mime = head[0] === 0xff && head[1] === 0xd8 ? 'image/jpeg' : head[0] === 0x52 && head[1] === 0x49 ? 'image/webp' : 'image/png';
  return { b64, mime, model: body.model, revisedPrompt: item.revised_prompt || null };
}

module.exports = { PROVIDERS, MODES, buildPrompt, requestBody, generate, friendlyError };
