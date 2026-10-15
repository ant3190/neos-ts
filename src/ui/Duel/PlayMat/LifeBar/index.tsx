import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { matStore, roomStore } from "@/stores";

import { animationQuality } from "../../animation/runtime";
import styles from "./index.module.scss";

export const LifeBar = () => {
  const snap = useSnapshot(matStore);
  const players = useSnapshot(roomStore);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [
    snap.timeLimits.me,
    snap.timeLimits.op,
    snap.timerPlayer,
    snap.currentPlayer,
  ]);
  return (
    <div className={styles.container}>
      {[false, true].map((mine) => {
        const info = mine ? snap.initInfo.me : snap.initInfo.op;
        const rawTime = mine ? snap.timeLimits.me : snap.timeLimits.op;
        const active = matStore.isMe(snap.currentPlayer) === mine;
        const ticking =
          matStore.isMe(snap.timerPlayer ?? snap.currentPlayer) === mine;
        return (
          <LifeBarItem
            key={String(mine)}
            mine={mine}
            active={active}
            name={
              (mine ? players.getMePlayer() : players.getOpPlayer())?.name ??
              "?"
            }
            life={info.life}
            time={
              rawTime < 0
                ? undefined
                : Math.max(0, rawTime - (ticking ? elapsed : 0))
            }
          />
        );
      })}
    </div>
  );
};

function LifeBarItem({
  mine,
  active,
  name,
  life,
  time,
}: {
  mine: boolean;
  active: boolean;
  name: string;
  life: number;
  time?: number;
}) {
  const shown = useLifeNumber(life);
  return (
    <section
      className={`${styles.player} ${mine ? styles.me : styles.op} ${
        active ? styles.active : ""
      }`}
      data-testid="duel-player-life"
      data-player={mine ? "me" : "op"}
      data-life={life}
      aria-label={`${name} 生命值 ${life}`}
    >
      <div className={styles.name}>{name}</div>
      <div className={styles.life}>
        <span>LP</span>
        <strong
          data-testid="duel-player-life-value"
          data-player={mine ? "me" : "op"}
          data-target-life={life}
        >
          {shown < 0 ? "—" : shown}
        </strong>
      </div>
      {time !== undefined && (
        <div className={styles.timer} data-testid="duel-player-time">
          {Math.floor(time / 60)
            .toString()
            .padStart(2, "0")}
          :{(time % 60).toString().padStart(2, "0")}
        </div>
      )}
    </section>
  );
}

function useLifeNumber(life: number) {
  const [shown, setShown] = useState(life);
  const current = useRef(life);
  useEffect(() => {
    const from = current.current;
    let frame = 0;
    let settled = false;
    const finish = () => {
      settled = true;
      cancelAnimationFrame(frame);
      current.current = life;
      setShown(life);
    };
    if (
      from < 0 ||
      life < 0 ||
      animationQuality() === "off" ||
      document.hidden
    ) {
      finish();
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      if (settled) return;
      const progress = Math.min(1, (now - start) / 500);
      current.current = Math.round(
        from + (life - from) * (1 - (1 - progress) ** 3),
      );
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Wall time settles a suspended/slow renderer too; the number cannot stay stale.
    const deadline = setTimeout(finish, 550);
    const visibility = () => {
      if (document.hidden) finish();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(deadline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [life]);
  return shown;
}
