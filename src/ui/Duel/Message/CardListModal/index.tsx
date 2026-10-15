import { CloseOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { proxy, useSnapshot } from "valtio";

import { fetchCard, ygopro } from "@/api";
import { cardStore, type CardType, isMe } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { openCardActions } from "../../interaction/CardActions";
import { isFaceDownPosition } from "../../layout/geometry";
import { closePilePanel, duelPanels, openPilePanel } from "../../layout/panels";
import { ActionFrame } from "../../PlayMat/ActionFrame";
import { getActionHighlight } from "../../utils/actionHighlight";
import { showCardModal } from "../CardModal";
import styles from "./index.module.scss";

const store = proxy({
  zone: ygopro.CardZone.HAND,
  controller: 0,
  monster: undefined as CardType | undefined,
  isZone: true,
  generation: 0,
});
const zoneNames: Record<number, string> = {
  [ygopro.CardZone.DECK]: "主卡组",
  [ygopro.CardZone.HAND]: "手牌",
  [ygopro.CardZone.MZONE]: "怪兽区",
  [ygopro.CardZone.SZONE]: "魔陷区",
  [ygopro.CardZone.GRAVE]: "墓地",
  [ygopro.CardZone.REMOVED]: "除外",
  [ygopro.CardZone.EXTRA]: "额外卡组",
};

export const CardListModal = () => {
  const snap = useSnapshot(store);
  const panels = useSnapshot(duelPanels);
  const { inner } = useSnapshot(cardStore);
  const [triple, setTriple] = useState(false);
  const { isZone, zone, controller, monster, generation } = snap;
  const monsterZone = monster?.location.zone,
    monsterController = monster?.location.controller,
    monsterSequence = monster?.location.sequence;
  useEffect(() => setTriple(false), [generation]);
  if (panels.right === "effects")
    return (
      <aside
        className={styles.panel}
        data-testid="duel-attached-effects"
        aria-label="附加效果"
      >
        <header>
          <strong>附加效果</strong>
          <span>{Object.keys(panels.attachedEffects).length}</span>
          <button
            type="button"
            aria-label="关闭附加效果"
            onClick={closePilePanel}
          >
            <CloseOutlined />
          </button>
        </header>
        <div className={styles.cards}>
          {Object.entries(panels.attachedEffects).map(([code, mask]) => (
            <button
              className={styles.cardButton}
              type="button"
              key={code}
              data-testid="duel-attached-effect"
              data-card-code={code}
              data-player-mask={mask}
              aria-label={fetchCard(Number(code)).text.name || "附加效果"}
              onClick={() =>
                showCardModal({ meta: fetchCard(Number(code)) }, true)
              }
            >
              <YgoCard code={Number(code)} width="76px" />
              <span>
                {[0, 1]
                  .filter((player) => mask & (1 << player))
                  .map((player) => (isMe(player) ? "我方" : "对方"))
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      </aside>
    );
  if (panels.right !== "pile") return null;
  // This predicate runs during render; snapshot reads must remain reactive.
  /* eslint-disable valtio/state-snapshot-rule */
  const cards = inner
    .filter(({ location: p }) =>
      isZone
        ? p.zone === zone && p.controller === controller && !p.is_overlay
        : monsterZone !== undefined &&
          p.zone === monsterZone &&
          p.controller === monsterController &&
          p.sequence === monsterSequence &&
          p.is_overlay,
    )
    .sort(
      (a, b) =>
        b.location.sequence - a.location.sequence ||
        b.location.overlay_sequence - a.location.overlay_sequence,
    );
  /* eslint-enable valtio/state-snapshot-rule */
  const name = `${isMe(snap.controller) ? "我方" : "对方"}${
    snap.isZone ? zoneNames[snap.zone] ?? "卡片" : "叠放素材"
  }`;
  return (
    <aside
      className={`${styles.panel} ${triple ? styles.triple : ""}`}
      data-testid="duel-card-list"
      aria-label={name}
    >
      <header>
        <strong>{name}</strong>
        <span>{cards.length}</span>
        <button
          type="button"
          aria-label="切换卡堆布局"
          data-testid="duel-pile-layout"
          onClick={() => setTriple((value) => !value)}
        >
          <UnorderedListOutlined />
        </button>
        <button type="button" aria-label="关闭卡堆" onClick={closePilePanel}>
          <CloseOutlined />
        </button>
      </header>
      <div className={styles.cards} role="list">
        {cards.map((card, index) => {
          const hidden =
            !isMe(card.location.controller) &&
            isFaceDownPosition(card.location.position);
          return (
            <div
              role="listitem"
              key={card.uuid}
              style={
                triple
                  ? {
                      gridColumn: ((cards.length - 1 - index) % 3) + 1,
                      gridRow:
                        Math.floor((cards.length - 1) / 3) -
                        Math.floor((cards.length - 1 - index) / 3) +
                        1,
                    }
                  : undefined
              }
            >
              <button
                type="button"
                data-pile-card
                data-card-code={hidden ? 0 : card.code}
                data-action-highlight={
                  getActionHighlight(card.idleInteractivities) ?? "none"
                }
                className={styles.cardButton}
                aria-label={hidden ? "背面卡片" : card.meta.text.name || "卡片"}
                onClick={(event) => {
                  if (!hidden) showCardModal(card);
                  const live = cardStore.inner.find(
                    (entry) => entry.uuid === card.uuid,
                  );
                  if (
                    live &&
                    store.isZone &&
                    generation === store.generation &&
                    duelPanels.right === "pile"
                  )
                    openCardActions([live], event.currentTarget);
                }}
              >
                <YgoCard
                  code={hidden ? 0 : card.code}
                  isBack={hidden || !card.code}
                  targeted={card.targeted}
                  width="76px"
                />
                <ActionFrame
                  highlight={getActionHighlight(card.idleInteractivities)}
                />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export const displayCardListModal = (args: {
  isZone?: boolean;
  monster?: CardType;
  zone?: ygopro.CardZone;
  controller?: number;
}) => {
  if (args.zone === ygopro.CardZone.GRAVE && duelPanels.cannotCheckGrave)
    return;
  Object.assign(store, {
    ...args,
    isZone: args.isZone ?? false,
    generation: store.generation + 1,
  });
  if (args.monster) store.controller = args.monster.location.controller;
  openPilePanel();
};
export const closeCardListModal = () => {
  if (duelPanels.right === "pile" || duelPanels.right === "effects")
    closePilePanel();
  store.monster = undefined;
};
