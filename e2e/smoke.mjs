/**
 * Headless smoke test for the International Kids Game Collection.
 *
 * Serves the production build from ./dist, drives it with puppeteer-core and
 * the locally installed Chrome/Edge, then checks that:
 *   - the app boots to the home scene with no JS errors
 *   - the canvas is actually painted (pixel sampling, not a blank frame)
 *   - all 12 games start, render and accept input without errors
 *   - Sky Flyer reacts to a real tap (the bird flaps)
 *   - the pause overlay can be opened and resumed
 *   - finishing a game lands on the result screen and awards stars
 *   - progress survives a page reload (localStorage persistence)
 *   - settings / achievements / rewards scenes open cleanly
 *   - the layout stays inside the viewport at phone and desktop sizes
 *
 * Usage: npm run test:e2e
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, '..', 'dist');
const ARTIFACTS = path.join(ROOT, 'artifacts');

const GAME_IDS = [
  'MatchPuzzle', 'BubblePop', 'BunnyRun', 'MiniRacing', 'PetCare',
  'LittleChef', 'ColorStudio', 'MemoryMatch', 'MathAdventure', 'BuildMyWorld',
  'Ludo', 'SkyFlyer',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const results = [];
let consoleErrors = [];

function check(name, passed, detail = '') {
  results.push({ name, passed: !!passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? `  --  ${detail}` : ''}`);
  return passed;
}

async function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      await stat(c);
      return c;
    } catch {
      /* keep looking */
    }
  }
  throw new Error('No Chrome/Edge executable found. Set CHROME_PATH.');
}

function serveDist() {
  const server = createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath === '/') urlPath = '/index.html';
      const file = path.join(DIST, urlPath);
      if (!file.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      if (decodeURIComponent(new URL(req.url, 'http://localhost').pathname) === '/favicon.ico') {
        // no favicon asset - answer with a 1x1 png so the browser stays quiet
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'
        ));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IGNORED_CONSOLE = [
  /favicon/i,
  /Deprecation/i,
  /swiftshader/i,
  /software WebGL/i,
  /Automatic fallback/i,
  /GPU stall/i,
  /WebGL warning/i,
  /CONTEXT_LOST/i,
  /passive/i,
];

