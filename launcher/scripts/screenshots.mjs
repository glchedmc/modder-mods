// Headless screenshots of the renderer (browser mock mode) for design review.
// Usage: npm run build:renderer && node scripts/screenshots.mjs [outDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';

// Simulated macOS traffic lights at the exact spot main.js asks Electron for, plus an overlap check.
const MAC = JSON.parse(readFileSync(new URL('../core/mac-chrome.json', import.meta.url), 'utf8'));
async function macLights(p) {
  const report = await p.evaluate((m) => {
    const colors = ['#ff5f57', '#febc2e', '#28c840'];
    const lights = colors.map((c, i) => {
      const d = document.createElement('div');
      const x = m.trafficLights.x + i * (m.buttonSize + m.buttonGap);
      Object.assign(d.style, { position: 'fixed', left: `${x}px`, top: `${m.trafficLights.y}px`, width: `${m.buttonSize}px`, height: `${m.buttonSize}px`, borderRadius: '50%', background: c, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.3)', zIndex: 99999 });
      document.body.appendChild(d);
      return { left: x, top: m.trafficLights.y, right: x + m.buttonSize, bottom: m.trafficLights.y + m.buttonSize };
    });
    const group = { left: lights[0].left, top: lights[0].top, right: lights[2].right, bottom: lights[2].bottom };
    const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; };
    const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const sb = rect('.sidebar');
    const sbVisible = sb && getComputedStyle(document.querySelector('.sidebar')).opacity !== '0';
    return {
      group,
      sidebar: sbVisible ? sb : null,
      insideSidebar: sbVisible ? group.left - sb.left >= 12 && sb.right - group.right >= 12 && group.top - sb.top >= 12 : null,
      overlaps: ['.brand .saturn-mark, .brand svg, .brand img', '.brand-text', '.sidebar-toggle', '.nav button', '.toolbar h1'].filter((s) => [...document.querySelectorAll(s)].some((e) => { const r = e.getBoundingClientRect(); return r.width && hit(group, { left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 }); })),
      toggleGap: (() => { const t = rect('.sidebar-toggle'); return t ? Math.round(t.left - group.right) : null; })(),
    };
  }, MAC);
  console.log('mac chrome', JSON.stringify(report));
  if (report.overlaps.length || report.insideSidebar === false) console.log('OVERLAP!', report.overlaps);
}

const out = path.resolve(process.argv[2] || 'screenshots');
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME_PATH || '/opt/google/chrome/chrome';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));

