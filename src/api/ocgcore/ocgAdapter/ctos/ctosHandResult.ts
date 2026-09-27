import { ygopro } from "../../idl/ocgcore";
import { YgoProPacket } from "../packet";
import { CTOS_HAND_RESULT } from "../protoDecl";

/*
 * CTOS HandResult
 *
 * @param res: unsigned char - 玩家的猜拳选择
 *
 * @usage - 告知服务端当前玩家的猜拳选择
 * */
export default class CtosHandResultPacket extends YgoProPacket {
  constructor(pb: ygopro.YgoCtosMsg) {
    const handResult = pb.ctos_hand_result;

    const hand = handResult.hand;
    const exData = new Uint8Array(1);
    const dataView = new DataView(exData.buffer);

    // The YGOPro wire protocol uses 1 = scissors, 2 = rock, 3 = paper.
    dataView.setUint8(0, hand);

    super(exData.length + 1, CTOS_HAND_RESULT, exData);
  }
}
