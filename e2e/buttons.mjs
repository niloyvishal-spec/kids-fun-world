/**
 * Button & navigation interaction test.
 *
 * Drives the production build with REAL mouse clicks in the 1280x720 design
 * space and asserts that every button actually changes state - i.e. that the
 * app is not just rendering, it is navigable.
 *
 * Covers: home shortcuts, every game card, the pause overlay (resume /
 * restart / settings / home), the result screen, settings toggles and the
 * achievements pager.
 *
 * Usage: node e2e/buttons.mjs   (requires: npm run build first)
 */
import { createServer } from 'node:http';
import { readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};

const results = [];
const errors = [];

function check(name, passed, detail = '') {
  results.push({ name, passed: !!passed, detail });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? `  --  ${detail}` : ''}`);
}

async function findBrowser() {
  for (const c of [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)) {
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
      let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (p === '/') p = '/index.html';
      const file = path.join(DIST, p);
      if (!file.startsWith(DIST)) return void res.writeHead(403).end();
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      // No favicon asset - answer with a 1x1 png so the browser stays quiet
      // and the "no JS errors" checks aren't polluted by a 404.
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      ));
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const executablePath = await findBrowser();
  console.log(`browser: ${executablePath}`);
  try {
    await stat(DIST);
  } catch {
    console.error('dist/ not found - run "npm run build" first.');
    process.exit(1);
  }

  const { server, port } = await serveDist();
  const base = `http://127.0.0.1:${port}/?test=1`;

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--mute-audio', '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,860'],
    defaultViewport: { width: 1280, height: 860 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|Deprecation|swiftshader|WebGL warning|CONTEXT_LOST/i.test(t)) return;
    errors.push(`console: ${t}`);
  });

  const errMark = () => errors.length;
  const newErrors = (m) => errors.slice(m);

  /**
   * Realistic tap in design space.
   *
   * `page.mouse.click()` with its default 0ms delay emits move/down/up
   * back-to-back, so Phaser's InputPlugin can see the whole sequence in a
   * single update frame and the game-object `pointerup` never matches
   * `currentlyOver` - the tap is silently swallowed (observed as an
   * intermittent ~1-in-3 miss on the home cards). Humans always leave a
   * gap between press and release, so mirror that here: move, let the
   * pointer settle, press, then release.
   */
  async function clickDesign(x, y) {
    const pt = await page.evaluate((dx, dy) => {
      const c = document.querySelector('#game-root canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.left + (dx / 1280) * r.width, y: r.top + (dy / 720) * r.height };
    }, x, y);
    if (!pt) throw new Error('canvas not found');
    await page.mouse.move(pt.x, pt.y);
    await sleep(50);
    await page.mouse.down();
    await sleep(50);
    await page.mouse.up();
    await sleep(30);
    return pt;
  }

  const scene = () => page.evaluate(() => window.__kids.current());
  const goHome = async () => {
    await page.evaluate(() => window.__kids.home());
    // `home()` only QUEUES the scene switch: tearing down the previous 3D
    // scene can block the main thread for ~600ms, so HomeScene does not
    // exist yet when home() returns. Sleeping a fixed 500ms and then
    // clicking was landing in that window - the dashboard cards had not
    // been created, so the tap hit bare canvas and was swallowed. Wait for
    // the scene, then give the card entrance animation time to finish.
    await page.waitForFunction(
      () => window.__kids?.current?.() === 'HomeScene',
      { timeout: 20000 },
    );
    await sleep(1000); // last card settles at 40 + 11*40 + 360 = 840ms
  };
  /** Text of every Text object in the topmost active scene (incl. nested). */
  const sceneTexts = () =>
    page.evaluate(() => {
      const g = window.__game;
      const list = g.scene.getScenes(true);
      const s = list[list.length - 1];
      if (!s) return [];
      const out = [];
      const walk = (o) => {
        if (o.type === 'Text') out.push(o.text);
        if (Array.isArray(o.list)) o.list.forEach(walk);
      };
      s.children.list.forEach(walk);
      return out;
    });

  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kids?.ready === true, { timeout: 25000 });
    await page.waitForFunction(() => window.__kids?.current?.() === 'HomeScene', { timeout: 20000 });
    await sleep(2600); // let the card entrance animation settle

    /* ---------------- home shortcuts ---------------- */
    let mark = errMark();
    await clickDesign(340, 655); // SETTINGS
    await sleep(600);
    check('home SETTINGS opens SettingsScene', (await scene()) === 'SettingsScene', await scene());

    // toggle SOUND twice - the button destroys + rebuilds itself on click
    await clickDesign(640, 255);
    await sleep(450);
    let texts = await sceneTexts();
    const afterFirst = texts.find((t) => t.startsWith('SOUND')) ?? '?';
    await clickDesign(640, 255);
    await sleep(450);
    texts = await sceneTexts();
    const afterSecond = texts.find((t) => t.startsWith('SOUND')) ?? '?';
    check('settings SOUND button toggles and rebinds', afterFirst !== afterSecond && afterFirst !== '?' && afterSecond !== '?',
      `${afterFirst} -> ${afterSecond}`);

    await clickDesign(640, 580); // CLOSE
    await sleep(500);
    check('settings CLOSE returns to HomeScene', (await scene()) === 'HomeScene', await scene());
    check('home shortcuts: no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));

    mark = errMark();
    await clickDesign(640, 655); // ACHIEVEMENTS
    await sleep(700);
    check('home ACHIEVEMENTS opens scene', (await scene()) === 'AchievementsScene', await scene());
    texts = await sceneTexts();
    check('achievements renders a page counter', texts.some((t) => /^\d+ \/ \d+$/.test(t.trim())),
      JSON.stringify(texts.filter((t) => /\d+ \/ \d+/.test(t))));

    // pager: 17 achievements => 2 pages
    await clickDesign(980, 672); // next
    await sleep(600);
    texts = await sceneTexts();
    const page2 = texts.find((t) => /^\d+ \/ \d+$/.test(t.trim()));
    check('achievements NEXT advances the page', page2 === '2 / 2', String(page2));
    await clickDesign(980, 672); // next again (must not overflow)
    await sleep(500);
    texts = await sceneTexts();
    check('achievements NEXT is disabled on the last page',
      (texts.find((t) => /^\d+ \/ \d+$/.test(t.trim())) ?? '') === '2 / 2',
      String(texts.find((t) => /^\d+ \/ \d+$/.test(t.trim()))));
    await clickDesign(300, 672); // prev
    await sleep(600);
    texts = await sceneTexts();
    check('achievements PREV returns to page 1',
      (texts.find((t) => /^\d+ \/ \d+$/.test(t.trim())) ?? '') === '1 / 2',
      String(texts.find((t) => /^\d+ \/ \d+$/.test(t.trim()))));

    await clickDesign(640, 672); // BACK
    await sleep(600);
    check('achievements BACK returns to HomeScene', (await scene()) === 'HomeScene', await scene());
    check('achievements pager: no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));

    mark = errMark();
    await clickDesign(940, 655); // REWARDS
    await sleep(600);
    check('home REWARDS opens scene', (await scene()) === 'RewardsScene', await scene());
    await clickDesign(640, 655); // BACK
    await sleep(600);
    check('rewards BACK returns to HomeScene', (await scene()) === 'HomeScene', await scene());
    check('rewards: no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));

    mark = errMark();
    await clickDesign(1190, 58); // currency pill
    await sleep(600);
    check('currency pill opens RewardsScene', (await scene()) === 'RewardsScene', await scene());
    await goHome();

    /* ---------------- every game card ---------------- */
    const xs = [190, 370, 550, 730, 910, 1090];
    const ys = [300, 470];
    const GAME_IDS = ['MatchPuzzle', 'BubblePop', 'BunnyRun', 'MiniRacing', 'PetCare', 'LittleChef',
      'ColorStudio', 'MemoryMatch', 'MathAdventure', 'BuildMyWorld', 'Ludo', 'SkyFlyer'];
    for (let i = 0; i < GAME_IDS.length; i++) {
      mark = errMark();
      await goHome();
      const t0 = Date.now();
      await clickDesign(xs[i % 6], ys[Math.floor(i / 6)]);
      const shot = path.join(ROOT, 'artifacts', `fail-${Date.now()}-card${i}.png`);
      await page.screenshot({ path: shot });
      const pre = await page.evaluate((dx, dy) => {
        const g = window.__game;
        const home = g.scene.getScene('HomeScene');
        const hits = [];
        const walk = (n) => {
          for (const c of n.list ?? []) {
            if (c.input && c.getBounds) {
              const b = c.getBounds();
              if (dx >= b.x && dx <= b.x + b.width && dy >= b.y && dy <= b.y + b.height) {
                hits.push({
                  type: c.type, cls: c.constructor.name, depth: c.depth,
                  a: +c.alpha.toFixed(2), s: +c.scaleX.toFixed(2),
                  en: c.input.enabled, act: c.active, vis: c.visible,
                  b: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)],
                });
              }
            }
            walk(c);
          }
        };
        if (home?.children) walk(home.children);
        return {
          stack: g.scene.getScenes(true).map((s) => s.scene.key).join('>') || 'none',
          homeKids: home?.children?.list?.length ?? -1,
          homeActive: !!home?.sys?.isActive(),
          topOnly: home?.input?.topOnly,
          hits: hits.sort((a, b) => b.depth - a.depth).slice(0, 8),
        };
      }, xs[i % 6], ys[Math.floor(i / 6)]);
      // Poll instead of a single waitForFunction so a failure can be
      // explained: record the scene stack and whether HomeScene's camera
      // is mid-fade (transitionTo starts a fade before switching scene).
      const hist = [];
      let s = await scene();
      for (let k = 0; k < 100 && s !== GAME_IDS[i]; k++) {
        await sleep(100);
        const st = await page.evaluate(() => {
          const g = window.__game;
          const home = g.scene.getScene('HomeScene');
          return {
            k: g.scene.getScenes(true).map((x) => x.scene.key).join('>') || 'none',
            fade: home?.cameras?.main?.fadeIn ? null : (home?.cameras?.main?._fadeAlpha ?? 'n/a'),
          };
        });
        hist.push(`${Math.round((Date.now() - t0) / 100) / 10}s:${st.k}/f${st.fade}`);
        s = await scene();
      }
      const ms = Date.now() - t0;
      check(`card ${i} (${GAME_IDS[i]}) starts the game`, s === GAME_IDS[i],
        `scene=${s} in ${ms}ms`);
      if (s !== GAME_IDS[i]) {
        console.log(`        PRE card${i} ${JSON.stringify(pre)}`);
        console.log(`        HIST card${i} ${hist.slice(0, 30).join(' | ')}`);
        console.log(`        SHOT ${shot}`);
      } else {
        await unlink(shot).catch(() => {});
      }
      check(`card ${i}: no JS errors`, newErrors(mark).length === 0, newErrors(mark).join(' | '));
    }

    /* ---------------- pause overlay ---------------- */
    mark = errMark();
    await goHome();
    await page.evaluate(() => window.__kids.start('MemoryMatch'));
    await sleep(900);
    await clickDesign(116, 44); // pause
    await sleep(500);
    check('pause button opens PauseScene', (await scene()) === 'PauseScene', await scene());

    await clickDesign(640, 480); // SETTINGS from pause
    await sleep(600);
    check('pause SETTINGS opens SettingsScene', (await scene()) === 'SettingsScene', await scene());
    await clickDesign(640, 580); // CLOSE
    await sleep(600);
    check('CLOSE returns to the pause overlay', (await scene()) === 'PauseScene', await scene());

    await clickDesign(640, 390); // RESTART
    await sleep(800);
    check('pause RESTART relaunches the game', (await scene()) === 'MemoryMatch', await scene());

    await clickDesign(116, 44);
    await sleep(500);
    await clickDesign(640, 300); // RESUME
    await sleep(600);
    check('pause RESUME returns to the game', (await scene()) === 'MemoryMatch', await scene());

    await clickDesign(116, 44);
    await sleep(500);
    await clickDesign(640, 570); // HOME
    await sleep(700);
    check('pause HOME returns to HomeScene', (await scene()) === 'HomeScene', await scene());
    check('pause overlay: no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));

    /* ---------------- result screen ---------------- */
    mark = errMark();
    await page.evaluate(() => window.__kids.start('MatchPuzzle'));
    await sleep(800);
    await page.evaluate(() => {
      const g = window.__game;
      const scenes = g.scene.getScenes(true);
      scenes[scenes.length - 1].finish({ score: 250, stars: 3, win: true, subtitle: 'test' });
    });
    await sleep(1100);
    check('finish() lands on ResultScene', (await scene()) === 'ResultScene', await scene());

    await clickDesign(360, 620); // PLAY AGAIN
    await sleep(900);
    check('result PLAY AGAIN restarts the same game', (await scene()) === 'MatchPuzzle', await scene());

    await page.evaluate(() => {
      const g = window.__game;
      const scenes = g.scene.getScenes(true);
      scenes[scenes.length - 1].finish({ score: 10, stars: 0, win: false, subtitle: 'test' });
    });
    await sleep(1000);
    await clickDesign(640, 620); // HOME
    await sleep(800);
    check('result HOME returns to HomeScene', (await scene()) === 'HomeScene', await scene());

    await page.evaluate(() => window.__kids.start('BubblePop'));
    await sleep(800);
    await page.evaluate(() => {
      const g = window.__game;
      const scenes = g.scene.getScenes(true);
      scenes[scenes.length - 1].finish({ score: 5, stars: 1, win: false, subtitle: 'test' });
    });
    await sleep(1000);
    await clickDesign(920, 620); // MORE GAMES
    await sleep(800);
    check('result MORE GAMES returns to HomeScene', (await scene()) === 'HomeScene', await scene());
    check('result screen: no JS errors', newErrors(mark).length === 0, newErrors(mark).join(' | '));
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n================ BUTTON TEST SUMMARY ================');
  console.log(`total: ${results.length}   passed: ${results.length - failed.length}   failed: ${failed.length}`);
  if (failed.length) {
    console.log('failures:');
    for (const f of failed) console.log(`  - ${f.name} :: ${f.detail}`);
  }
  if (errors.length) {
    console.log(`errors captured: ${errors.length}`);
    for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('button test crashed:', e);
  process.exit(1);
});
