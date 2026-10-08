/**
 * Pure, unit-testable logic for the Ludo developer test command.
 *
 * The Telegram bot service (telegram-ludo-dev.mjs) imports this module and
 * feeds it raw update objects. Nothing here ever logs or echoes secrets -
 * replies only ever contain the validated command outcome.
 *
 * Expected command:  /ludo_test 1..6
 * (a trailing @BotName on the command is accepted, per Telegram rules.)
 */

const MIN_VALUE = 1;
const MAX_VALUE = 6;

/**
 * Parse the raw text of a message into a ludo_test command.
 * Returns { ok: true, value } or { ok: false, reason }.
 * reason is safe to show to the developer.
 */
export function parseLudoTest(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'empty' };
  const parts = text.trim().split(/\s+/);
  const cmd = (parts[0] ?? '').replace(/@[A-Za-z0-9_]+$/, '').toLowerCase();
  if (cmd !== '/ludo_test') return { ok: false, reason: 'not a ludo_test command' };
  if (parts.length !== 2) {
    return { ok: false, reason: 'usage: /ludo_test <1-6>' };
  }
  if (!/^[0-9]+$/.test(parts[1])) return { ok: false, reason: 'usage: /ludo_test <1-6>' };
  const value = Number(parts[1]);
  if (!Number.isInteger(value) || value < MIN_VALUE || value > MAX_VALUE) {
    return { ok: false, reason: `dice must be ${MIN_VALUE}-${MAX_VALUE}` };
  }
  return { ok: true, value };
}

/** Parse TELEGRAM_ALLOWED_USER_IDS ("123,456" or "123 456") into a Set. */
export function parseAllowedIds(raw) {
  const out = new Set();
  if (!raw) return out;
  for (const piece of String(raw).split(/[,\s]+/)) {
    if (/^\d+$/.test(piece)) out.add(Number(piece));
  }
  return out;
}

/**
 * Handle one Telegram update.
 * Returns one of:
 *   { status: 'ignore' }                     - not a message we care about
 *   { status: 'forbidden' }                  - sender not on the allow-list
 *   { status: 'bad', reason }                - malformed command
 *   { status: 'ok', value }                  - accepted, must be applied
 *   { status: 'status', next }               - /status query answered
 *
 * `devMode` is the caller's compiled-in gate (LUDO_DEV_MODE); when false the
 * service must refuse everything, which is asserted here so the invariant
 * lives in one place.
 */
export function handleUpdate(update, { allowedIds, devMode }) {
  if (!devMode) return { status: 'forbidden', reason: 'developer test mode is disabled' };

  const msg = update && (update.message || update.channel_post);
  if (!msg || typeof msg.text !== 'string') return { status: 'ignore' };
  const userId = msg.from ? msg.from.id : msg.chat ? msg.chat.id : null;

  const text = msg.text.trim();

  const isOurs = text === '/status' || text.startsWith('/status@') || parseLudoTest(text).ok ||
    (!parseLudoTest(text).ok && parseLudoTest(text).reason !== 'not a ludo_test command');
  if (!isOurs) return { status: 'ignore' };

  // Fail closed: an unknown/missing id or an empty allow-list denies.
  if (!(allowedIds instanceof Set) || !allowedIds.has(Number(userId))) {
    return { status: 'forbidden', reason: 'user not allowed' };
  }

  if (text === '/status' || text.startsWith('/status@')) return { status: 'status' };

  const parsed = parseLudoTest(text);
  if (!parsed.ok) return { status: 'bad', reason: parsed.reason };
  return { status: 'ok', value: parsed.value };
}

/** Build the reply text for a handled result (never contains secrets). */
export function replyFor(result) {
  switch (result.status) {
    case 'ok':
      return `🎲 Test dice ${result.value} queued for the next Ludo roll.`;
    case 'status':
      return result.next != null
        ? `🧪 Ludo dev mode on. Next test dice: ${result.next}`
        : `🧪 Ludo dev mode on. No test dice queued (next roll is random).`;
    case 'bad':
      return `⚠️ ${result.reason}`;
    case 'forbidden':
      return '⛔ You are not allowed to control this game.';
    default:
      return null;
  }
}
