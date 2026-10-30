import { ygopro } from "../../../idl/ocgcore";
import { BufferReaderExt } from "../../bufferIO";

/** Both legacy and extended headers end in count + count * 7-byte card infos. */
export default (data: Uint8Array, topZone?: ygopro.CardZone) => {
  const legacy = data.length >= 2 && data.length === 2 + data[1] * 7;
  const extended = data.length >= 3 && data.length === 3 + data[2] * 7;
  if (!legacy && !extended)
    throw new RangeError("Invalid card reveal payload length");
  const reader = new BufferReaderExt(data);
  const player = reader.inner.readUint8();
  if (!legacy) reader.inner.readUint8();
  const count = reader.inner.readUint8();
  const cards: ygopro.CardInfo[] = [];
  for (let i = 0; i < count; i++) {
    const card = reader.readCardInfo();
    if (topZone !== undefined) card.location = topZone;
    cards.push(card);
  }
  return new ygopro.StocGameMessage.MsgConfirmCards({ player, cards });
};
