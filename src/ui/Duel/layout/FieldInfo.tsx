import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { TYPE_LINK } from "@/common";
import { cardStore, isMe } from "@/stores";

import { MDPRO3 } from "../animation/mdpro3";
import { cardMotionState } from "../animation/motionState";
import { animationQuality } from "../animation/runtime";
import { getDuration } from "../PlayMat/Card/springs/utils";
import styles from "./fieldInfo.module.scss";
import {
  isFaceDownPosition,
  projectWorld,
  zoneWorldPosition,
} from "./geometry";
import { duelViewport } from "./viewport";

/** Labels share the same flat table coordinates as cards and slots. */
export function FieldInfo() {
  const { inner } = useSnapshot(cardStore);
  const moving = new Set(Object.keys(useSnapshot(cardMotionState).moving));
  const viewport = useSnapshot(duelViewport);
  const camera = { width: viewport.width };
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
            { ...world, y: 0.3, z: world.z - 4 },
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
                <StatNumber value={card.meta.data.atk} />
                {!link && (
                  <>
                    {" "}
                    / <StatNumber value={card.meta.data.def} />
                  </>
                )}
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

function StatNumber({ value }: { value?: number }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    let frame = 0,
      done = false;
    const finish = () => {
      done = true;
      cancelAnimationFrame(frame);
      current.current = value;
      setShown(value);
    };
    if (from === value) return;
    if (
      from === undefined ||
      value === undefined ||
      from < 0 ||
      value < 0 ||
      animationQuality() === "off"
    ) {
      finish();
      return;
    }
    const start = performance.now(),
      duration =
        animationQuality() === "full" ? getDuration(MDPRO3.statRoll) : 150;
    const tick = (now: number) => {
      if (done) return;
      const progress = Math.min(1, (now - start) / duration);
      current.current = Math.round(from + (value - from) * progress);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const deadline = setTimeout(finish, duration + 100);
    const visibility = () => {
      if (document.hidden) finish();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(deadline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [value]);
  return (
    <span data-stat-target={value}>
      {shown === undefined || shown < 0 ? "?" : shown}
    </span>
  );
}
