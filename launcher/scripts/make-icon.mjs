// Renders the app icon and the alternate dock icons with headless Chrome:
//   build/icon.svg        -> build/icon.png (1024) + build/icon.icns (16–1024, PNG payloads)
//   build/icon.svg        -> resources/dock/saturn.png (512)
//   build/dock/<name>.svg -> resources/dock/<name>.png (512)  (Settings → Appearance → App icon)
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { buildIcns, ICNS_TYPES } from './icns.mjs';
import { iconSvg, logoSvg, THEMES } from './planet-art.mjs';

const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome', '/usr/bin/google-chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) { console.error('make-icon: set CHROME_PATH to a Chrome/Chromium binary'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

async function render(svgFile, size) {
  const svg = readFileSync(svgFile, 'utf8').replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// Regenerate the SVG sources from the one planet design so every icon stays cube-free.
mkdirSync(`${root}build/dock`, { recursive: true });
writeFileSync(`${root}build/icon.svg`, iconSvg('saturn'));
for (const n of Object.keys(THEMES).filter((k) => k !== 'saturn')) writeFileSync(`${root}build/dock/${n}.svg`, iconSvg(n));
writeFileSync(`${root}companion-mod/art/logo-mark.svg`, logoSvg().replace('width="256" height="256"', 'width="1024" height="1024"'));
const main = `${root}build/icon.svg`;
writeFileSync(`${root}build/icon.png`, await render(main, 1024));
const sizes = {};
for (const s of [...new Set(ICNS_TYPES.map(([, px]) => px))]) sizes[s] = await render(main, s);
writeFileSync(`${root}build/icon.icns`, buildIcns(sizes));
mkdirSync(`${root}resources/dock`, { recursive: true });
writeFileSync(`${root}resources/dock/saturn.png`, await render(main, 512));
for (const f of readdirSync(`${root}build/dock`).filter((x) => x.endsWith('.svg'))) {
  writeFileSync(`${root}resources/dock/${f.replace(/\.svg$/, '.png')}`, await render(`${root}build/dock/${f}`, 512));
}
// In-game logo texture (transparent planet + ring) -> companion-mod/saturn_logo.png.b64
{
  const size = 256;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${logoSvg()}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(`${root}companion-mod/saturn_logo.png.b64`, png.toString('base64'));
}
await browser.close();
console.log('build/icon.png, build/icon.icns, resources/dock/*.png');
