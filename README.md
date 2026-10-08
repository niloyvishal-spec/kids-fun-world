# 🌈 Kids Fun World — International Kids Game Collection

A colorful browser game hub for ages 6–12, built with **Vite + TypeScript + Phaser 3 + Three.js**.
Twelve mini-games in one app, zero external art/audio — every sprite, model, environment and
sound is generated procedurally at runtime, so the repo stays tiny and dependency-free.

## Games (12)

| # | Game | How it plays |
|---|------|--------------|
| 1 | 🧩 **Match Puzzle** | Swap tiles to match 3+ |
| 2 | 🫧 **Bubble Pop** | Tap rising bubbles, build combos |
| 3 | 🐰 **Bunny Run** | Endless runner — jump & dodge |
| 4 | 🚗 **Mini Racing** | 3D race — steer past traffic |
| 5 | 🐶 **Pet Care** | Feed, wash & play with your pet |
| 6 | 🍕 **Little Chef** | Grab ingredients, cook dishes |
| 7 | 🎨 **Color Studio** | Paint by numbers, finish pictures |
| 8 | 🃏 **Memory Match** | Flip & find card pairs |
| 9 | 🔢 **Math Adventure** | Solve sums to move ahead |
| 10 | 🏗️ **Build My World** | Place & create a little world |
| 11 | 🎲 **Ludo** | Classic board race (vs AI) |
| 12 | 🐤 **Sky Flyer** | Flap through candy gates — 3D flying game |

Plus a meta layer: **coins, stars, 17 achievements, 15 daily challenges**, a rewards shop and
settings (sound, music, vibration), all persisted to `localStorage`.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck (`tsc --noEmit`) + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript strict check only |
| `npm run test:e2e` | Headless smoke suite — boots every game, checks HUD, screenshots (`e2e/smoke.mjs`) |
| `npm run test:buttons` | Headless button/interaction suite for all 12 game cards (`e2e/buttons.mjs`) |
| `node --test server` | Unit tests for the Ludo dev command parser |

E2E tests use `puppeteer-core` with your local Chrome
(`C:\Program Files\Google\Chrome\Application\chrome.exe`) and write screenshots to
`e2e/artifacts/` (gitignored).

## Project layout

```
src/
  main.ts              Phaser game bootstrap + scene registration
  config.ts            Design constants & palette
  core/                SceneBase, UI widgets, audio, save, progress, registry
  scenes/              Home, Result, Rewards, Achievements, Settings, Boot
  games/               The 12 game scenes (+ ludo/ rules & AI, pictures.ts)
  3d/                  Shared Three.js layer: stage engine, lighting, materials,
                       characters, vehicles, environments, particles, physics
e2e/                   Puppeteer smoke & button suites
server/                Optional Telegram controller for Ludo dev mode
```

## Environment

Copy `.env.example` to `.env` if you want the optional Ludo/Telegram dev controller.
`.env` is **gitignored** — never commit real tokens.

## Notes

- All content is procedural: no image/audio/model files are loaded.
- The 3D games (Mini Racing, Build My World, Ludo, Sky Flyer) render through a shared
  Three.js stage layered under the Phaser UI.
- Saves live in `localStorage` under a single key — clearing site data resets progress.
