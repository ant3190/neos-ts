import { Button } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import { type CardMeta, sendSelectEffectYnResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { matStore } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { NeosModal } from "../NeosModal";
import { PromptSession } from "../session";
import styles from "./index.module.scss";

interface YesNoModalProps {
  isOpen: boolean;
  msg?: string;
  meta?: CardMeta;
  source?: string;
  promptId?: number;
}
const defaultProps = { isOpen: false };

const localStore = proxy<YesNoModalProps>({ ...defaultProps });
const session = new PromptSession<void>();

export const YesNoModal: React.FC = () => {
  const container = getUIContainer();
  const { isOpen, msg, meta, source } = useSnapshot(localStore);
  const hint = useSnapshot(matStore.hint);
  const promptId = localStore.promptId;

  const preHintMsg = hint?.esHint || "";
  const message =
    msg?.trim() && msg !== "?" && msg !== "[?]"
      ? msg
      : meta
      ? "是否发动这个效果？"
      : "是否继续？";

  const answer = (yes: boolean) => {
    if (!localStore.isOpen || promptId !== localStore.promptId) return;
    localStore.isOpen = false;
    sendSelectEffectYnResponse(container.conn, yes);
    session.settle();
  };
  return (
    <NeosModal
      title={meta ? "是否发动这个效果？" : "请确认"}
      open={isOpen}
      duelWidth={760}
      onDuelCancel={() => answer(false)}
      afterClose={() => (matStore.hint.esHint = undefined)}
      footer={
        <>
          <Button data-testid="duel-yesno-no" onClick={() => answer(false)}>
            取消
          </Button>
          <Button
            data-testid="duel-yesno-yes"
            type="primary"
            onClick={() => answer(true)}
          >
            确认
          </Button>
        </>
      }
    >
      <div data-testid="duel-yesno-modal" className={styles.content}>
        {meta && <YgoCard code={meta.id} width="150px" urgent />}
        <div className={styles.details}>
          {meta?.text.name && <strong>{meta.text.name}</strong>}
          {source && <p className={styles.source}>{source}</p>}
          {preHintMsg && <p>{preHintMsg}</p>}
          <p data-testid="duel-yesno-message">{message}</p>
        </div>
      </div>
    </NeosModal>
  );
};

export const displayYesNoModal = async (
  msg: string,
  meta?: CardMeta,
  source?: string,
) => {
  const pending = session.begin();
  localStore.msg = msg;
  localStore.meta = meta;
  localStore.source = source;
  localStore.promptId = pending.id;
  localStore.isOpen = true;
  await pending.promise;
  if (session.current(pending.id)) localStore.isOpen = false;
};

export const resetYesNoModal = () => {
  localStore.isOpen = false;
  localStore.msg = undefined;
  localStore.meta = undefined;
  session.reset();
};
