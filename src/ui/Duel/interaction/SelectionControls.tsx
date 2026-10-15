import { Button } from "antd";
import { type ReactNode, useId, useLayoutEffect } from "react";
import { useSnapshot } from "valtio";

import { sendSelectSingleResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { matStore } from "@/stores";

import { duelViewport } from "../layout/viewport";
import { getDuelEpoch, setDuelPrompt } from "../Message/session";
import { clearSelectInfo } from "../utils/clearSelectInfo";
import { useDuelRightClick } from "./rightClick";
import styles from "./SelectionControls.module.scss";

export function SelectionControls({
  title,
  children,
  testId = "duel-field-selection",
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  const viewport = useSnapshot(duelViewport);
  return (
    <div
      className={styles.layer}
      style={{
        left: -viewport.left / viewport.scale,
        top: -viewport.top / viewport.scale,
        width: window.innerWidth,
        height: window.innerHeight,
        transform: `scale(${1 / viewport.scale})`,
      }}
    >
      <section
        className={styles.controls}
        data-testid={testId}
        role="region"
        aria-label={title}
      >
        <p>{title}</p>
        <div className={styles.buttons}>{children}</div>
      </section>
    </div>
  );
}

/** Incremental material requests return one choice at a time; -1 ends/cancels only when allowed. */
export function IncrementalSelectionControls() {
  const info = useSnapshot(matStore.selectUnselectInfo);
  const hint = useSnapshot(matStore.hint);
  const active = !!(info.selectableList.length || info.selectedList.length);
  const id = useId();
  const epoch = getDuelEpoch();
  const container = getUIContainer();
  const request = matStore.selectUnselectInfo.selectableList;
  const end = () => {
    const live = matStore.selectUnselectInfo;
    if (
      epoch !== getDuelEpoch() ||
      container !== getUIContainer() ||
      request !== live.selectableList ||
      (!live.cancelable && !live.finishable)
    )
      return;
    clearSelectInfo();
    sendSelectSingleResponse(container.conn, -1);
  };
  useDuelRightClick(active, end, 250);
  useLayoutEffect(() => {
    setDuelPrompt(id, active);
    return () => setDuelPrompt(id, false);
  }, [active, id]);
  if (!active) return null;
  return (
    <SelectionControls
      title={hint.esSelectHint || "请选择召唤素材"}
      testId="duel-material-controls"
    >
      {info.cancelable && !info.finishable && (
        <Button data-testid="duel-material-cancel" onClick={end}>
          取消
        </Button>
      )}
      <Button
        type="primary"
        data-testid="duel-material-confirm"
        disabled={!info.finishable}
        onClick={end}
      >
        确认选择
      </Button>
    </SelectionControls>
  );
}
