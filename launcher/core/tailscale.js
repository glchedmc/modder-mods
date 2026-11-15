'use strict';
// Tailscale detection. Tailscale gives every device a private 100.x address
// (and a MagicDNS name) that works through any NAT, UDP included, so Simple
// Voice Chat works with no port forwarding.
const { execFile } = require('child_process');
const fs = require('fs');

const INSTALL = {
  darwin: { url: 'https://tailscale.com/download/mac', steps: ['Install Tailscale from the Mac App Store or tailscale.com/download/mac.', 'Open it from the menu bar and sign in.', 'Your friend installs it too and joins your tailnet (invite them or share this device).'] },
  linux: { url: 'https://tailscale.com/download/linux', command: 'curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up', steps: ['Run the install command in a terminal.', 'Run "sudo tailscale up" and sign in from the link it prints.', 'Your friend installs it too and joins your tailnet (invite them or share this device).'] },
  win32: { url: 'https://tailscale.com/download/windows', steps: ['Install Tailscale for Windows and sign in.', 'Your friend installs it too and joins your tailnet.'] },
};
const SHARE_URL = 'https://login.tailscale.com/admin/machines';
const INVITE_URL = 'https://login.tailscale.com/admin/users';

function candidates(platform = process.platform) {
  if (platform === 'darwin') return ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', 'tailscale'];
  if (platform === 'win32') return ['C:\\Program Files\\Tailscale\\tailscale.exe', 'tailscale'];
  return ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/usr/sbin/tailscale', 'tailscale'];
}

/** Turns `tailscale status --json` into what the Host World page needs. */
function parseStatus(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json || {};
  const self = j.Self || {};
  const ips = self.TailscaleIPs || j.TailscaleIPs || [];
  const ip4 = ips.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) || null;
  const ip6 = ips.find((ip) => ip.includes(':')) || null;
  const magic = Boolean(j.CurrentTailnet && j.CurrentTailnet.MagicDNSEnabled);
  const dnsName = magic && self.DNSName ? String(self.DNSName).replace(/\.$/, '') : null;
  const state = j.BackendState || 'Unknown';
  const peers = Object.values(j.Peer || {});
  return {
    installed: true,
    running: state === 'Running',
    state,
    needsLogin: state === 'NeedsLogin' || state === 'NeedsMachineAuth',
    authUrl: j.AuthURL || null,
    ip4, ip6, dnsName,
    hostName: self.HostName || null,
    tailnet: (j.CurrentTailnet && j.CurrentTailnet.Name) || null,
    peersOnline: peers.filter((p) => p.Online).length,
    peers: peers.length,
  };
}

function runJson(bin, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(bin, ['status', '--json'], { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      // `tailscale status` exits non-zero when logged out but still prints JSON.
      if (stdout && stdout.trim().startsWith('{')) return resolve(stdout);
      reject(err || new Error('No output'));
    });
  });
}

/** Detects Tailscale; never throws. */
async function status({ platform = process.platform, exec = runJson, exists = fs.existsSync } = {}) {
  const install = INSTALL[platform] || INSTALL.linux;
  let lastErr = null;
  for (const bin of candidates(platform)) {
    if (bin.includes('/') && !exists(bin)) continue;
    try {
      return { ...parseStatus(await exec(bin)), bin, install, shareUrl: SHARE_URL, inviteUrl: INVITE_URL };
    } catch (e) { lastErr = e; }
  }
  const installedButStopped = lastErr && lastErr.code !== 'ENOENT';
  return { installed: Boolean(installedButStopped), running: false, state: installedButStopped ? 'Stopped' : 'NotInstalled', install, shareUrl: SHARE_URL, inviteUrl: INVITE_URL };
}

module.exports = { parseStatus, status, candidates, INSTALL, SHARE_URL, INVITE_URL };
