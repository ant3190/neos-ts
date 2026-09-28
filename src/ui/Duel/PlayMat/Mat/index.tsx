import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { cardStore } from "@/stores";

import { Bg } from "../Bg";
import { Card } from "../Card";
import { HiddenCard } from "../Card/HiddenCard";
import styles from "./index.module.scss";

// 后面再改名
export const Mat: React.FC = () => {
  return (
    <section className={`${styles.mat} duel-mat`}>
      <div className={`${styles.camera} duel-mat-camera`}>
        <div className={`${styles.plane} duel-mat-plane`}>
          <Bg />
          <div className={`${styles.container} duel-mat-card-container`}>
            <Cards />
          </div>
        </div>
      </div>
    </section>
  );
};

const Cards: React.FC = () => {
  const { inner } = useSnapshot(cardStore);
  const topSequences = new Map<string, number>();
  for (const card of inner) {
    const { zone, controller, sequence } = card.location;
    if (zone !== ygopro.CardZone.DECK && zone !== ygopro.CardZone.EXTRA)
      continue;
    const key = `${controller}:${zone}`;
    topSequences.set(key, Math.max(topSequences.get(key) ?? -1, sequence));
  }

  return (
    <>
      {inner.map((card, i) => {
        const { zone, controller, sequence } = card.location;
        const stacked =
          zone === ygopro.CardZone.DECK || zone === ygopro.CardZone.EXTRA;
        // Only cards that can actually be seen mount springs and card images.
        const visible =
          zone !== ygopro.CardZone.TZONE &&
          (!stacked ||
            sequence >= (topSequences.get(`${controller}:${zone}`) ?? 0) - 2);
        return visible ? (
          <Card key={card.uuid} idx={i} />
        ) : (
          <HiddenCard key={card.uuid} idx={i} />
        );
      })}
    </>
  );
};
