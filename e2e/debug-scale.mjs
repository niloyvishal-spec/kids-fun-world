import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
async function findBrowser() {
  for (const c of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) { try { await stat(c); return c; } catch {} }
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

await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__kids?.ready === true, { timeout: 25000 });
await page.waitForFunction(() => window.__kids?.current?.() === 'HomeScene', { timeout: 20000 });
await sleep(2500);

for (let round = 0; round < 3; round++) {
  // enter a game, then come home (this is the state the test sees)
  await page.evaluate(() => window.__kids.start('MatchPuzzle'));
  await sleep(900);
  await page.evaluate(() => window.__kids.home());
  await sleep(120);

  const samples = await page.evaluate(async () => {
    const g = window.__game;
    const out = [];
    for (let k = 0; k < 16; k++) {
      const s = g.scene.getScene('HomeScene');
      if (!s || !s.scene.isActive()) { out.push('gone'); }
      else {
        const cards = s.children.list.filter((o) => o.type === 'Container' && o.input);
        out.push(cards.map((c) => `${c.scale.toFixed(2)}`).join(','));
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    return out;
  });
  console.log(`round ${round} card scales over time:`);
  samples.forEach((s, i) => console.log(`   t=${(i * 80).toString().padStart(4)}ms  ${s}`));
  // also report tween counts
  const tw = await page.evaluate(() => {
    const s = window.__game.scene.getScene('HomeScene');
    if (!s) return 'no scene';
    const cards = s.children.list.filter((o) => o.type === 'Container' && o.input);
    return cards.map((c) => `sc=${c.scale.toFixed(2)} tweens=${s.tweens.getTweens(c).length}`);
  });
  console.log('   final:', tw.join(' | '));
}

await browser.close();
server.close();
