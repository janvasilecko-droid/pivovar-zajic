// Unit testy zpracování historie (history sync) — bez socketu a sítě.
// Spuštění: npm test   (v whatsapp-bridge/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRecent, HistoryCollector, normTs } from '../lib/history.js';

test('pickRecent: vrací nejnovějších cap zpráv chronologicky vzestupně', () => {
  const msgs = [
    { key: { id: 'a' }, messageTimestamp: 100 },
    { key: { id: 'b' }, messageTimestamp: 300 },
    { key: { id: 'c' }, messageTimestamp: 200 },
    { key: { id: 'd' }, messageTimestamp: 150 },
  ];
  assert.deepEqual(
    pickRecent(msgs, 2).map((m) => m.key.id),
    ['c', 'b']
  );
});

test('pickRecent: cap=0 → prázdno, cap > délky → vše', () => {
  const msgs = [{ key: { id: 'a' }, messageTimestamp: 100 }];
  assert.deepEqual(pickRecent(msgs, 0), []);
  assert.deepEqual(pickRecent(msgs, 5).map((m) => m.key.id), ['a']);
});

test('pickRecent: ignoruje zprávy bez key.id a bez timestampu nekoliduje', () => {
  const msgs = [
    { key: { id: 'a' }, messageTimestamp: 100 },
    { messageTimestamp: 50 }, // bez key.id → vynechá se
    { key: {} }, // bez key.id i timestampu → vynechá se
  ];
  assert.deepEqual(
    pickRecent(msgs, 5).map((m) => m.key && m.key.id),
    ['a']
  );
});

test('normTs: číslo (sekundy), řetězec i Long protobuf objekt', () => {
  const Long = { toNumber: () => 1750 };
  assert.equal(normTs(100), 100000);
  assert.equal(normTs('200'), 200000);
  assert.equal(normTs(Long), 1750000);
  assert.equal(normTs(undefined) > 0, true);
});

test('HistoryCollector: po zklidnění vybere nejnovější zprávy a zavolá onMessage sekvenčně', async () => {
  const handled = [];
  const c = new HistoryCollector({
    cap: 2,
    quietMs: 5,
    maxWaitMs: 500,
    flushAtLeastMultiplier: 10, // ať se nespustí předčasně podle objemu
    delayMs: 0,
    onMessage: async (m) => {
      handled.push(m.key.id);
    },
  });
  c.add({ messages: [{ key: { id: 'old1' }, messageTimestamp: 100 }] });
  c.add({
    messages: [
      { key: { id: 'new1' }, messageTimestamp: 300 },
      { key: { id: 'new2' }, messageTimestamp: 400 },
    ],
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(handled, ['new1', 'new2']);
});

test('HistoryCollector: velký objem spustí flush hned (bez isLatest) a vybere nejnovější cap', async () => {
  const handled = [];
  const c = new HistoryCollector({
    cap: 2,
    quietMs: 60000,
    maxWaitMs: 60000,
    flushAtLeastMultiplier: 2, // flush při bufferu >= 2*cap = 4
    delayMs: 0,
    onMessage: async (m) => {
      handled.push(m.key.id);
    },
  });
  const batch = Array.from({ length: 10 }, (_, i) => ({
    key: { id: 'm' + i },
    messageTimestamp: 100 + i,
  }));
  c.add({ messages: batch });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(handled, ['m8', 'm9']); // 10 >= 4 → okamžitě, nejnovější 2
});

test('HistoryCollector: zprávy, které dorazí během zpracování, se doberou v dalším cyklu', async () => {
  const handled = [];
  let gate = false;
  const c = new HistoryCollector({
    cap: 10,
    quietMs: 5,
    maxWaitMs: 500,
    flushAtLeastMultiplier: 100,
    delayMs: 0,
    onMessage: async (m) => {
      handled.push(m.key.id);
      // při první zprávě dorazí další dávka uprostřed zpracování
      if (!gate) {
        gate = true;
        c.add({ messages: [{ key: { id: 'late' }, messageTimestamp: 900 }] });
      }
    },
  });
  c.add({ messages: [{ key: { id: 'first' }, messageTimestamp: 100 }] });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(handled.sort(), ['first', 'late']);
});
