import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

async function findBrowser() {
  for (const c of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) {
    try { await stat(c); return c; } catch {}
  }
  throw new Error('no browser');
}
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const b = await readFile(path.join(DIST, p));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: await findBrowser(), headless: true,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,860'],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickDesign(x, y) {
  const pt = await page.evaluate((dx, dy) => {
    const c = document.querySelectorAll('#game-root canvas')[0];
    const r = c.getBoundingClientRect();
    return { x: r.left + (dx / 1280) * r.width, y: r.top + (dy / 720) * r.height };
  }, x, y);
  await page.mouse.click(pt.x, pt.y);
}
const scene = () => page.evaluate(() => window.__kids.current());

await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__kids?.ready === true, { timeout: 25000 });
await page.waitForFunction(() => window.__kids?.current?.() === 'HomeScene', { timeout: 20000 });

const xs = [190, 370, 550, 730, 910, 1090];
const ys = [300, 470];
const IDS = ['MatchPuzzle', 'BubblePop', 'BunnyRun', 'MiniRacing', 'PetCare', 'LittleChef',
  'ColorStudio', 'MemoryMatch', 'MathAdventure', 'BuildMyWorld', 'Ludo'];

for (let i = 0; i < IDS.length; i++) {
  await page.evaluate(() => window.__kids.home());
  await sleep(500);

  // hook the HomeScene input + the target card, then click
  const info = await page.evaluate((X, Y) => {
    const g = window.__game;
    const s = g.scene.getScene('HomeScene');
    window.__log = [];
    if (!s) return { err: 'no home scene' };
    const rec = (e, extra) => window.__log.push(e + (extra ? ':' + extra : ''));
    s.input.on('gameobjectover', (p, o) => rec('over', `${o.type}@${Math.round(o.x)},${Math.round(o.y)} sc=${(o.scale ?? 1).toFixed(2)}`));
    s.input.on('gameobjectout', (p, o) => rec('out', `${o.type}@${Math.round(o.x)},${Math.round(o.y)}`));
    s.input.on('gameobjectdown', (p, o) => rec('down', `${o.type}@${Math.round(o.x)},${Math.round(o.y)}`));
    s.input.on('gameobjectup', (p, o) => rec('up', `${o.type}@${Math.round(o.x)},${Math.round(o.y)}`));
    s.input.on('gameobjectupoutside', (p, o) => rec('upOutside', `${o.type}@${Math.round(o.x)},${Math.round(o.y)}`));
    s.input.on('pointerupoutside', (p) => rec('pointerUpOutside'));
    // find card nearest the click
    let best = null;
    for (const o of s.children.list) {
      if (typeof o.x !== 'number') continue;
      const d = Math.hypot(o.x - X, o.y - Y);
      if (d < 160 && o.input) {
        if (!best || d < best.d) best = { d, t: o.type, x: o.x, y: o.y, sc: o.scale, a: o.alpha, hit: !!o.input && !o.input.enabled ? 'disabled' : 'ok' };
      }
    }
    return { best, count: s.children.list.length };
  }, xs[i % 6], ys[Math.floor(i / 6)]);

  await clickDesign(xs[i % 6], ys[Math.floor(i / 6)]);
  await sleep(1000);
  const log = await page.evaluate(() => window.__log || []);
  const to = await scene();
  console.log(`card ${i} ${IDS[i]} @${xs[i % 6]},${ys[Math.floor(i / 6)]} -> ${to}  ${to === IDS[i] ? 'OK' : 'FAIL'}`);
  console.log('    near:', JSON.stringify(info.best));
  console.log('    events:', log.join(' > '));
}

await browser.close();
server.close();
