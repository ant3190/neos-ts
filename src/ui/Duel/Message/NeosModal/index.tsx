import { MinusOutlined, UpOutlined } from "@ant-design/icons";
import { Modal, type ModalProps } from "antd";
import classNames from "classnames";
import { useId, useLayoutEffect, useState } from "react";

import { closeCardActions } from "../../interaction/CardActions";
import { setDuelPrompt } from "../session";
import styles from "./index.module.scss";

export const NeosModal: React.FC<ModalProps> = (props) => {
  const [mini, setMini] = useState(false);
  const id = useId();
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
        [styles["mini"]]: mini,
      })}
      centered
      maskClosable={true}
      onCancel={() => setMini(!mini)}
      closeIcon={mini ? <UpOutlined /> : <MinusOutlined />}
      style={{ padding: "10px 0" }}
      mask={!mini}
      wrapClassName={classNames({ [styles.wrap]: mini })}
      closable={true}
      {...props}
      open={props.open}
    />
  );
};
