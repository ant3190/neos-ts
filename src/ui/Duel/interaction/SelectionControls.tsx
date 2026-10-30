import { Button } from "antd";
import { type ReactNode, useId, useLayoutEffect, useState } from "react";
import { useSnapshot } from "valtio";

import { sendSelectMultiResponse, sendSelectSingleResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { cardStore, matStore } from "@/stores";

import { duelViewport } from "../layout/viewport";
import { getDuelEpoch, setDuelPrompt } from "../Message/session";
import { clearSelectInfo } from "../utils/clearSelectInfo";
import { registerFieldSelection, resetFieldSelection } from "./fieldSelection";
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
  const [choice, setChoice] = useState<{
    request: typeof request;
    uuid: string;
    response: number;
  }>();
  const pending = choice?.request === request ? choice : undefined;
  const current = () =>
    epoch === getDuelEpoch() &&
    container === getUIContainer() &&
    request === matStore.selectUnselectInfo.selectableList;
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
    resetFieldSelection();
    sendSelectSingleResponse(container.conn, -1);
  };
  const submit = () => {
    if (!pending || !current()) return;
    const card = cardStore.inner.find((card) => card.uuid === pending.uuid);
    if (!card || card.selectInfo.response !== pending.response) return;
    clearSelectInfo();
    resetFieldSelection();
    sendSelectMultiResponse(container.conn, [pending.response]);
    setChoice(undefined);
  };
  useDuelRightClick(
    active,
    () => {
      if (pending) setChoice(undefined);
      else end();
    },
    250,
  );
  useLayoutEffect(() => {
    if (!active) return;
    setDuelPrompt(id, active);
    const selectable = matStore.selectUnselectInfo.selectableList.map(
      (location) => cardStore.find(location),
    );
    const selected = matStore.selectUnselectInfo.selectedList.map((location) =>
      cardStore.find(location),
    );
    selectable.forEach((card) => {
      if (card) {
        card.selectInfo.selectable = true;
        card.selectInfo.selected = card.uuid === pending?.uuid;
      }
    });
    selected.forEach((card) => {
      if (card) {
        card.selectInfo.selectable = false;
        card.selectInfo.selected = card.uuid !== pending?.uuid;
      }
    });
    const candidates = [...selectable, ...selected];
    const release = registerFieldSelection((uuid) => {
      if (!current()) return;
      const card = candidates.find((card) => card?.uuid === uuid);
      if (!card || card.selectInfo.response === undefined) return;
      const response = card.selectInfo.response;
      setChoice((previous) =>
        previous?.request === request && previous.uuid === uuid
          ? undefined
          : { request, uuid, response },
      );
    });
    return () => {
      release();
      setDuelPrompt(id, false);
    };
  }, [active, id, request, info.selectedList, pending]);
  if (!active) return null;
  return (
    <SelectionControls
      title={`${hint.esSelectHint || "请选择召唤素材"}${
        pending ? "（待确认）" : ""
      }`}
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
        disabled={!pending && !info.finishable}
        onClick={pending ? submit : end}
      >
        确认选择
      </Button>
    </SelectionControls>
  );
}
