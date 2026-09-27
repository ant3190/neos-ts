import assert from "node:assert/strict";
import { test } from "node:test";

import HandResultPacket from "../src/api/ocgcore/ocgAdapter/ctos/ctosHandResult";
import UpdateDeckPacket from "../src/api/ocgcore/ocgAdapter/ctos/ctosUpdateDeck";
import { ygopro } from "../src/api/ocgcore/idl/ocgcore";

test("the hand choices produce the YGOPro server's scissors, rock, paper bytes", () => {
  for (const [hand, expected] of [
    [ygopro.HandType.SCISSORS, 1],
    [ygopro.HandType.ROCK, 2],
    [ygopro.HandType.PAPER, 3],
  ]) {
    const packet = new HandResultPacket(
      new ygopro.YgoCtosMsg({
        ctos_hand_result: new ygopro.CtosHandResult({ hand }),
      }),
    ).serialize();
    assert.deepEqual([...packet], [2, 0, 3, expected]);
  }
});

test("a changed deck has the right contents and an exact frame length", () => {
  const packet = new UpdateDeckPacket(
    new ygopro.YgoCtosMsg({
      ctos_update_deck: new ygopro.CtosUpdateDeck({
        main: [12345, 67890],
        extra: [98765],
        side: [43210],
      }),
    }),
  ).serialize();
  const view = new DataView(packet.buffer);
  assert.equal(view.getUint16(0, true), packet.length - 2);
  assert.equal(packet[2], 2);
  assert.equal(view.getUint32(3, true), 3);
  assert.equal(view.getUint32(7, true), 1);
  assert.deepEqual(
    [11, 15, 19, 23].map((offset) => view.getUint32(offset, true)),
    [12345, 67890, 98765, 43210],
  );
});
