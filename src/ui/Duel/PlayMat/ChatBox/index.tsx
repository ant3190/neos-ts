import { CloseOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { IconFont, ScrollableArea, useChat } from "@/ui/Shared";

import { useDuelRightClick } from "../../interaction/rightClick";
import styles from "./index.module.scss";

const store = proxy({ open: false });

interface ChatItem {
  name: string;
  content: string;
}

export const ChatBox: React.FC = () => {
  const { open } = useSnapshot(store);
  const { dialogs, input, setInput, ref, onSend } = useChat(true);
  const { t: i18n } = useTranslation("Chat");
  useDuelRightClick(open, closeChatBox, 200);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent | MouseEvent) => {
      if ((event.target as Element)?.closest("input, textarea")) return;
      if (
        event.type === "contextmenu" ||
        (event as KeyboardEvent).key === "Escape"
      ) {
        event.preventDefault();
        closeChatBox();
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!open) return null;
  const send = () => {
    if (!input?.trim()) closeChatBox();
    else onSend();
  };
  return (
    <aside className={styles.chatbox} aria-label="聊天" data-testid="duel-chat">
      <header>
        <strong>聊天</strong>
        <button type="button" aria-label="关闭聊天" onClick={closeChatBox}>
          <CloseOutlined />
        </button>
      </header>
      <ScrollableArea className={styles.dialogs} ref={ref}>
        {dialogs.map((item, idx) => (
          <DialogItem key={idx} {...item} />
        ))}
      </ScrollableArea>
      <div className={styles.input}>
        <Input.TextArea
          autoFocus
          variant="borderless"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          autoSize={{ maxRows: 3 }}
          placeholder={i18n("PleaseEnterChatContent")}
          onPressEnter={(event) => {
            if (event.nativeEvent.isComposing || event.shiftKey) return;
            event.preventDefault();
            send();
          }}
        />
        <Button
          type="text"
          aria-label="发送消息"
          icon={<IconFont type="icon-send" size={28} />}
          onClick={send}
        />
      </div>
    </aside>
  );
};

const DialogItem: React.FC<ChatItem> = ({ name, content }) => (
  <div className={styles.item}>
    <strong>{name}</strong>
    <p>{content}</p>
  </div>
);

export const openChatBox = () => (store.open = !store.open);
export const closeChatBox = () => (store.open = false);
