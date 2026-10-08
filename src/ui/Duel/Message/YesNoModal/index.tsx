import { Button } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import { type CardMeta, sendSelectEffectYnResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { matStore } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { NeosModal } from "../NeosModal";
import { PromptSession } from "../session";

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

  return (
    <NeosModal
      title={meta ? "是否发动这个效果？" : `${preHintMsg} ${msg}`}
      open={isOpen}
      width={"25rem"}
      afterClose={() => (matStore.hint.esHint = undefined)}
      footer={
        <>
          <Button
            data-testid="duel-yesno-no"
            onClick={() => {
              if (!localStore.isOpen || promptId !== localStore.promptId)
                return;
              localStore.isOpen = false;
              sendSelectEffectYnResponse(container.conn, false);
              session.settle();
            }}
          >
            取消
          </Button>
          <Button
            data-testid="duel-yesno-yes"
            type="primary"
            onClick={() => {
              if (!localStore.isOpen || promptId !== localStore.promptId)
                return;
              localStore.isOpen = false;
              sendSelectEffectYnResponse(container.conn, true);
              session.settle();
            }}
          >
            确认
          </Button>
        </>
      }
    >
      <div
        data-testid="duel-yesno-modal"
        style={{ display: "flex", alignItems: "center", gap: 16 }}
      >
        {meta && <YgoCard code={meta.id} width="6rem" urgent />}
        {meta && (
          <div>
            <strong>{meta.text.name}</strong>
            <p style={{ color: "#e4d099" }}>{source}</p>
            <p style={{ lineHeight: 1.5 }}>{msg}</p>
          </div>
        )}
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
