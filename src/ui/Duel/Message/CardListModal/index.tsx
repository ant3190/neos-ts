import { Drawer, Space } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { cardStore, CardType } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { ActionFrame } from "../../PlayMat/ActionFrame";
import { getActionHighlight } from "../../utils/actionHighlight";
import { showCardModal } from "../CardModal";

const CARD_WIDTH = "6.25rem";
const DRAWER_WIDTH = "10rem";

// TODO: 显示的位置还需要细细斟酌

const defaultStore = {
  zone: ygopro.CardZone.HAND,
  controller: 0,
  monster: {} as CardType,
  isOpen: false,
  isZone: true,
};

const store = proxy(defaultStore);

export const CardListModal = () => {
  const { zone, monster, isOpen, isZone, controller } = useSnapshot(store);
  const { inner } = useSnapshot(cardStore);
  const cardList: (typeof inner)[number][] = [];
  if (isOpen) {
    for (const card of inner) {
      const { location } = card;
      const matches = isZone
        ? location.zone === zone &&
          location.controller === controller &&
          !location.is_overlay
        : location.zone === monster.location.zone &&
          location.controller === monster.location.controller &&
          location.sequence === monster.location.sequence &&
          location.is_overlay;
      if (matches) cardList.push(card);
    }
  }

  const handleOkOrCancel = () => {
    store.isOpen = false;
  };

  return (
    <Drawer
      open={isOpen}
      onClose={handleOkOrCancel}
      // headerStyle={{ display: "none" }}
      width={DRAWER_WIDTH}
      style={{ maxHeight: "100%" }}
      mask={false}
    >
      <Space direction="vertical">
        {cardList.map((card) => (
          <div
            key={card.uuid}
            style={{ position: "relative" }}
            data-card-code={card.code}
            data-action-highlight={
              getActionHighlight(card.idleInteractivities) ?? "none"
            }
          >
            <YgoCard
              code={card.code}
              targeted={card.targeted}
              width={CARD_WIDTH}
              onClick={() => showCardModal(card)}
            />
            <ActionFrame
              highlight={getActionHighlight(card.idleInteractivities)}
            />
          </div>
        ))}
      </Space>
    </Drawer>
  );
};

export const displayCardListModal = ({
  isZone,
  monster,
  zone,
  controller,
}: Partial<Omit<typeof defaultStore, "isOpen">>) => {
  store.isOpen = true;
  store.isZone = isZone ?? false;
  monster && (store.monster = monster);
  zone && (store.zone = zone);
  controller !== undefined && (store.controller = controller);
};

export const closeCardListModal = () => {
  store.isOpen = false;
  store.isZone = true;
  store.monster = {} as CardType;
};
