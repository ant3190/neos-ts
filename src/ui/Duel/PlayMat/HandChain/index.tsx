import { type INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { BlockState, isMe, matStore, placeStore } from "@/stores";
import { BgChain, type ChainMarker } from "@/ui/Shared";

import styles from "./index.module.scss";

const { HAND } = ygopro.CardZone;

const getController = (opponent = false) => {
  if (opponent) return isMe(0) ? 1 : 0;

  return isMe(0) ? 0 : 1;
};

export const HandChain: React.FC = () => {
  const snap = useSnapshot(placeStore.inner);
  const hasChain = useSnapshot(matStore).chainDetails.length > 1;
  const { me, op } = snap[HAND];
  if (!hasChain) return null;

  const genChains = (states: Snapshot<BlockState[]>, opponent = false) => {
    const controller = getController(opponent);
    const chains: ChainMarker[] = states.flatMap((state, sequence) =>
      state.chainIndex.map((index) => ({
        controller,
        index,
        sequence,
        zone: HAND,
      })),
    );
    chains.sort((a, b) => a.index - b.index);

    return chains;
  };

  return (
    <div className={styles.container}>
      <div className={styles.me}>
        <BgChain chains={genChains(me)} />
      </div>
      <div className={styles.op}>
        <BgChain chains={genChains(op, true)} op />
      </div>
    </div>
  );
};
