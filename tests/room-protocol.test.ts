import assert from "node:assert/strict";
import { test } from "node:test";

import { ygopro } from "../src/api/ocgcore/idl/ocgcore";
import HandResultPacket from "../src/api/ocgcore/ocgAdapter/ctos/ctosHandResult";
import UpdateDeckPacket from "../src/api/ocgcore/ocgAdapter/ctos/ctosUpdateDeck";
import { createSinglePlayerRoomPassword } from "../src/ui/Match/singlePlayer";

test("single-player room passwords fit JOIN_GAME and request no banlist with shuffle enabled", () => {
  const passwords = new Set<string>();
  for (let attempt = 0; attempt < 100; attempt++) {
    const password = createSinglePlayerRoomPassword();
    assert.ok(password.length < 20);
    const [rules, roomId] = password.split("#");
    // Match SRVPro's independent no-banlist and no-deck-check rule parsing.
    assert.match(rules, /(^|,)(NOLFLIST|NF)(,|$)/);
    assert.match(rules, /(^|,)(NOCHECK|NC)(,|$)/);
    assert.match(rules, /(^|,)(TIME|TM|TI)0(,|$)/);
    assert.doesNotMatch(rules, /(^|,)(NOSHUFFLE|NS|AI)(,|$)/);
    assert.equal(roomId.length, 9);
    passwords.add(password);
  }
  assert.equal(passwords.size, 100);
});

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
