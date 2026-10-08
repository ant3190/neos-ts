import { Button } from "antd";
import { useEffect, useState } from "react";
import { proxy, useSnapshot } from "valtio";

import {
  type CardMeta,
  fetchStrings,
  getCardStr,
  Region,
  sendSelectBattleCmdResponse,
  sendSelectIdleCmdResponse,
  sendSelectOptionResponse,
} from "@/api";
import { type Container } from "@/container";
import { getUIContainer } from "@/container/compat";
import { YgoCard } from "@/ui/Shared";

import { clearAllIdleInteractivities } from "../../utils";
import { NeosModal } from "../NeosModal";
import { PromptSession } from "../session";
import styles from "./index.module.scss";

type Options = { info: string; response: number }[];
type ResponseKind = "option" | "idle" | "battle";
const store = proxy({
  title: "",
  isOpen: false,
  min: 1,
  options: [] as Options,
  responseKind: "option" as ResponseKind,
  preview: undefined as CardMeta | undefined,
  promptId: 0,
});
const session = new PromptSession<number | undefined>();
let customResponse: ((response: number) => boolean) | undefined;

export function OptionModal() {
  const container = getUIContainer();
  const { title, isOpen, min, options, responseKind, preview } =
    useSnapshot(store);
  const renderedPromptId = store.promptId;
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => setSelected([]), [options, isOpen]);
  const submit = (values: number[]) => {
    if (
      !store.isOpen ||
      renderedPromptId !== store.promptId ||
      values.length !== store.min
    )
      return;
    const response = values.reduce((result, value) => result | value, 0);
    const handler = customResponse;
    store.isOpen = false;
    if (handler) handler(response);
    else if (store.responseKind === "option")
      sendSelectOptionResponse(container.conn, response);
    else {
      clearAllIdleInteractivities();
      if (store.responseKind === "battle")
        sendSelectBattleCmdResponse(container.conn, response);
      else sendSelectIdleCmdResponse(container.conn, response);
    }
    session.settle(response);
  };
  const cancel = () => {
    if (!store.isOpen || renderedPromptId !== store.promptId) return;
    store.isOpen = false;
    session.settle(undefined);
  };
  return (
    <NeosModal
      title={title}
      open={isOpen}
      footer={
        <>
          {responseKind !== "option" && (
            <Button onClick={cancel} data-testid="duel-option-cancel">
              放弃发动
            </Button>
          )}
          <Button
            type="primary"
            data-testid="duel-option-submit"
            disabled={selected.length !== min}
            onClick={() => submit(selected)}
          >
            确定
          </Button>
        </>
      }
    >
      <div
        className={styles.container}
        data-testid="duel-option-modal"
        data-option-min={min}
      >
        {preview && (
          <div className={styles.preview}>
            <YgoCard code={preview.id} width="5rem" urgent />
            <strong>{preview.text.name}</strong>
          </div>
        )}
        <div className={styles.options} role="group" aria-label="效果选择">
          {options.map((option, index) => (
            <button
              type="button"
              key={`${option.response}:${index}`}
              className={
                selected.includes(option.response) ? styles.selected : ""
              }
              aria-pressed={selected.includes(option.response)}
              data-testid="duel-option-item"
              data-option-response={option.response}
              data-option-text={option.info}
              onClick={() =>
                setSelected((values) =>
                  values.includes(option.response)
                    ? values.filter((value) => value !== option.response)
                    : store.min === 1
                    ? [option.response]
                    : values.length < store.min
                    ? [...values, option.response]
                    : values,
                )
              }
              onDoubleClick={() => {
                if (store.min === 1) submit([option.response]);
              }}
            >
              <b>{index + 1}</b>
              <span>{option.info}</span>
            </button>
          ))}
        </div>
      </div>
    </NeosModal>
  );
}

export async function displayOptionModal(
  title: string,
  options: Options,
  min: number,
  responseKind: ResponseKind = "option",
  extra: {
    preview?: CardMeta;
    onResponse?: (response: number) => boolean;
  } = {},
) {
  const pending = session.begin(undefined);
  store.promptId = pending.id;
  store.title = title;
  store.options = options;
  store.min = min;
  store.responseKind = responseKind;
  store.preview = extra.preview;
  customResponse = extra.onResponse;
  store.isOpen = true;
  const result = await pending.promise;
  if (session.current(pending.id)) {
    store.isOpen = false;
    customResponse = undefined;
  }
  return result;
}
export function resetOptionModal() {
  store.isOpen = false;
  store.options = [];
  store.preview = undefined;
  customResponse = undefined;
  session.reset(undefined);
}

/** Kept for callers outside the card action toolbar. */
export async function handleEffectActivation(
  container: Container,
  meta: CardMeta,
  actions: {
    response: number;
    effectCode: number;
    responseSource?: "idle" | "battle";
  }[],
) {
  if (!actions.length) return;
  if (actions.length === 1) {
    clearAllIdleInteractivities();
    if (actions[0].responseSource === "battle")
      sendSelectBattleCmdResponse(container.conn, actions[0].response);
    else sendSelectIdleCmdResponse(container.conn, actions[0].response);
  } else
    await displayOptionModal(
      fetchStrings(Region.System, 556),
      actions.map((effect) => ({
        info: getCardStr(meta, effect.effectCode & 0xf) ?? "效果",
        response: effect.response,
      })),
      1,
      actions[0].responseSource ?? "idle",
      { preview: meta },
    );
}
