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

const shots = [
  ['01-home', '#/home'],
  ['02-discover', '#/discover', async (p) => { await p.waitForSelector('.result-card img', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1500); }],
  ['03-instance', '#/instance?id=fabric-26-3'],
  ['04-grok-upgrade', '#/studio?job=job-1'],
  ['05-settings-companion', '#/settings?section=companion'],
  ['06-new-instance', '#/library', async (p) => { await p.click('.new-card'); await p.waitForTimeout(900); }],
  ['07-settings-keys', '#/settings?section=keys'],
];

const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--force-color-profile=srgb'] });
try {
  for (const [name, hash, prep] of shots) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
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
