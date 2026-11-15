'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const MAC = require('../core/mac-chrome.json');

const r = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const css = r('renderer/src/styles.css');
const radius = Number(css.match(/--radius-xl:\s*(\d+)px/)[1]);
const groupWidth = 3 * MAC.buttonSize + 2 * MAC.buttonGap;

test('main.js puts the Mac traffic lights where mac-chrome.json says (Mac only)', () => {
  const main = r('electron/main.js');
  assert.match(main, /require\('\.\.\/core\/mac-chrome\.json'\)/);
  assert.match(main, /trafficLightPosition: mac \? MAC_CHROME\.trafficLights : undefined/);
  assert.match(main, /titleBarStyle: mac \? 'hiddenInset' : 'default'/);
});

test('traffic lights sit inside the sidebar glass with padding, clear of the rounded corner', () => {
  const { x, y } = MAC.trafficLights;
  const sbLeft = MAC.appPadding;
  const sbTop = MAC.appPadding;
  assert.ok(x - sbLeft >= 14, 'left padding inside the glass');
  assert.ok(y - sbTop >= 14, 'top padding inside the glass');
  // Every point of the button group is inside the rounded corner's arc.
  const cx = sbLeft + radius;
  const cy = sbTop + radius;
  const closeCenter = [x + MAC.buttonSize / 2, y + MAC.buttonSize / 2];
  if (closeCenter[0] < cx && closeCenter[1] < cy) assert.ok(Math.hypot(cx - closeCenter[0], cy - closeCenter[1]) + MAC.buttonSize / 2 <= radius - 4);
  // Vertically centered in the drag strip.
  assert.ok(Math.abs((y + MAC.buttonSize / 2) - (sbTop + MAC.dragHeight / 2)) <= 2);
});

test('collapsed Mac sidebar is wide enough for the controls; logo starts below the drag strip', () => {
  assert.ok(MAC.collapsedWidth >= 78);
  const right = MAC.appPadding + MAC.collapsedWidth - (MAC.trafficLights.x + groupWidth);
  const left = MAC.trafficLights.x - MAC.appPadding;
  assert.ok(right >= 12, `right padding ${right}`);
  assert.equal(left, right, 'centered in the collapsed sidebar');
  assert.ok(css.includes(`.app.mac.sb-icons { grid-template-columns: ${MAC.collapsedWidth}px 1fr; }`));
  assert.ok(css.includes(`.app.mac .traffic { height: ${MAC.dragHeight}px;`));
  assert.ok(css.includes('.app.mac .sidebar { padding-top: 0; }'));
  assert.ok(css.includes(`.app.mac.sb-hidden .toolbar { padding-left: ${MAC.hiddenToolbarInset}px; }`));
  assert.ok(MAC.hiddenToolbarInset - 8 - (MAC.trafficLights.x + groupWidth) >= 16, 'collapse button clear of the controls when the sidebar is hidden');
  assert.ok(!/\.app\.mac\.sb-hidden \.toolbar \{ padding-left: 92px/.test(css), 'old cramped inset removed');
});

test('Linux keeps its own chrome: no Mac rules leak, custom traffic dots still hidden', () => {
  assert.match(css, /\.linux \.traffic \{ display: none; \}/);
  assert.ok(!/\.linux[^{]*\{[^}]*trafficLight/.test(css));
  assert.match(r('renderer/src/App.jsx'), /previewPlatform/);
});

test('README explains the macOS quarantine (xattr) fix', () => {
  const readme = r('README.md');
  assert.match(readme, /xattr -dr com\.apple\.quarantine "\/Applications\/Saturn Client\.app"/);
  assert.match(readme, /0\.1\.10/);
});
