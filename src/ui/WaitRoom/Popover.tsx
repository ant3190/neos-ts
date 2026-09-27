import { Button, Popover, Space } from "antd";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { RoomStage, roomStore } from "@/stores";

import { IconFont } from "../Shared";

export enum Mora {
  Rock = "rock",
  Scissors = "scissors",
  Paper = "paper",
}

export enum Tp {
  First = 1,
  Second = 2,
}

export const MoraPopover: React.FC<
  React.PropsWithChildren<{ onSelect?: (result: Mora) => void }>
> = ({ children, onSelect }) => {
  const open = useSnapshot(roomStore).stage === RoomStage.HAND_SELECTING;

  const onClick = (result: Mora) => {
    onSelect?.(result);
  };

  const { t: i18n } = useTranslation("WaitRoom");

  const map = {
    [Mora.Rock]: i18n("Rock"),
    [Mora.Scissors]: i18n("Scissors"),
    [Mora.Paper]: i18n("Paper"),
  };

  return (
    <Popover
      overlayStyle={{ backdropFilter: "blur(10px)" }}
      content={
        <Space>
          {[Mora.Rock, Mora.Scissors, Mora.Paper].map((mora) => (
            <Button
              key={mora}
              data-testid={`waitroom-mora-${mora}`}
              size="large"
              type="text"
              icon={<IconFont type={`icon-hand-${mora}`} size={16} />}
              onClick={() => onClick(mora)}
            >
              {map[mora]}
            </Button>
          ))}
        </Space>
      }
      open={open}
      placement="bottom"
    >
      {children}
    </Popover>
  );
};

export const TpPopover: React.FC<
  React.PropsWithChildren<{
    onSelect?: (result: Tp) => void;
  }>
> = ({ children, onSelect }) => {
  const open = useSnapshot(roomStore).stage === RoomStage.TP_SELECTING;
  const { t: i18n } = useTranslation("Popover");

  const onClick = (result: Tp) => {
    onSelect?.(result);
  };

  const map = {
    [Tp.First]: i18n("First"),
    [Tp.Second]: i18n("Second"),
  };

  return (
    <Popover
      overlayStyle={{ backdropFilter: "blur(0.625rem)" }}
      content={
        <Space>
          {[Tp.First, Tp.Second].map((item) => (
            <Button
              key={item}
              data-testid={`waitroom-tp-${
                item === Tp.First ? "first" : "second"
              }`}
              size="large"
              type="text"
              icon={
                <IconFont
                  type={`icon-${item === Tp.First ? "one" : "two"}`}
                  size={16}
                />
              }
              onClick={() => onClick(item)}
            >
              {map[item]}
            </Button>
          ))}
        </Space>
      }
      open={open}
      placement="bottom"
    >
      {children}
    </Popover>
  );
};