const defaultView = { width: 1360, height: 860 };
const shots = [
  ['01-home', '#/home'],
  ['02-discover', '#/discover', async (p) => { await p.waitForSelector('.result-card img', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1500); }],
  ['03-instance', '#/instance?id=fabric-26-3'],
  ['04-grok-upgrade', '#/studio?job=job-1'],
  ['05-settings-companion', '#/settings?section=companion'],
  ['06-new-instance', '#/library', async (p) => { await p.click('.new-card'); await p.waitForTimeout(900); }],
  ['07-settings-keys', '#/settings?section=keys'],
  ['12-backgrounds', '#/settings?section=appearance', async (p) => { await p.waitForSelector('.bg-picker'); await p.waitForTimeout(800); }, { width: 1360, height: 1640 }],
  ['13-background-alt', '#/settings?section=appearance', async (p) => {
    await p.waitForSelector('[data-bg="sunset"]');
    await p.click('[data-bg="sunset"]');
    await p.waitForTimeout(400);
    await p.goto('http://localhost:4173/#/home');
    await p.waitForSelector('.hero');
    await p.waitForTimeout(900);
  }],
  ['14-instance-background', '#/instance?id=fabric-26-3', async (p) => {
    await p.getByRole('button', { name: 'Game Settings' }).click();
    await p.waitForSelector('.bg-picker');
    const h = await p.$('.group-title:text("Cover")');
    if (h) await h.scrollIntoViewIfNeeded();
    await p.waitForTimeout(700);
  }, { width: 1360, height: 1180 }],
  ['16-sidebar-collapsed', '#/home', async (p) => { await p.click('.sidebar-toggle'); await p.waitForTimeout(900); }],
  ['17-mod-rename', '#/instance?id=fabric-26-3', async (p) => {
    const rows = p.locator('.list-row');
    await rows.nth(3).locator('button[title="Rename"]').click();
    await p.fill('.rename-row input[aria-label="Display name"]', 'Lithium (server perf)');
    await p.click('.rename-row .btn.primary');
    await p.waitForTimeout(500);
    await rows.nth(2).locator('button[title="Rename"]').click();
    await p.fill('.rename-row input[aria-label="Display name"]', 'Sodium Renderer');
    await p.check('.rename-file input[type=checkbox]');
    await p.waitForTimeout(500);
  }],
  ['18-skins', '#/skins', async (p) => { await p.waitForSelector('.skin-card'); await p.waitForTimeout(2500); }, { width: 1360, height: 980 }],
  ['19-ai-skin', '#/skins?ai=1', async (p) => {
    await p.waitForSelector('.ai-grid textarea');
    await p.fill('.ai-grid textarea', 'Space explorer with a lilac visor and a starry jacket');
    await p.click('.sheet .grok-cta');
    await p.waitForSelector('.ai-preview canvas', { timeout: 15000 });
    await p.waitForTimeout(2500);
  }, { width: 1360, height: 900 }],
  ['20-cosmetics', '#/cosmetics', async (p) => { await p.waitForSelector('.cos-card'); await p.click('.cos-card:has-text("Aurora")'); await p.waitForTimeout(2500); }],
  ['21-host-world', '#/host', async (p) => {
    await p.waitForSelector('.provider-card');
    await p.click('.provider-card:has-text("e4mc")');
    await p.waitForSelector('.host-panel .play-btn');
    await p.click('.host-panel .play-btn');
    await p.waitForSelector('.host-address', { timeout: 15000 });
    await p.waitForTimeout(800);
  }],
  ['22-mic-settings', '#/settings?section=voice', async (p) => { await p.waitForTimeout(600); }],
  ['23-appearance-icon-sidebar', '#/settings?section=appearance', async (p) => { await p.waitForSelector('.icon-picker'); await p.waitForTimeout(600); }],
  ['24-sidebar-hidden', '#/skins', async (p) => {
    await p.goto('http://localhost:4173/#/settings?section=appearance');
    await p.waitForSelector('.icon-picker');
    await p.getByRole('tab', { name: 'Nothing' }).click();
    await p.click('.sidebar-toggle');
    await p.goto('http://localhost:4173/#/skins');
    await p.waitForTimeout(2500);
  }],
  ['25-glass-solid', '#/settings?section=appearance', async (p) => {
    await p.waitForSelector('.glass-preview');
    await p.click('.glass-preview .solid');
    await p.locator('.glass-preview').scrollIntoViewIfNeeded();
    await p.waitForTimeout(900);
  }],
  ['26-glass-max', '#/settings?section=appearance', async (p) => {
    await p.waitForSelector('.glass-preview');
    await p.click('.glass-preview .max');
    await p.locator('.glass-preview').scrollIntoViewIfNeeded();
    await p.waitForTimeout(900);
  }],
  ['27-host-direct-p2p', '#/host', async (p) => {
    await p.waitForSelector('.provider-card');
    await p.click('.provider-card:has-text("Direct (free)")');
    const launch = p.locator('.host-steps .btn:has-text("Launch")');
    if (await launch.count()) { await launch.click(); await p.waitForTimeout(1200); }
    await p.click('.host-steps .btn:has-text("Create invite")');
    await p.waitForSelector('.code-box');
    await p.fill('.p2p-exchange input', 'SATURN-REPLY-eJy1VMtu2zAQ…');
    await p.click('.p2p-exchange .btn:has-text("Connect")');
    await p.waitForTimeout(1600);
    await p.click('.host-steps .btn:has-text("Invite another friend")');
    await p.waitForSelector('.code-box');
    await p.waitForTimeout(700);
  }, { width: 1360, height: 1240 }],
  ['28-join-friend', '#/host?join=1', async (p) => {
    await p.waitForSelector('.code-input');
    await p.fill('.code-input', 'SATURN-INVITE-eJy1VMtu2zAQ/BWDZ8cRZcmPnNo0vQRFD0UvRVEYK2plEaZIgaQcG4H/vUtKbhzbbXooetPOzu7ODld8ZgK8UqU2GJ37Azp7qNHZnekRFVhQBoHPpHVG5WwePbMjMhsOkzwzNi8+ySxVj7G5g4vQXyLuuNIrXnbWMNZi4jdAoySTlIkUFxIr5ZB9TxjVmeAuNfIZnqLvpuHPmHmAhcGoMPX/wT8pfdB+v0d77vOcU4CRHpJMCzRBoQCQE0E4IrQbz7Yu63B7EoBXBIqEbHmHi1+vqrfbKmWiRg0cMEv9uRelNnfgt8pXTAy3n6C93G5MZ49QVQZ1BvnYQ8/BtN0frJ0iZtIfg2ShaVaxfS5Nqf+j0z+vVn3f/xDj98v6n+L74e+H/ZmN/bk9nfpv1/DPef3XkOmVxQ');
    await p.click('.sheet .btn.primary');
    await p.waitForSelector('.join-ready', { timeout: 15000 });
    await p.waitForTimeout(900);
  }, { width: 1360, height: 900 }],
  ['29-host-tailscale', '#/host', async (p) => {
    await p.waitForSelector('.provider-card');
    await p.click('.provider-card:has-text("Tailscale")');
    await p.waitForSelector('.host-panel h2:has-text("Tailscale")');
    await p.waitForTimeout(1200);
  }, { width: 1360, height: 1000 }],
  ['30-host-own-ip', '#/host', async (p) => {
    await p.waitForSelector('.provider-card');
    await p.click('.provider-card:has-text("Own IP")');
    await p.waitForSelector('.ip-tile');
    await p.click('.host-panel .btn:has-text("Open ports with UPnP")');
    await p.waitForTimeout(1500);
    await p.click('.host-panel .btn:has-text("Set up manually")');
    await p.waitForTimeout(800);
  }, { width: 1360, height: 1380 }],
  ['31-voice-chat-setup', '#/host', async (p) => {
    await p.waitForSelector('.provider-card');
    await p.click('.provider-card:has-text("Direct (free)")');
    const btn = p.locator('.btn:has-text("Enable voice chat")');
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await p.waitForTimeout(1800);
    await p.locator('.btn:has-text("Update voice setup")').scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(600);
  }, { width: 1360, height: 1000 }],
  ['32-skin-editor', '#/skins', async (p) => {
    await p.waitForSelector('.skin-card');
    await p.waitForTimeout(1200);
    await p.click('.btn:has-text("Edit")');
    await p.waitForSelector('.se-canvas');
    await p.waitForTimeout(1200);
    const box = await p.locator('.se-canvas').boundingBox();
    const px = box.width / 64;
    await p.click('.se-palette button >> nth=4');
    await p.click('.se-tool[title^="Mirror"]');
    const stroke = async (pts) => { await p.mouse.move(box.x + pts[0][0] * px + px / 2, box.y + pts[0][1] * px + px / 2); await p.mouse.down(); for (const [x, y] of pts.slice(1)) await p.mouse.move(box.x + x * px + px / 2, box.y + y * px + px / 2, { steps: 4 }); await p.mouse.up(); };
    await stroke([[20, 22], [27, 22]]);
    await stroke([[44, 22], [47, 22]]);
    await p.click('.se-palette button >> nth=9');
    await stroke([[22, 26], [25, 26]]);
    await p.waitForTimeout(1600);
  }, { width: 1440, height: 940 }],
  ['33-player-skin', '#/skins', async (p) => {
    await p.waitForSelector('.player-lookup input');
    await p.fill('.player-lookup input', 'Notch');
    await p.click('.player-lookup .btn');
    await p.waitForSelector('.player-result img', { timeout: 15000 });
    await p.locator('.player-result').scrollIntoViewIfNeeded();
    await p.waitForTimeout(1800);
  }, { width: 1360, height: 980 }],
  ['35-friends-chat', '#/friends?pk=' + 'b2'.repeat(32), async (p) => { await p.waitForSelector('.bubble'); await p.waitForTimeout(900); }],
  ['36-add-friend', '#/friends?add=1', async (p) => {
    await p.waitForSelector('.add-grid input');
    await p.fill('.add-grid input', 'SAT-R1LY-6KQ2');
    await p.click('.add-grid .btn:has-text("Find")');
    await p.waitForSelector('.found-card');
    await p.waitForTimeout(700);
  }],
  ['37-world-members', '#/friends?tab=worlds', async (p) => {
    await p.waitForSelector('.world-card');
    await p.evaluate(() => window.__saturnMock.hostW1());
    await p.waitForTimeout(500);
    await p.click('.world-card:has-text("Survival with Sam") .btn[title="Members and settings"]');
    await p.waitForSelector('.member-pick');
    await p.waitForTimeout(700);
  }],
  ['38-one-click-join', '#/friends?tab=worlds', async (p) => {
    await p.waitForSelector('.world-card');
    await p.evaluate(() => window.__saturnMock.hostW1());
    await p.click('.world-card:has-text("Skyblock") .btn:has-text("Join")');
    await p.waitForSelector('.join-ready-row', { timeout: 8000 });
    await p.waitForTimeout(900);
  }],
  ['39-invite-notification', '#/home', async (p) => {
    await p.waitForTimeout(600);
    await p.evaluate(() => window.__saturnMock.invite());
    await p.waitForSelector('.toast', { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(700);
  }],
  ['54-built-in-mods', '#/settings?section=companion', async (p) => { await p.waitForSelector('.segmented'); await p.waitForTimeout(800); }, { width: 1360, height: 1500 }],
  ['55-instance-built-in-mods', '#/instance?id=fabric-26-3', async (p) => { await p.getByRole('button', { name: 'Built-in mods' }).click(); await p.waitForTimeout(1000); }, { width: 1360, height: 1100 }],
  ['56-new-instance-snapshot', '#/settings?section=general', async (p) => {
    await p.getByRole('switch', { name: 'Show snapshots' }).click();
    await p.getByRole('switch', { name: 'Old versions' }).click();
    await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = '#/library'; });
    await p.waitForSelector('.new-card'); await p.click('.new-card'); await p.waitForTimeout(900);
    await p.selectOption('.sheet select >> nth=0', '26.4-snapshot-8');
    await p.waitForTimeout(900);
  }],
  ['60-games-tab', '#/games', async (p) => { await p.waitForSelector('.game-tile'); await p.waitForTimeout(3500); }],
  ['61-games-filter', '#/games', async (p) => { await p.waitForSelector('.filter-chip'); await p.click('.hidden-games button'); await p.evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; })); await p.waitForTimeout(3500); }, { width: 1360, height: 1180 }],
  ['62-mac-sidebar-expanded', '?platform=mac#/home', async (p) => { await p.waitForTimeout(600); await macLights(p); }],
  ['63-mac-sidebar-collapsed', '?platform=mac#/home', async (p) => { await p.click('.sidebar-toggle'); await p.waitForTimeout(1000); await macLights(p); }],
  ['64-mac-sidebar-hidden', '?platform=mac#/settings?section=appearance', async (p) => {
    await p.getByRole('tab', { name: 'Nothing' }).click();
    await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = '#/home'; });
    await p.waitForSelector('.hero');
    await p.click('.sidebar-toggle'); await p.waitForTimeout(1000); await macLights(p);
  }],
  ['40-friends-settings', '#/settings?section=friends', async (p) => { await p.waitForSelector('.relay-status'); await p.waitForTimeout(600); }, { width: 1360, height: 1000 }],
];

const only = process.env.SHOTS ? new RegExp(process.env.SHOTS) : null;
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [name, hash, prep, view] of shots) {
    if (only && !only.test(name)) continue;
    const page = await browser.newPage({ viewport: view || defaultView, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:4173/${hash}`);
    await page.waitForSelector('.sidebar');
    await page.waitForTimeout(900);
    if (prep) await prep(page).catch((e) => console.log("PREP FAILED", name, e.message.split("\n")[0]));
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log('saved', path.join(out, `${name}.png`));
    await page.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { server.kill(); }
}
