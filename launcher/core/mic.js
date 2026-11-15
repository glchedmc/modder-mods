'use strict';
// Microphone permission (macOS). Java is launched as a child of Saturn Client,
// so macOS attributes its microphone use to the launcher: once the launcher has
// access, Simple Voice Chat inside the game can record.
const STATES = {
  granted: { label: 'Allowed', tone: 'green', hint: 'Voice chat mods can use your mic.' },
  denied: { label: 'Blocked', tone: 'red', hint: 'Turn it on in System Settings → Privacy & Security → Microphone.' },
  restricted: { label: 'Restricted', tone: 'red', hint: 'Blocked by a device policy.' },
  'not-determined': { label: 'Not asked yet', tone: 'amber', hint: 'Click Allow to show the macOS prompt.' },
  unknown: { label: 'Unknown', tone: '', hint: 'Mic access is managed by your OS.' },
};

function describe(status, platform = process.platform) {
  if (platform !== 'darwin') return { status: 'granted', ...STATES.granted, hint: 'No permission needed on this OS.', platform };
  const s = STATES[status] ? status : 'unknown';
  return { status: s, ...STATES[s], platform, canPrompt: s === 'not-determined' };
}

/** First launch on macOS: ask once, then leave it to the Settings button. */
function shouldPromptOnLaunch(settings, status, platform = process.platform) {
  return platform === 'darwin' && status === 'not-determined' && !(settings && settings.micPrompted);
}

const PRIVACY_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';

module.exports = { describe, shouldPromptOnLaunch, PRIVACY_URL, STATES };
