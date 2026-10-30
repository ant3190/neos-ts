import { Button, InputNumber } from "antd";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { proxy, useSnapshot } from "valtio";

import {
  fetchStrings,
  Region,
  sendSelectCounterResponse,
  type ygopro,
} from "@/api";
import { getUIContainer } from "@/container/compat";
import { cardStore } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import {
  registerFieldSelection,
  resetFieldSelection,
} from "../../interaction/fieldSelection";
import { useDuelRightClick } from "../../interaction/rightClick";
import { SelectionControls } from "../../interaction/SelectionControls";
import { NeosModal } from "../NeosModal";
import { PromptSession, setDuelPrompt } from "../session";
import styles from "./index.module.scss";

interface CheckCounterModalProps {
  isOpen: boolean;
  promptId: number;
  counterType?: number;
  min?: number;
  fieldSelection?: boolean;
  options: { code: number; max: number; location?: ygopro.CardLocation }[];
}
const localStore = proxy<CheckCounterModalProps>({
  isOpen: false,
  promptId: 0,
  options: [],
});
const session = new PromptSession<void>();

export function CheckCounterModal() {
  const snap = useSnapshot(localStore),
    container = getUIContainer(),
    promptId = localStore.promptId;
  const [selected, setSelected] = useState<number[]>([]);
  const current = useRef<number[]>([]);
  const id = useId();
  const zero = () => Array(localStore.options.length).fill(0) as number[];
  const reset = () => {
    current.current = zero();
    setSelected(current.current);
  };
  useLayoutEffect(reset, [snap.promptId, snap.options]);
  const count = selected.reduce((n, v) => n + v, 0),
    required = snap.min ?? 0;
  const submit = (values: number[]) => {
    if (
      !localStore.isOpen ||
      promptId !== localStore.promptId ||
      values.length !== localStore.options.length ||
      values.some(
        (value, index) =>
          !Number.isInteger(value) ||
          value < 0 ||
          value > localStore.options[index].max,
      ) ||
      values.reduce((n, v) => n + v, 0) !== required
    )
      return;
    localStore.isOpen = false;
    resetFieldSelection();
    sendSelectCounterResponse(container.conn, values);
    session.settle();
  };
  const update = (index: number, value: number) => {
    if (!localStore.isOpen || promptId !== localStore.promptId) return;
    const options = localStore.options;
    const values =
      current.current.length === options.length ? [...current.current] : zero();
    const other = values.reduce((n, v, i) => n + (i === index ? 0 : v), 0);
    values[index] = Math.max(
      0,
      Math.min(
        Number.isFinite(value) ? Math.trunc(value) : 0,
        options[index].max,
        required - other,
      ),
    );
    current.current = values;
    setSelected(values);
  };
  const counterName =
    fetchStrings(Region.Counter, `0x${snap.counterType?.toString(16)}`) ||
    "计数物";
  const field = !!(snap.isOpen && snap.fieldSelection);
  useDuelRightClick(field, reset, 250);
  useLayoutEffect(() => {
    if (!field) return;
    setDuelPrompt(id, true);
    const options = localStore.options;
    const cards = options.map((option) =>
      option.location
        ? cardStore.find(option.location as ygopro.CardLocation)
        : undefined,
    );
    cards.forEach((card, index) => {
      if (card) {
        card.selectInfo.selectable =
          count < required && (selected[index] ?? 0) < options[index].max;
        card.selectInfo.selected = (selected[index] ?? 0) > 0;
      }
    });
    const release = registerFieldSelection((uuid) => {
      const index = cards.findIndex((card) => card?.uuid === uuid);
      if (index >= 0) update(index, (current.current[index] ?? 0) + 1);
    });
    return () => {
      release();
      setDuelPrompt(id, false);
    };
  }, [field, snap.promptId, snap.options, selected]);
  const title = `请移除 ${required} 个${counterName}（已选 ${count}）`;
  const controls = (
    <>
      <Button data-testid="duel-counter-reset" onClick={reset}>
        重新选择
      </Button>
      <Button
        data-testid="duel-counter-submit"
        disabled={count !== required}
        onClick={() => submit(current.current)}
      >
        确认
      </Button>
    </>
  );
  if (field)
    return (
      <SelectionControls
        title={`${title} ${selected
          .map((n, i) => (n ? `${i + 1}号：${n}` : ""))
          .filter(Boolean)
          .join(" / ")}`}
        testId="duel-counter-controls"
      >
        {controls}
      </SelectionControls>
    );
  return (
    <NeosModal
      title={title}
      open={snap.isOpen}
      onDuelCancel={reset}
      footer={controls}
    >
      <div className={styles.container}>
        {snap.options.map((option, index) => (
          <div key={`${promptId}:${index}`}>
            <YgoCard code={option.code} className={styles.card} />
            <InputNumber
              aria-label={`${index + 1} 号卡片移除计数物`}
              data-testid="duel-counter-input"
              className={styles["input-number"]}
              min={0}
              max={Math.min(
                option.max,
                required - count + (selected[index] ?? 0),
              )}
              value={selected[index] ?? 0}
              precision={0}
              onChange={(value) => update(index, Number(value ?? 0))}
            />
          </div>
        ))}
      </div>
    </NeosModal>
  );
}

export async function displayCheckCounterModal(
  args: Omit<CheckCounterModalProps, "isOpen" | "promptId">,
) {
  const pending = session.begin();
  Object.assign(localStore, { fieldSelection: false }, args, {
    promptId: pending.id,
    isOpen: true,
  });
  await pending.promise;
  if (session.current(pending.id)) {
    localStore.isOpen = false;
    localStore.options = [];
  }
}
export function resetCheckCounterModal() {
  session.reset();
  resetFieldSelection();
  Object.assign(localStore, {
    isOpen: false,
    options: [],
    min: undefined,
    counterType: undefined,
    fieldSelection: false,
  });
}
