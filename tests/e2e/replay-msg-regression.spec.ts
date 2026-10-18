import { expect, type Page, test } from "@playwright/test";
import { installOfflineDuelResources } from "./helpers/offlineDuel";

import {
  advanceReplayTo,
  buildReplayRecord,
  pauseReplay,
  ReplayAdvanceFlag,
  uploadReplay,
  writeReplayFixture,
} from "./helpers/replay";

const MSG_START = 4;
const MSG_WIN = 5;
const MSG_UPDATE_CARD = 7;
const MSG_MOVE = 50;
const MSG_SWAP = 55;

const LOCATION_NONE = 0x00;
const LOCATION_MZONE = 0x04;
const POSITION_FACEUP_ATTACK = 0x01;

const MYSTICAL_ELF = 15025844;
const DARK_MAGICIAN = 46986414;
const BLUE_EYES_WHITE_DRAGON = 89631139;

test("replay handles raw ocgcore move, update-card, and swap messages", async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120000);
  await installOfflineDuelResources(page);

  const replayPath = await writeReplayFixture(
    testInfo,
    "msg-regression.yrp3d",
    buildMsgRegressionReplay(),
  );

  await uploadReplay(page, replayPath);
  await pauseReplay(page);

  await advanceReplayTo(page, ReplayAdvanceFlag.MOVE);
  await expectDuelCard(page, {
    code: MYSTICAL_ELF,
    zone: "MZONE",
    sequence: 2,
  });

  await advanceReplayTo(page, ReplayAdvanceFlag.UPDATE_DATA);
  await expectDuelCard(page, {
    code: DARK_MAGICIAN,
    zone: "MZONE",
    sequence: 2,
  });

  await advanceReplayTo(page, ReplayAdvanceFlag.MOVE);
  await expectDuelCard(page, {
    code: BLUE_EYES_WHITE_DRAGON,
    zone: "MZONE",
    sequence: 4,
  });

  await advanceReplayTo(page, ReplayAdvanceFlag.SWAP);
  await expectDuelCard(page, {
    code: DARK_MAGICIAN,
    zone: "MZONE",
    sequence: 4,
  });
  await expectDuelCard(page, {
    code: BLUE_EYES_WHITE_DRAGON,
    zone: "MZONE",
    sequence: 2,
  });

  await advanceReplayTo(page, ReplayAdvanceFlag.MOVE);
  await expect(
    duelCard(page, {
      code: BLUE_EYES_WHITE_DRAGON,
      zone: "MZONE",
      sequence: 2,
    }),
  ).toHaveCount(0);
  await expectDuelCard(page, {
    code: DARK_MAGICIAN,
    zone: "MZONE",
    sequence: 4,
  });

  await advanceReplayTo(page, ReplayAdvanceFlag.WIN);
  await expect(page.getByText(/Win|Defeated/)).toBeVisible();
});

function buildMsgRegressionReplay() {
  return concatUint8Arrays([
    buildReplayRecord(MSG_START, buildStartData()),
    buildReplayRecord(
      MSG_MOVE,
      buildMoveData({
        code: MYSTICAL_ELF,
        from: cardLocation(0, LOCATION_NONE, 0, 0),
        to: cardLocation(0, LOCATION_MZONE, 2, POSITION_FACEUP_ATTACK),
        reason: 0,
      }),
    ),
    buildReplayRecord(
      MSG_UPDATE_CARD,
      buildUpdateCardCodeData({
        player: 0,
        location: LOCATION_MZONE,
        sequence: 2,
        code: DARK_MAGICIAN,
      }),
    ),
    buildReplayRecord(
      MSG_MOVE,
      buildMoveData({
        code: BLUE_EYES_WHITE_DRAGON,
        from: cardLocation(0, LOCATION_NONE, 0, 0),
        to: cardLocation(0, LOCATION_MZONE, 4, POSITION_FACEUP_ATTACK),
        reason: 0,
      }),
    ),
    buildReplayRecord(
      MSG_SWAP,
      buildSwapData({
        code1: DARK_MAGICIAN,
        location1: cardLocation(0, LOCATION_MZONE, 2, POSITION_FACEUP_ATTACK),
        code2: BLUE_EYES_WHITE_DRAGON,
        location2: cardLocation(0, LOCATION_MZONE, 4, POSITION_FACEUP_ATTACK),
      }),
    ),
    buildReplayRecord(
      MSG_MOVE,
      buildMoveData({
        code: BLUE_EYES_WHITE_DRAGON,
        from: cardLocation(0, LOCATION_MZONE, 2, POSITION_FACEUP_ATTACK),
        to: cardLocation(0, LOCATION_NONE, 0, 0),
        reason: 0,
      }),
    ),
    buildReplayRecord(MSG_WIN, new Uint8Array([0, 0])),
  ]);
}

function buildStartData() {
  const data = new Uint8Array(17);
  const view = new DataView(data.buffer);

  view.setUint8(0, 0);
  view.setInt32(1, 8000, true);
  view.setInt32(5, 8000, true);
  view.setInt16(9, 0, true);
  view.setInt16(11, 0, true);
  view.setInt16(13, 0, true);
  view.setInt16(15, 0, true);

  return data;
}

function buildMoveData(options: {
  code: number;
  from: Uint8Array;
  to: Uint8Array;
  reason: number;
}) {
  const data = new Uint8Array(16);
  const view = new DataView(data.buffer);

  view.setUint32(0, options.code, true);
  data.set(options.from, 4);
  data.set(options.to, 8);
  view.setUint32(12, options.reason, true);

  return data;
}

function buildSwapData(options: {
  code1: number;
  location1: Uint8Array;
  code2: number;
  location2: Uint8Array;
}) {
  const data = new Uint8Array(16);
  const view = new DataView(data.buffer);

  view.setUint32(0, options.code1, true);
  data.set(options.location1, 4);
  view.setUint32(8, options.code2, true);
  data.set(options.location2, 12);

  return data;
}

function buildUpdateCardCodeData(options: {
  player: number;
  location: number;
  sequence: number;
  code: number;
}) {
  const data = new Uint8Array(15);
  const view = new DataView(data.buffer);

  view.setUint8(0, options.player);
  view.setUint8(1, options.location);
  view.setUint8(2, options.sequence);
  view.setUint32(3, 12, true);
  view.setUint32(7, 0x01, true);
  view.setUint32(11, options.code, true);

  return data;
}

function cardLocation(
  controller: number,
  location: number,
  sequence: number,
  position: number,
) {
  return new Uint8Array([controller, location, sequence, position]);
}

function expectDuelCard(
  page: Page,
  filters: {
    code: number;
    zone: string;
    sequence: number;
  },
) {
  return expect(duelCard(page, filters)).toBeVisible({ timeout: 30000 });
}

function duelCard(
  page: Page,
  filters: {
    code: number;
    zone: string;
    sequence: number;
  },
) {
  return page.locator(
    [
      '[data-testid="duel-card"]',
      `[data-card-code="${filters.code}"]`,
      `[data-card-zone="${filters.zone}"]`,
      `[data-card-sequence="${filters.sequence}"]`,
    ].join(""),
  );
}

function concatUint8Arrays(arrays: Uint8Array[]) {
  const data = new Uint8Array(
    arrays.reduce((total, array) => total + array.byteLength, 0),
  );
  let offset = 0;

  for (const array of arrays) {
    data.set(array, offset);
    offset += array.byteLength;
  }

  return data;
}
