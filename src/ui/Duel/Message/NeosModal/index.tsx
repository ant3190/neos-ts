import { MinusOutlined, UpOutlined } from "@ant-design/icons";
import { Modal, type ModalProps } from "antd";
import classNames from "classnames";
import { useEffect, useId, useLayoutEffect, useState } from "react";

import { closeCardActions } from "../../interaction/CardActions";
import { setDuelPrompt } from "../session";
import styles from "./index.module.scss";

export const NeosModal = ({
  duelPosition = "center",
  duelWidth = 950,
  ...props
}: ModalProps & {
  duelPosition?: "center" | "selection";
  duelWidth?: number;
}) => {
  const [mini, setMini] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!props.open) return;
    const fieldView = (event: MouseEvent) => {
      event.preventDefault();
      setMini((value) => !value);
    };
    document.addEventListener("contextmenu", fieldView);
    return () => document.removeEventListener("contextmenu", fieldView);
  }, [props.open]);
  useLayoutEffect(() => {
    setDuelPrompt(id, !!props.open);
    if (props.open) {
      setMini(false);
      closeCardActions();
    }
    return () => setDuelPrompt(id, false);
  }, [id, props.open]);

  return (
    <Modal
      className={classNames(styles.modal, {
        [styles.selection]: duelPosition === "selection",
        [styles["mini"]]: mini,
      })}
      centered={false}
      getContainer={() =>
        document.querySelector<HTMLElement>('[data-testid="duel-stage"]') ??
        document.body
      }
      maskClosable={false}
      onCancel={() => setMini(!mini)}
      closeIcon={mini ? <UpOutlined /> : <MinusOutlined />}
      style={{
        position: "absolute",
        top: mini ? undefined : duelPosition === "selection" ? 670 : "50%",
        bottom: mini ? 0 : undefined,
        left: "50%",
        margin: 0,
        padding: 0,
        transform: mini
          ? "translate(-50%, calc(100% - 68px))"
          : duelPosition === "selection"
          ? "translateX(-50%)"
          : "translate(-50%, -50%)",
      }}
      mask={!mini}
      wrapClassName={classNames({ [styles.wrap]: mini })}
      closable={true}
      {...props}
      width={duelWidth}
      open={props.open}
    />
  );
};
