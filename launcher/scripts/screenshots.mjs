// Headless screenshots of the renderer (browser mock mode) for design review.
// Usage: npm run build:renderer && node scripts/screenshots.mjs [outDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'screenshots');
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME_PATH || '/opt/google/chrome/chrome';
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
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
];

const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--force-color-profile=srgb'] });
try {
  for (const [name, hash, prep, view] of shots) {
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
  server.kill();
}
