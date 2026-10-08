#!/usr/bin/env node
/**
 * Telegram developer-control service for the Ludo test mode.
 *
 * Runs ONLY on the developer's own machine, next to `vite serve` started
 * with LUDO_DEV_MODE=true. It long-polls the Telegram Bot API for
 *
 *     /ludo_test 1..6
 *
 * from allow-listed user ids and forwards the value to the local dev
 * controller (POST http://127.0.0.1:5173/ludo-dev/set), where it is
 * consumed exactly once by the next Ludo dice roll.
 *
 * Safety rules enforced here:
 *   - refuses to start unless LUDO_DEV_MODE=true
 *   - refuses to start without TELEGRAM_BOT_TOKEN
 *   - only allow-listed TELEGRAM_ALLOWED_USER_IDS may issue commands
 *   - replies never contain the bot token or any environment values
 *   - the token is read from the environment / .env and never logged
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleUpdate, parseAllowedIds, replyFor } from './ludoTestCommand.mjs';

const DEV_ENDPOINT = process.env.LUDO_DEV_URL ?? 'http://127.0.0.1:5173/ludo-dev/set';
const STATE_ENDPOINT = process.env.LUDO_DEV_STATE_URL ?? 'http://127.0.0.1:5173/ludo-dev/state';
const RETRY_MS = 3000;

/** Minimal .env loader: fills only unset variables, never overrides. */
function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* .env is optional */
  }
}

loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));

/* ---------------- configuration gates ---------------- */
if (process.env.LUDO_DEV_MODE !== 'true') {
  console.error(
    '[ludo-dev] Refusing to start: LUDO_DEV_MODE is not "true".\n' +
      '           Start the dev server with LUDO_DEV_MODE=true first,\n' +
      '           then run this service with the same variable set.'
  );
  process.exit(1);
}
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('[ludo-dev] Refusing to start: TELEGRAM_BOT_TOKEN is not set.');
  process.exit(1);
}
const allowedIds = parseAllowedIds(process.env.TELEGRAM_ALLOWED_USER_IDS);
if (allowedIds.size === 0) {
  console.error(
    '[ludo-dev] Refusing to start: TELEGRAM_ALLOWED_USER_IDS is empty.\n' +
      '           Set it to your numeric Telegram user id(s), comma separated.'
  );
  process.exit(1);
}

const api = (method, payload) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) throw new Error(`telegram ${method} failed (${res.status})`);
    return body;
  });

const send = async (chatId, text) => {
  try {
    await api('sendMessage', { chat_id: chatId, text });
  } catch {
    /* a failed reply must not kill the poll loop */
  }
};

const applyTestDice = async (value) => {
  const res = await fetch(DEV_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error('dev controller rejected the value');
  return true;
};

const currentState = async () => {
  try {
    const res = await fetch(STATE_ENDPOINT);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.next === 'number' ? data.next : null;
  } catch {
    return null;
  }
};

console.log('[ludo-dev] Telegram Ludo test controller running.');
console.log(`[ludo-dev] allow-listed users: ${allowedIds.size}`);

let offset = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loop = async () => {
  for (;;) {
    let updates = [];
    try {
      const body = await api('getUpdates', {
        offset,
        timeout: 20,
        allowed_updates: ['message'],
      });
      updates = body.result ?? [];
    } catch (err) {
      console.error(`[ludo-dev] poll error: ${err.message}`);
      await sleep(RETRY_MS);
      continue;
    }

    for (const upd of updates) {
      offset = (upd.update_id ?? offset) + 1;
      const chatId = upd.message?.chat?.id ?? upd.channel_post?.chat?.id;
      if (!chatId) continue;

      const result = handleUpdate(upd, { allowedIds, devMode: true });
      if (result.status === 'ignore') continue;

      if (result.status === 'ok') {
        try {
          await applyTestDice(result.value);
          await send(chatId, replyFor(result));
        } catch {
          await send(
            chatId,
            '⚠️ Could not reach the local game dev server. Is `LUDO_DEV_MODE=true vite serve` running on 5173?'
          );
        }
      } else if (result.status === 'status') {
        const next = await currentState();
        await send(chatId, replyFor({ status: 'status', next }));
      } else {
        await send(chatId, replyFor(result));
      }
    }
  }
};

loop().catch((err) => {
  console.error(`[ludo-dev] fatal: ${err.message}`);
  process.exit(1);
});
