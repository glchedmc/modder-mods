'use strict';
// Minimal xAI Responses API client (POST https://api.x.ai/v1/responses).
// Docs: https://docs.x.ai/developers/rest-api-reference/inference/responses
const { request } = require('../net');

const BASE = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-4.7';

/** Concatenates all output_text parts of a Responses API result. */
function outputText(resp) {
  const parts = [];
  for (const item of resp.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) if (c.type === 'output_text' && c.text) parts.push(c.text);
  }
  return parts.join('');
}

async function createResponse({ apiKey, model = DEFAULT_MODEL, input, instructions, previousResponseId, reasoningEffort = 'high', maxOutputTokens, signal, timeoutMs = 30 * 60 * 1000 }) {
  if (!apiKey) { const e = new Error('Add your xAI key in Settings'); e.code = 'NO_XAI_KEY'; throw e; }
  const body = {
    model,
    input,
    reasoning: { effort: reasoningEffort },
    temperature: 0.7,
    top_p: 0.95,
    store: true,
  };
  if (instructions && !previousResponseId) body.instructions = instructions;
  if (previousResponseId) body.previous_response_id = previousResponseId;
  if (maxOutputTokens) body.max_output_tokens = maxOutputTokens;
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await request(`${BASE}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }, 1);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && (json.error.message || json.error)) || json.message || `HTTP ${res.status}`;
    const e = new Error(`xAI API error: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    e.status = res.status;
    throw e;
  }
  return { id: json.id, text: outputText(json), status: json.status, usage: json.usage || null };
}

module.exports = { BASE, DEFAULT_MODEL, createResponse, outputText };
