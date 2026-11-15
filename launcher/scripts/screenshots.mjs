// Headless screenshots of the renderer (browser mock mode) for design review.
// Usage: npm run build:renderer && node scripts/screenshots.mjs [outDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

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
  ['21-host-world', '#/host', async (p) => { await p.waitForSelector('.host-hero'); await p.click('.host-hero .play-btn'); await p.waitForSelector('.host-address', { timeout: 15000 }); await p.waitForTimeout(800); }],
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
    if (prep) await prep(page);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log('saved', path.join(out, `${name}.png`));
    await page.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { server.kill(); }
}
