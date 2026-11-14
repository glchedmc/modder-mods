'use strict';
// Evaluates Mojang library/argument rules (allow/disallow by os and features).

function osMatches(ruleOs, platform) {
  if (!ruleOs) return true;
  if (ruleOs.name && ruleOs.name !== platform.name) return false;
  if (ruleOs.arch) {
    const want = ruleOs.arch;
    const have = platform.arch;
    const ok = want === have || (want === 'x86' && have === 'x86') || (want === 'arm64' && have === 'arm64');
    if (!ok) return false;
  }
  if (ruleOs.version && platform.version) {
    try { if (!new RegExp(ruleOs.version).test(platform.version)) return false; } catch { /* ignore bad regex */ }
  }
  return true;
}

function featuresMatch(ruleFeatures, features = {}) {
  if (!ruleFeatures) return true;
  return Object.entries(ruleFeatures).every(([k, v]) => Boolean(features[k]) === v);
}

/** Returns true when the rules list allows the item on this platform. */
function rulesAllow(rules, platform, features = {}) {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (osMatches(rule.os, platform) && featuresMatch(rule.features, features)) {
      allowed = rule.action === 'allow';
    }
  }
  return allowed;
}

module.exports = { rulesAllow, osMatches, featuresMatch };
