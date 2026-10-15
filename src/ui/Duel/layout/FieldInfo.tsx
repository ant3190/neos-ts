import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { TYPE_LINK } from "@/common";
import { cardStore, isMe } from "@/stores";

import { cardMotionState } from "../animation/motionState";
import styles from "./fieldInfo.module.scss";
import {
  isFaceDownPosition,
  projectWorld,
  zoneWorldPosition,
} from "./geometry";
import { duelViewport } from "./viewport";

/** Camera-facing labels stay legible while the table itself remains in perspective. */
export function FieldInfo() {
  const { inner } = useSnapshot(cardStore);
  const moving = new Set(Object.keys(useSnapshot(cardMotionState).moving));
  const viewport = useSnapshot(duelViewport);
  const camera = { width: viewport.width, fov: viewport.fov };
  return (
    <div className={styles.layer} aria-hidden="true">
      {inner
        .filter(
          (card) =>
            card.location.zone === ygopro.CardZone.MZONE &&
            !card.location.is_overlay &&
            card.code &&
            !isFaceDownPosition(card.location.position) &&
            !moving.has(card.uuid),
        )
        .map((card) => {
          const world = zoneWorldPosition(
            card.location,
            isMe(card.location.controller),
          );
          const point = projectWorld(
            { ...world, y: 0.3, z: world.z - 4.4 },
            camera,
          );
          const link = !!((card.meta.data.type ?? 0) & TYPE_LINK);
          const counters = Object.values(card.counters).reduce(
            (sum, count) => sum + count,
            0,
          );
          return (
            <div
              key={card.uuid}
              className={styles.stats}
              style={{ left: point.x, top: point.y }}
              data-testid="duel-field-stats"
              data-stats-card-uuid={card.uuid}
            >
              <strong>
                {card.meta.data.atk ?? "?"}
                {link ? "" : ` / ${card.meta.data.def ?? "?"}`}
              </strong>
              <small>
                {link ? "LINK" : "LV"} {(card.meta.data.level ?? 0) & 0xff}
                {counters ? ` · ${counters}` : ""}
              </small>
            </div>
          );
        })}
    </div>
  );
}