function relevantError(text) {
  return !IGNORED_CONSOLE.some((re) => re.test(text));
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const executablePath = await findBrowser();
  console.log(`browser: ${executablePath}`);

  try {
    await stat(DIST);
  } catch {
    console.error('dist/ not found - run "npm run build" first.');
    process.exit(1);
  }
  await mkdir(ARTIFACTS, { recursive: true });

  const { server, port } = await serveDist();
  const base = `http://127.0.0.1:${port}/?test=1`;

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--mute-audio',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--window-size=1280,860',
    ],
    defaultViewport: { width: 1280, height: 860 },
  });

  const page = await browser.newPage();
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location();
    const url = loc && loc.url ? loc.url : '';
    if (/favicon/i.test(url)) return;
    const text = `${msg.text()}${url ? ` @ ${url}` : ''}`;
    if (relevantError(text)) consoleErrors.push(`console: ${text}`);
  });

  const errMark = () => consoleErrors.length;
  const newErrors = (mark) => consoleErrors.slice(mark);

  /** Click a point expressed in the 1280x720 design space. */
  async function clickDesign(x, y) {
    const pt = await page.evaluate((dx, dy) => {
      const c = document.querySelector('#game-root canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return {
        x: r.left + (dx / 1280) * r.width,
        y: r.top + (dy / 720) * r.height,
        w: r.width,
        h: r.height,
      };
    }, x, y);
    if (!pt) throw new Error('canvas not found for click');
    await page.mouse.click(pt.x, pt.y);
  }

  /** Painted-frame check: composite EVERY canvas and count distinct colors. */
  function canvasStats() {
    return page.evaluate(() => {
      const src = [...document.querySelectorAll('#game-root canvas')];
      if (!src.length) return { ok: false, reason: 'no canvas' };
      const W = 160;
      const H = 90;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      try {
        // The 3D stage canvas sits UNDER the transparent Phaser HUD canvas, so
        // sampling only the first canvas measures an almost-empty overlay.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        for (const el of src) ctx.drawImage(el, 0, 0, W, H);
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
      const d = ctx.getImageData(0, 0, W, H).data;
      const seen = new Set();
      let sum = 0;
      let opaque = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (d[i + 3] > 8) opaque++;
        sum += (r + g + b) / 3;
        seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      }
      return { ok: true, colors: seen.size, mean: sum / (W * H), opaquePct: (opaque / (W * H)) * 100 };
    });
  }

  async function currentScene() {
    return page.evaluate(() => window.__kids?.current?.() ?? '');
  }

  async function waitForKids() {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.__kids && window.__kids.ready === true,
      { timeout: 25000 }
    );
    // the boot scene animates for ~1.5s before handing over to the home screen
    await page.waitForFunction(
      () => window.__kids && window.__kids.current() === 'HomeScene',
      { timeout: 20000 }
    );
    await sleep(400);
  }

  try {
    /* ---------------- boot ---------------- */
    let mark = errMark();
    await waitForKids();
    check('boots to ready state', true);
    check('starts on HomeScene', (await currentScene()) === 'HomeScene', await currentScene());
    check('no JS errors during boot', newErrors(mark).length === 0, newErrors(mark).join(' | '));

    let stats = await canvasStats();
    check(
      'home screen is painted (not blank)',
      stats.ok && stats.colors >= 12 && stats.mean > 15,
      `colors=${stats.colors} mean=${stats.mean?.toFixed(1)} opaque=${stats.opaquePct?.toFixed(0)}%`
    );
    // let the staggered card entrance animation finish before capturing
    await sleep(2500);
    await page.screenshot({ path: path.join(ARTIFACTS, '01-home.png') });

    /* ---------------- every game ---------------- */
    for (const id of GAME_IDS) {
      mark = errMark();
      await page.evaluate((g) => window.__kids.start(g), id);
      await sleep(900);
      const scene = await currentScene();
      stats = await canvasStats();
      const painted = stats.ok && stats.colors >= 10 && stats.mean > 15;

      // poke input in a few places; games must tolerate stray taps
      for (const [x, y] of [[640, 400], [320, 300], [960, 480], [640, 200]]) {
        await clickDesign(x, y);
        await sleep(140);
      }
      await sleep(300);

      const errs = newErrors(mark);
      check(`${id}: scene active`, scene === id, scene);
      check(`${id}: rendered`, painted, `colors=${stats.colors} mean=${stats.mean?.toFixed(1)}`);
      check(`${id}: input + no JS errors`, errs.length === 0, errs.join(' | '));
      await page.screenshot({ path: path.join(ARTIFACTS, `game-${id}.png`) });
    }

    /* ---------------- Sky Flyer: real tap must flap ---------------- */
    mark = errMark();
    await page.evaluate(() => window.__kids.start('SkyFlyer'));
    // The 3D stage clock advances with clamped deltas, so under software
    // WebGL the intro takes far longer than 850ms of wall time - poll for
    // readiness instead of sleeping a fixed amount.
    await page.waitForFunction(() => window.__game3d?.state?.().ready === true, { timeout: 30000 });
    const readFly = () => page.evaluate(() => window.__game3d?.state?.() ?? null);
    const flyBefore = await readFly();
    check('SkyFlyer: exposes a ready 3D state',
      !!(flyBefore && flyBefore.ready === true), JSON.stringify(flyBefore));
    for (let i = 0; i < 3; i++) {
      await clickDesign(640, 400);
      await sleep(200);
    }
    const flyAfter = await readFly();
    check('SkyFlyer: tap makes the bird flap',
      !!(flyAfter && flyBefore && flyAfter.flaps > flyBefore.flaps),
      `flaps ${flyBefore?.flaps} -> ${flyAfter?.flaps}, y ${flyBefore?.y} -> ${flyAfter?.y}`);
    check('SkyFlyer: renders gates', (flyAfter?.obstacles ?? 0) >= 1,
      `obstacles=${flyAfter?.obstacles}`);
    check('SkyFlyer: no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));
    await page.screenshot({ path: path.join(ARTIFACTS, 'game-SkyFlyer-flight.png') });

    /* ---------------- pause overlay ---------------- */
    mark = errMark();
    await page.evaluate(() => window.__kids.start('MemoryMatch'));
    await sleep(800);
    await clickDesign(116, 44); // HUD pause button
    await sleep(500);
    check('pause button opens PauseScene', (await currentScene()) === 'PauseScene', await currentScene());

    await clickDesign(640, 300); // RESUME
    await sleep(500);
    check('RESUME returns to the game', (await currentScene()) === 'MemoryMatch', await currentScene());

    await clickDesign(116, 44);
    await sleep(400);
    await clickDesign(640, 570); // HOME
    await sleep(500);
    check('pause HOME returns to HomeScene', (await currentScene()) === 'HomeScene', await currentScene());
    check('pause flow has no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));
    await page.screenshot({ path: path.join(ARTIFACTS, '02-after-pause.png') });

    /* ---------------- result + rewards ---------------- */
    mark = errMark();
    const starsBefore = await page.evaluate(() => window.__kids.stars());
    await page.evaluate(() => window.__kids.start('MatchPuzzle'));
    await sleep(700);
    const finishReport = await page.evaluate(() => {
      const g = window.__game;
      const scenes = g.scene.getScenes(true);
      const s = scenes[scenes.length - 1];
      try {
        s.finish({
          score: 120,
          stars: 3,
          win: true,
          lines: [
            { icon: '⭐', label: 'Score', value: '120' },
            { icon: '🏆', label: 'Best', value: '120' },
          ],
        });
        return 'ok';
      } catch (e) {
        return String(e);
      }
    });
    await sleep(900);
    const starsAfter = await page.evaluate(() => window.__kids.stars());
    const saved = await page.evaluate(() => window.__kids.save());
    check('finishing a game calls ResultScene', finishReport === 'ok', finishReport);
    check('lands on ResultScene', (await currentScene()) === 'ResultScene', await currentScene());
    check('stars awarded on win', starsAfter > starsBefore, `${starsBefore} -> ${starsAfter}`);
    check('save data has achievements + daily fields',
      !!(saved && saved.achievements && saved.daily && saved.daily.id),
      `keys=${saved ? Object.keys(saved).join(',') : 'none'}`);
    check('result flow has no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));
    await page.screenshot({ path: path.join(ARTIFACTS, '03-result.png') });

    /* ---------------- persistence ---------------- */
    mark = errMark();
    await waitForKids();
    const starsReload = await page.evaluate(() => window.__kids.stars());
    const saveRaw = await page.evaluate(() =>
      window.localStorage.getItem('kids_fun_world_save_v2')
    );
    check('progress persists across reload', starsReload === starsAfter && !!saveRaw,
      `before=${starsAfter} after=${starsReload}`);
    check('reload has no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));

    /* ---------------- auxiliary scenes ---------------- */
    for (const key of ['SettingsScene', 'AchievementsScene', 'RewardsScene']) {
      mark = errMark();
      await page.evaluate((k) => {
        const g = window.__game;
        g.scene.getScenes(true).forEach((s) => g.scene.stop(s.scene.key));
        g.scene.start(k);
      }, key);
      await sleep(700);
      const scene = await currentScene();
      const s2 = await canvasStats();
      check(`${key}: opens and renders`,
        scene === key && s2.colors >= 8,
        `scene=${scene} colors=${s2.colors}`);
      check(`${key}: no JS errors`, newErrors(mark).length === 0, newErrors(mark).join(' | '));
    }
    await page.screenshot({ path: path.join(ARTIFACTS, '04-rewards.png') });

    /* ---------------- responsive layout ---------------- */
    for (const vp of [{ width: 390, height: 780, label: 'phone' }, { width: 1920, height: 1080, label: 'desktop' }]) {
      mark = errMark();
      await page.setViewport({ width: vp.width, height: vp.height });
      await sleep(600);
      const box = await page.evaluate(() => {
        const c = document.querySelector('#game-root canvas');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left, top: r.top, vw: innerWidth, vh: innerHeight };
      });
      const fits =
        box &&
        box.w > 200 && box.h > 100 &&
        box.left >= -2 && box.top >= -2 &&
        box.left + box.w <= box.vw + 2 &&
        box.top + box.h <= box.vh + 2;
      check(`layout fits ${vp.label} viewport`, fits, JSON.stringify(box));
      // The game must be optically centred, not just inside the viewport:
      // Phaser CENTER_BOTH margins stacked on top of #game-root's flex
      // centring and shoved the canvas down on every non-16:9 window.
      const dx = box ? Math.abs(box.left - (box.vw - box.w) / 2) : 9999;
      const dy = box ? Math.abs(box.top - (box.vh - box.h) / 2) : 9999;
      check(`layout centred on ${vp.label}`, dx <= 2 && dy <= 2, `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`);
      check(`${vp.label}: no JS errors`, newErrors(mark).length === 0, newErrors(mark).join(' | '));
      await page.screenshot({ path: path.join(ARTIFACTS, `05-${vp.label}.png`) });
    }
    await page.setViewport({ width: 1280, height: 860 });
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n================ SMOKE TEST SUMMARY ================');
  console.log(`total: ${results.length}   passed: ${results.length - failed.length}   failed: ${failed.length}`);
  if (failed.length) {
    console.log('failures:');
    for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
  }
  if (consoleErrors.length) {
    console.log(`console/page errors captured: ${consoleErrors.length}`);
    for (const e of consoleErrors.slice(0, 20)) console.log(`  ${e}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
