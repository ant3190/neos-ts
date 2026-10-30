import assert from "node:assert/strict";
import { test } from "node:test";
import { ygopro } from "../src/api/ocgcore/idl/ocgcore.ts";
import decode from "../src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/confirmCards.ts";

const cards = [
  { code: 46986414, controller: 1, location: 2, sequence: 4 },
  { code: 100000001, controller: 0, location: 0x40, sequence: 11 },
];
function payload(extended = false, records = cards) {
  const offset = extended ? 3 : 2,
    data = new Uint8Array(offset + records.length * 7),
    view = new DataView(data.buffer);
  data[0] = 1;
  if (extended) data[1] = 0;
  data[offset - 1] = records.length;
  records.forEach((c, i) => {
    const p = offset + i * 7;
    view.setUint32(p, c.code, true);
    data.set([c.controller, c.location, c.sequence], p + 4);
  });
  return data;
}

for (const extended of [false, true])
  test(`${
    extended ? "extended" : "legacy"
  } reveal header preserves all public codes and locations`, () => {
    const msg = decode(payload(extended));
    assert.equal(msg.player, 1);
    assert.equal(msg.cards.length, 2);
    assert.deepEqual(
      msg.cards.map((c) => c.code),
      cards.map((c) => c.code),
    );
    assert.equal(msg.cards[0].location, ygopro.CardZone.HAND);
    assert.equal(msg.cards[1].location, ygopro.CardZone.EXTRA);
    assert.equal(msg.cards[1].sequence, 11);
    assert.deepEqual(
      msg.cards.map((c) => c.controller),
      [1, 0],
    );
  });

test("top reveals retain native sequence gaps, including skipped face-up extra cards", () => {
  const records = [
    { ...cards[0], sequence: 10 },
    { ...cards[1], sequence: 8 },
  ];
  for (const zone of [ygopro.CardZone.DECK, ygopro.CardZone.EXTRA]) {
    const msg = decode(payload(false, records), zone);
    assert.deepEqual(
      msg.cards.map((c) => c.sequence),
      [10, 8],
    );
    assert.ok(msg.cards.every((c) => c.location === zone));
  }
});

test("a reveal packet can be read from an offset view", () => {
  const original = payload(true),
    buffer = new Uint8Array(original.length + 9);
  buffer.set(original, 5);
  assert.deepEqual(
    decode(buffer.subarray(5, 5 + original.length)).cards.map((c) => c.code),
    cards.map((c) => c.code),
  );
});

test("empty packets decode and truncated or inconsistent records are rejected", () => {
  assert.equal(decode(payload(false, [])).cards.length, 0);
  assert.equal(decode(payload(true, [])).cards.length, 0);
  for (const bad of [
    new Uint8Array(),
    Uint8Array.of(1),
    payload().subarray(0, 5),
    Uint8Array.of(0, 2, 0, 0),
  ])
    assert.throws(() => decode(bad), RangeError);
});
