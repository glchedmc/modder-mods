'use strict';
// Microsoft account sign-in for Minecraft: device code -> MSA token -> Xbox Live
// -> XSTS -> Minecraft access token -> entitlement + profile check.
// Needs YOUR Azure app client ID, approved by Mojang for Minecraft services
// (https://aka.ms/mce-reviewappid). No other launcher's client ID is used.
const { fetchJson, request } = require('../net');

const SCOPE = 'XboxLive.signin offline_access';
const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';

const XSTS_ERRORS = {
  2148916233: 'This Microsoft account has no Xbox profile. Sign in once at xbox.com to create one, then try again.',
  2148916235: 'Xbox Live is not available in your country or region.',
  2148916236: 'This account needs adult verification on xbox.com (South Korea).',
  2148916237: 'This account needs adult verification on xbox.com (South Korea).',
  2148916238: 'This is a child account. An adult must add it to a Microsoft family before it can sign in.',
};

function form(obj) { return new URLSearchParams(obj).toString(); }

async function postForm(url, body) {
  const res = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function startDeviceCode(clientId) {
  if (!clientId) {
    const e = new Error('Set your Azure client ID in Settings → Accounts & Keys before signing in.');
    e.code = 'NO_CLIENT_ID';
    throw e;
  }
  const { status, json } = await postForm(`${AUTHORITY}/devicecode`, { client_id: clientId, scope: SCOPE });
  if (status !== 200) throw new Error(`Microsoft rejected the device code request: ${json.error_description || json.error || status}`);
  return json; // {device_code, user_code, verification_uri, expires_in, interval, message}
}

async function pollToken(clientId, device, { signal } = {}) {
  let interval = (device.interval || 5) * 1000;
  const deadline = Date.now() + device.expires_in * 1000;
  while (Date.now() < deadline) {
    if (signal && signal.aborted) throw new Error('Sign-in cancelled');
    await new Promise((r) => setTimeout(r, interval));
    const { status, json } = await postForm(`${AUTHORITY}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: clientId, device_code: device.device_code,
    });
    if (status === 200) return json;
    if (json.error === 'authorization_pending') continue;
    if (json.error === 'slow_down') { interval += 5000; continue; }
    throw new Error(`Microsoft sign-in failed: ${json.error_description || json.error}`);
  }
  throw new Error('The sign-in code expired. Start again.');
}

async function refreshMsa(clientId, refreshToken) {
  const { status, json } = await postForm(`${AUTHORITY}/token`, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken, scope: SCOPE });
  if (status !== 200) throw new Error(`Could not refresh Microsoft session: ${json.error_description || json.error}`);
  return json;
}

async function xboxChain(msaAccessToken) {
  const json = (url, body) => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const xbl = await json('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msaAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
  });
  const res = await request('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' }),
  });
  const xsts = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error(XSTS_ERRORS[xsts.XErr] || `Xbox Live refused sign-in (XErr ${xsts.XErr}).`);
  if (!res.ok) throw new Error(`XSTS HTTP ${res.status}`);
  const uhs = xsts.DisplayClaims.xui[0].uhs;
  return { uhs, xstsToken: xsts.Token, xuid: xsts.DisplayClaims.xui[0].xid };
}

async function minecraftLogin({ uhs, xstsToken }) {
  const res = await request('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` }),
  });
  const json = await res.json().catch(() => ({}));
  const unapproved = res.status === 403 || (json.errorMessage && /Invalid app registration/i.test(json.errorMessage));
  if (unapproved) {
    const e = new Error('Microsoft sign-in is waiting on Mojang approval.');
    e.code = 'APP_NOT_APPROVED';
    throw e;
  }
  if (!res.ok) throw new Error(`Minecraft login failed (HTTP ${res.status})`);
  return json; // {access_token, expires_in, username(uuid)}
}

async function minecraftProfile(mcToken) {
  const headers = { Authorization: `Bearer ${mcToken}` };
  const ent = await fetchJson('https://api.minecraftservices.com/entitlements/mcstore', { headers });
  const owns = (ent.items || []).some((i) => i.name === 'game_minecraft' || i.name === 'product_minecraft');
  const res = await request('https://api.minecraftservices.com/minecraft/profile', { headers });
  if (res.status === 404) {
    const e = new Error(owns ? 'This account owns Minecraft but has no Java profile yet. Launch the official launcher once to pick a name.' : 'This Microsoft account does not own Minecraft: Java Edition.');
    e.code = 'NO_PROFILE';
    throw e;
  }
  if (!res.ok) throw new Error(`Profile lookup failed (HTTP ${res.status})`);
  const p = await res.json();
  return { uuid: p.id, name: p.name, skins: p.skins, owns };
}

/** From an MSA token response to a launchable account object. */
async function completeLogin(msa) {
  const chain = await xboxChain(msa.access_token);
  const mc = await minecraftLogin(chain);
  const profile = await minecraftProfile(mc.access_token);
  return {
    type: 'msa', name: profile.name, uuid: profile.uuid, xuid: chain.xuid,
    accessToken: mc.access_token, expiresAt: Date.now() + mc.expires_in * 1000,
    refreshToken: msa.refresh_token,
  };
}

module.exports = { startDeviceCode, pollToken, refreshMsa, completeLogin, xboxChain, minecraftLogin, minecraftProfile, XSTS_ERRORS };
