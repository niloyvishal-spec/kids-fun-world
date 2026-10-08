/**
 * Probe v3: trace the exact event chain for a real click on a home card.
 * Usage: node e2e/probe.mjs [url]
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
  args: ['--no-sandbox', '--mute-audio', '--window-size=1280,860', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1280, height: 860 },
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

console.log(`url: ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__kids && window.__kids.ready === true, { timeout: 25000 });
await page.waitForFunction(() => window.__kids.current() === 'HomeScene', { timeout: 20000 });
await sleep(2600);

// ---- instrument the actual card object + scene input + camera ----
const instrument = await page.evaluate(() => {
  window.__trace = [];
  const g = window.__game;
  const sc = g.scene.getScene('HomeScene');
  const card = sc.children.list.find((o) => o.type === 'Container' && Math.round(o.x) === 200 && Math.round(o.y) === 300);
  if (!card) return { err: 'card not found' };
  ['pointerover', 'pointerout', 'pointerdown', 'pointerup', 'pointerupoutside'].forEach((ev) =>
    card.on(ev, () => window.__trace.push(`card:${ev}`))
  );
  ['pointerdown', 'pointerup'].forEach((ev) =>
    sc.input.on(ev, (p) => window.__trace.push(`scene:${ev}@${Math.round(p.x)},${Math.round(p.y)}`))
  );
  const origOnClick = card.o; // not accessible (private) - trace camera instead
  return {
    cardFound: true,
    cardScale: card.scaleX,
    interactive: card.input ? { hitArea: !!card.input.hitArea, enabled: card.input.enabled } : 'NOT INTERACTIVE',
    cameraKeys: Object.keys(sc.cameras.main).filter((k) => /fade|alpha/i.test(k)).slice(0, 10),
    childrenTypes: sc.children.list.slice(0, 12).map((o) => `${o.type}@${Math.round(o.x)},${Math.round(o.y)}d${o.depth}`),
  };
});
console.log('instrument:', JSON.stringify(instrument, null, 1));

// ---- real click ----
const r = await rect();
const x = r.left + (200 / 1280) * r.w;
const y = r.top + (300 / 720) * r.h;
console.log(`\nclick screen(${Math.round(x)},${Math.round(y)})`);
await page.mouse.move(x, y);
await sleep(80);
await page.mouse.down();
await sleep(90);
await page.mouse.up();

// ---- poll ----
for (let i = 0; i < 12; i++) {
  await sleep(150);
  const s = await page.evaluate(() => {
    const g = window.__game;
    const sc = g.scene.getScene('HomeScene');
    const fade = sc && sc.cameras && sc.cameras.main ? sc.cameras.main.fadeEffect : null;
    const card = sc && sc.children.list.find((o) => o.type === 'Container' && Math.round(o.x) === 200 && Math.round(o.y) === 300);
    return {
      trace: window.__trace.splice(0),
      scene: window.__kids.current(),
      fadeRunning: fade ? fade.isRunning : null,
      fadeAlpha: fade && typeof fade.opacity === 'number' ? +fade.opacity.toFixed(2) : (fade && typeof fade.alpha === 'number' ? +fade.alpha.toFixed(2) : null),
      cardScale: card ? +card.scaleX.toFixed(3) : 'gone',
    };
  });
  console.log(`t=${(i + 1) * 150}ms`, JSON.stringify(s));
  if (s.scene !== 'HomeScene') {
    console.log('NAVIGATED ->', s.scene);
    break;
  }
}

console.log('\nerrors:', errors.length ? errors : 'none');
await browser.close();
