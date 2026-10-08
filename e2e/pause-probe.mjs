/**
 * Visual proof: is the Pause overlay visible above a running game?
 * Usage: node e2e/pause-probe.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://127.0.0.1:5173/';
const EXEC =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: true,
  args: ['--no-sandbox', '--mute-audio', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(`${URL}?test=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__kids && window.__kids.ready, { timeout: 25000 });
await page.evaluate(() => window.__kids.start('MatchPuzzle'));
await sleep(1200);

const rect = await page.evaluate(() => {
  const r = document.querySelector('#game-root canvas').getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});
const click = async (dx, dy, tag) => {
  const x = rect.left + (dx / 1280) * rect.w;
  const y = rect.top + (dy / 720) * rect.h;
  await page.mouse.click(x, y);
  console.log('clicked', tag);
};

await click(116, 44, 'pause btn');
await sleep(600);

const info = await page.evaluate(() => {
  const active = window.__kids.current();
  const mgr = window.__game.scene;
  const keys = mgr.getScenes(true).map((s) => s.scene.key);
  const paused = mgr.getScene('MatchPuzzle').scene.isPaused();
  const pauseVis = mgr.getScene('PauseScene').scene.isActive();

  // sample rendered pixels at design (640,160)=white pause panel, (640,300)=green RESUME
  const r = window.__game.renderer;
  const cv = document.querySelector('#game-root canvas');
  const sample = (dx, dy) => {
    if (r.gl) {
      const bx = Math.round((dx / 1280) * cv.width);
      const by = Math.round((1 - dy / 720) * cv.height);
      const buf = new Uint8Array(4);
      r.gl.readPixels(bx, by, 1, 1, r.gl.RGBA, r.gl.UNSIGNED_BYTE, buf);
      return [buf[0], buf[1], buf[2], buf[3]].join(',');
    }
    if (r.ctx) {
      const d = r.ctx.getImageData(Math.round((dx / 1280) * cv.width), Math.round((dy / 720) * cv.height), 1, 1).data;
      return [d[0], d[1], d[2], d[3]].join(',');
    }
    return 'unknown';
  };
  const colorPanel = sample(640, 160);
  const colorResume = sample(640, 300);
  const sceneOrder = mgr.scenes.map((s) => s.scene.key);
  return { active, keys, paused, pauseVis, colorPanel, colorResume, sceneOrder, canvas: [cv.width, cv.height] };
});
console.log(JSON.stringify(info, null, 2));

const shot = 'e2e/artifacts/pause-visible-check.png';
await page.screenshot({ path: shot });
console.log('screenshot:', shot);
await browser.close();
