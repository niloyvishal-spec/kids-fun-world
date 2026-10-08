import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

async function findBrowser() {
  for (const c of ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']) {
    try { await stat(c); return c; } catch {}
  }
  throw new Error('no browser');
}

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const body = await readFile(path.join(DIST, p));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: await findBrowser(),
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,860'],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(`http://127.0.0.1:${port}/?test=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__kids?.ready === true, { timeout: 25000 });
await page.waitForFunction(() => window.__kids?.current?.() === 'HomeScene', { timeout: 20000 });

for (const vp of [{ w: 1280, h: 860, l: 'desktop860' }, { w: 390, h: 780, l: 'phone' }, { w: 1920, h: 1080, l: 'desktop' }, { w: 1280, h: 720, l: 'exact720' }]) {
  await page.setViewport({ width: vp.w, height: vp.h });
  await new Promise((r) => setTimeout(r, 500));
  const info = await page.evaluate(() => {
    const root = document.querySelector('#game-root');
    const canvases = [...root.querySelectorAll('canvas')].map((c, i) => {
      const r = c.getBoundingClientRect();
      return { i, w: Math.round(c.width), h: Math.round(c.height), css: `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.left)},${Math.round(r.top)}`, z: c.style.zIndex };
    }) ;
    return { vw: innerWidth, vh: innerHeight, root: JSON.stringify(root.getBoundingClientRect()), canvases };
  });
  console.log(`--- ${vp.l} ${vp.w}x${vp.h} ---`);
  console.log('  root:', info.root);
  for (const c of info.canvases) console.log(`  canvas#${c.i} buffer=${c.w}x${c.h} css=${c.css} z=${c.z}`);
}

await browser.close();
server.close();
