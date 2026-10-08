import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  handleUpdate,
  parseAllowedIds,
  parseLudoTest,
  replyFor,
} from './ludoTestCommand.mjs';

const ALLOWED = parseAllowedIds('111,222 333');

const msg = (text, id = 111) => ({ message: { text, from: { id }, chat: { id } } });

/* ---------------- parseLudoTest ---------------- */

test('accepts /ludo_test 1..6', () => {
  for (const v of [1, 2, 3, 4, 5, 6]) {
    assert.deepEqual(parseLudoTest(`/ludo_test ${v}`), { ok: true, value: v });
  }
});

test('accepts /ludo_test@BotName 3', () => {
  assert.deepEqual(parseLudoTest('/ludo_test@MyCoolBot 3'), { ok: true, value: 3 });
});

test('rejects out-of-range and non-numeric values', () => {
  assert.equal(parseLudoTest('/ludo_test 0').ok, false);
  assert.equal(parseLudoTest('/ludo_test 7').ok, false);
  assert.equal(parseLudoTest('/ludo_test -3').ok, false);
  assert.equal(parseLudoTest('/ludo_test 2.5').ok, false);
  assert.equal(parseLudoTest('/ludo_test abc').ok, false);
});

test('rejects wrong arity and other commands', () => {
  assert.equal(parseLudoTest('/ludo_test').ok, false);
  assert.equal(parseLudoTest('/ludo_test 3 4').ok, false);
  assert.equal(parseLudoTest('/help').reason, 'not a ludo_test command');
  assert.equal(parseLudoTest(undefined).ok, false);
});

test('error reasons are safe (no secrets, just usage)', () => {
  const reasons = ['/ludo_test 9', '/ludo_test', '/ludo_test x'].map(
    (t) => parseLudoTest(t).reason
  );
  for (const r of reasons) {
    assert.equal(typeof r, 'string');
    assert.ok(!/token|secret|env/i.test(r));
  }
});

/* ---------------- parseAllowedIds ---------------- */

test('parseAllowedIds handles commas, spaces and junk', () => {
  const ids = parseAllowedIds('111,222 333,,abc');
  assert.deepEqual([...ids].sort((a, b) => a - b), [111, 222, 333]);
  assert.equal(parseAllowedIds('').size, 0);
  assert.equal(parseAllowedIds(undefined).size, 0);
});

/* ---------------- handleUpdate ---------------- */

test('only allow-listed users may set a dice value', () => {
  assert.deepEqual(handleUpdate(msg('/ludo_test 6', 111), { allowedIds: ALLOWED, devMode: true }), {
    status: 'ok',
    value: 6,
  });
  const denied = handleUpdate(msg('/ludo_test 6', 999), {
    allowedIds: ALLOWED,
    devMode: true,
  });
  assert.equal(denied.status, 'forbidden');
});

test('dev-mode gate refuses everything when disabled', () => {
  const r = handleUpdate(msg('/ludo_test 6', 111), { allowedIds: ALLOWED, devMode: false });
  assert.equal(r.status, 'forbidden');
  assert.match(r.reason, /disabled/);
});

test('empty allow-list blocks everyone (fail closed)', () => {
  const r = handleUpdate(msg('/ludo_test 6', 111), { allowedIds: new Set(), devMode: true });
  assert.equal(r.status, 'forbidden');
});

test('non-command messages are ignored, bad commands answered', () => {
  assert.equal(handleUpdate(msg('hello', 111), { allowedIds: ALLOWED, devMode: true }).status, 'ignore');
  const bad = handleUpdate(msg('/ludo_test 9', 111), { allowedIds: ALLOWED, devMode: true });
  assert.equal(bad.status, 'bad');
  assert.equal(typeof bad.reason, 'string');
});

test('updates without a message are ignored', () => {
  assert.equal(handleUpdate({}, { allowedIds: ALLOWED, devMode: true }).status, 'ignore');
  assert.equal(handleUpdate(null, { allowedIds: ALLOWED, devMode: true }).status, 'ignore');
});

/* ---------------- replyFor ---------------- */

test('replies never leak secrets', () => {
  const replies = [
    replyFor({ status: 'ok', value: 4 }),
    replyFor({ status: 'bad', reason: 'usage: /ludo_test <1-6>' }),
    replyFor({ status: 'forbidden' }),
    replyFor({ status: 'status', next: 5 }),
    replyFor({ status: 'status', next: null }),
  ];
  for (const r of replies) {
    assert.equal(typeof r, 'string');
    assert.ok(!/bot\d+:|TELEGRAM|TOKEN|SECRET/i.test(r), `reply leaked something: ${r}`);
  }
  assert.equal(replyFor({ status: 'ignore' }), null);
});

test('forbidden replies do not reveal the allow-list', () => {
  const r = replyFor({ status: 'forbidden' });
  assert.ok(!/111|222|333/.test(r));
});
