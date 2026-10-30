import { Button } from "antd";
import { useId, useLayoutEffect } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { cardStore, matStore } from "@/stores";

import { SelectCardsModal } from "../Message/SelectCardsModal";
import { setDuelPrompt } from "../Message/session";
import { registerFieldSelection } from "./fieldSelection";
import {
  cancelMaterials,
  confirmMaterials,
  materialSelection,
  toggleMaterial,
} from "./materialSelection";
import { useDuelRightClick } from "./rightClick";
import { SelectionControls } from "./SelectionControls";
import { selectionKey } from "./selectionRules";

export function IncrementalSelectionControls() {
  const snap = useSnapshot(materialSelection);
  const hint = useSnapshot(matStore.hint);
  const id = useId();
  const requestId = snap.requestId;
  const picked = new Set(snap.selecteds.map(selectionKey));
  for (const key of [snap.pendingKey, ...snap.queued]) {
    if (!key) continue;
    if (picked.has(key)) picked.delete(key);
    else picked.add(key);
  }
  const pickedKeys = [...picked];
  const pickedSignature = pickedKeys.join("|");
  const cancel = () => cancelMaterials(requestId);
  const confirm = () => confirmMaterials(requestId);
  useDuelRightClick(snap.active && snap.fieldSelection, cancel, 250);
  useLayoutEffect(() => {
    const live = materialSelection;
    if (!live.active || !live.fieldSelection) return;
    setDuelPrompt(id, true);
    const candidates = [...live.selectables, ...live.selecteds].map(
      (option) => ({
        option,
        card: option.location
          ? cardStore.find(option.location as ygopro.CardLocation)
          : undefined,
      }),
    );
    for (const { option, card } of candidates) {
      if (!card) continue;
      card.selectInfo.selectable = !live.canceling;
      card.selectInfo.selected = pickedKeys.includes(selectionKey(option));
      card.selectInfo.response = option.response;
    }
    const release = registerFieldSelection((uuid) => {
      const option = candidates.find((entry) => entry.card?.uuid === uuid)
        ?.option;
      if (option) toggleMaterial(selectionKey(option), requestId);
    });
    return () => {
      release();
      setDuelPrompt(id, false);
    };
  }, [
    snap.active,
    snap.fieldSelection,
    snap.selectables,
    snap.selecteds,
    snap.canceling,
    pickedSignature,
    id,
    requestId,
  ]);
  if (!snap.active) return null;
  const canCancel = snap.cancelable || !!snap.selecteds.length || snap.waiting;
  const canConfirm =
    snap.finishable && !snap.waiting && !snap.queued.length && !snap.canceling;
  const title = `${hint.esSelectHint || "请选择召唤素材"}（已选 ${
    picked.size
  } 张）${snap.canceling ? " · 正在取消选择…" : ""}`;
  if (snap.fieldSelection)
    return (
      <SelectionControls title={title} testId="duel-material-controls">
        <Button
          data-testid="duel-material-cancel"
          disabled={!canCancel || snap.canceling}
          onClick={cancel}
        >
          全部取消
        </Button>
        <Button
          type="primary"
          data-testid="duel-material-confirm"
          disabled={!canConfirm}
          onClick={confirm}
        >
          确认选择
        </Button>
      </SelectionControls>
    );
  return (
    <SelectCardsModal
      isOpen
      title={title}
      min={snap.min}
      max={snap.max}
      single={false}
      selectables={snap.selectables}
      selecteds={snap.selecteds}
      mustSelects={[]}
      cancelable={snap.cancelable}
      finishable={snap.finishable}
      totalLevels={0}
      overflow
      incremental={{
        selectedKeys: pickedKeys,
        canCancel,
        canConfirm,
        canceling: snap.canceling,
        onToggle: (option) => toggleMaterial(selectionKey(option), requestId),
      }}
      onSubmit={confirm}
      onCancel={cancel}
      onFinish={confirm}
    />
  );
}
