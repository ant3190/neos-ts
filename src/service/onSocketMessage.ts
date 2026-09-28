/*
 * 长连接消息事件订阅处理逻辑
 *
 * */
import { ygopro } from "@/api";
import { adaptStoc } from "@/api/ocgcore/ocgAdapter/adapter";
import { YgoProPacket } from "@/api/ocgcore/ocgAdapter/packet";
import { Container } from "@/container";
import { replayStore } from "@/stores";
import { requestCardImage } from "@/ui/Shared/YgoCard/imageCache";

import handleGameMsg from "./duel/gameMsg";
import handleTimeLimit from "./duel/timeLimit";
import handleDeckCount from "./mora/deckCount";
import handleSelectHand from "./mora/selectHand";
import handleSelectTp from "./mora/selectTp";
import handleChat from "./room/chat";
import handleDuelEnd from "./room/duelEnd";
import handleDuelStart from "./room/duelStart";
import handleErrorMsg from "./room/errorMsg";
import handleHandResult from "./room/handResult";
import handleHsPlayerChange from "./room/hsPlayerChange";
import handleHsPlayerEnter from "./room/hsPlayerEnter";
import handleHsWatchChange from "./room/hsWatchChange";
import handleJoinGame from "./room/joinGame";
import handleTypeChange from "./room/typeChange";
import { handleChangeSide } from "./side/changeSide";
import { handleWaitingSide } from "./side/waitingSide";

/*
 * 先将从长连接中读取到的二进制数据通过Adapter转成protobuf结构体，
 * 然后再分发到各个处理函数中去处理。
 *
 * */

let animation: Promise<void> = Promise.resolve();

interface DecodedPacket {
  packet: YgoProPacket;
  pb: ygopro.YgoStocMsg;
}

function prepareImages(packets: DecodedPacket[]) {
  const codes = new Set<number>();
  for (const { pb } of packets) {
    if (pb.msg !== "stoc_game_msg") continue;
    const msg = pb.stoc_game_msg;
    switch (msg.gameMsg) {
      case "draw":
        msg.draw.cards.forEach((code) => codes.add(code));
        break;
      case "move":
        codes.add(msg.move.code);
        break;
      case "summoning":
        codes.add(msg.summoning.code);
        break;
      case "sp_summoning":
        codes.add(msg.sp_summoning.code);
        break;
      case "flip_summoning":
        codes.add(msg.flip_summoning.code);
        break;
      case "chaining":
        codes.add(msg.chaining.code);
        break;
      case "confirm_cards":
        msg.confirm_cards.cards.forEach((card) => codes.add(card.code));
        break;
      case "update_data":
        msg.update_data.actions.forEach((action) => codes.add(action.code));
        break;
      case "swap":
        codes.add(msg.swap.code1);
        codes.add(msg.swap.code2);
        break;
    }
  }
  // A game frame can contain many updates; avoid competing with current art.
  for (const code of [...codes].slice(0, 12)) requestCardImage(code);
}

export default async function handleSocketMessage(
  container: Container,
  e: MessageEvent,
) {
  const decoded = YgoProPacket.deserialize(e.data).map((packet) => ({
    packet,
    pb: adaptStoc(packet),
  }));
  if (!replayStore.isReplay) prepareImages(decoded);
  // 确保按序执行
  animation = animation.then(() => _handle(container, decoded));
  await animation;
}

// FIXME: 下面的所有`handler`中访问`Store`的时候都应该通过`Container`进行访问
async function _handle(container: Container, decoded: DecodedPacket[]) {
  for (const { packet, pb } of decoded) {
    const isReplayGameMsg = replayStore.isReplay && pb.msg === "stoc_game_msg";
    const replayGameMsg = isReplayGameMsg
      ? pb.stoc_game_msg.gameMsg
      : undefined;

    if (isReplayGameMsg) {
      await replayStore.waitForAdvance(replayGameMsg);
    }

    switch (pb.msg) {
      case "stoc_join_game": {
        handleJoinGame(container, pb);
        break;
      }
      case "stoc_chat": {
        handleChat(container, pb);
        break;
      }
      case "stoc_hs_player_change": {
        handleHsPlayerChange(container, pb);
        break;
      }
      case "stoc_hs_watch_change": {
        handleHsWatchChange(container, pb);
        break;
      }
      case "stoc_hs_player_enter": {
        handleHsPlayerEnter(container, pb);
        break;
      }
      case "stoc_type_change": {
        handleTypeChange(container, pb);
        break;
      }
      case "stoc_select_hand": {
        handleSelectHand(container, pb);
        break;
      }
      case "stoc_hand_result": {
        handleHandResult(container, pb);
        break;
      }
      case "stoc_select_tp": {
        handleSelectTp(container, pb);
        break;
      }
      case "stoc_deck_count": {
        handleDeckCount(container, pb);
        break;
      }
      case "stoc_duel_start": {
        handleDuelStart(container, pb);
        break;
      }
      case "stoc_duel_end": {
        handleDuelEnd(container, pb);
        break;
      }
      case "stoc_game_msg": {
        if (!replayStore.isReplay) {
          // 如果不是回放模式，则记录回放数据
          replayStore.record(packet);
        }
        await handleGameMsg(container, pb);

        break;
      }
      case "stoc_time_limit": {
        handleTimeLimit(container, pb.stoc_time_limit);
        break;
      }
      case "stoc_error_msg": {
        await handleErrorMsg(container, pb.stoc_error_msg);
        break;
      }
      case "stoc_change_side": {
        handleChangeSide(container, pb.stoc_change_side);
        break;
      }
      case "stoc_waiting_side": {
        handleWaitingSide(container, pb.stoc_waiting_side);
        break;
      }
      default: {
        console.log(packet);

        break;
      }
    }

    if (isReplayGameMsg) {
      replayStore.markAdvanced(replayGameMsg);
    }
  }
}
