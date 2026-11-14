// Renders build/icon.svg to build/icon.png (1024x1024) with headless Chrome.
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome', '/usr/bin/google-chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) { console.error('make-icon: set CHROME_PATH to a Chrome/Chromium binary'); process.exit(1); }
const svg = readFileSync(new URL('../build/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.screenshot({ path: new URL('../build/icon.png', import.meta.url).pathname, omitBackground: true });
await browser.close();
console.log('build/icon.png');
