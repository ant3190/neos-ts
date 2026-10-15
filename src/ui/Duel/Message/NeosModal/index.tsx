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
      })}
      centered={false}
      getContainer={() =>
        document.querySelector<HTMLElement>('[data-testid="duel-stage"]') ??
        document.body
      }
      maskClosable={false}
      onCancel={() => setMini(!mini)}
      closeIcon={mini ? <UpOutlined /> : <MinusOutlined />}
      style={{ margin: 0, padding: 0, top: "auto" }}
      mask={!mini}
      wrapClassName={classNames(styles.wrap, {
        [styles.fieldView]: mini,
        [styles.selectionWrap]: duelPosition === "selection",
      })}
      closable={true}
      {...props}
      transitionName=""
      maskTransitionName=""
      width={duelWidth}
      open={props.open}
    />
  );
};
