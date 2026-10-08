/**
 * Touch-input check: does a real touchscreen tap open a game from Home?
 * Usage: node e2e/touch-probe.mjs [url]
 */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] ?? 'http://127.0.0.1:5173/';
const EXEC =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--window-size=390,780', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 390, height: 780, hasTouch: true, isMobile: true },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/.test(m.location()?.url ?? '')) errors.push(`console: ${m.text()}`);
});

async function rect() {
  return page.evaluate(() => {
    const c = document.querySelector('#game-root canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });
}

async function tapDesign(dx, dy, label) {
  const r = await rect();
  const x = r.left + (dx / 1280) * r.w;
  const y = r.top + (dy / 720) * r.h;
  await page.touchscreen.touchStart(x, y);
  await sleep(60);
  await page.touchscreen.touchEnd();
  console.log(`  tap ${label} screen(${Math.round(x)},${Math.round(y)})`);
}

console.log('url:', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__kids && window.__kids.ready === true, { timeout: 25000 });
await page.waitForFunction(() => window.__kids.current() === 'HomeScene', { timeout: 20000 });
await sleep(3000);
console.log('scene:', await page.evaluate(() => window.__kids.current()));
console.log('canvas rect:', JSON.stringify(await rect()));

console.log('\n== TOUCH tap on card 1 (design 200,300) ==');
await tapDesign(200, 300, 'card1');
await sleep(1500);
const s1 = await page.evaluate(() => window.__kids.current());
console.log('scene after tap:', s1, s1 === 'MatchPuzzle' ? 'TOUCH OK' : 'TOUCH FAILED');

if (s1 === 'MatchPuzzle') {
  // tap a couple of tiles
  console.log('\n== TOUCH tap tiles ==');
  for (const [x, y] of [[575, 261], [637, 261]]) await tapDesign(x, y, 'tile');
  await sleep(500);
  const state = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('MatchPuzzle');
    return { selected: !!sc.selected, moves: sc.moves, busy: sc.busy };
  });
  console.log('match puzzle state:', JSON.stringify(state));
}

console.log('\nerrors:', errors.length ? errors : 'none');
await browser.close();
