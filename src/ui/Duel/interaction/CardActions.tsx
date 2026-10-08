import { type CSSProperties, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { proxy, useSnapshot } from "valtio";

import {
  fetchStrings,
  getStrings,
  Region,
  sendSelectBattleCmdResponse,
  sendSelectIdleCmdResponse,
} from "@/api";
import { getUIContainer } from "@/container/compat";
import { cardStore, type CardType, InteractType } from "@/stores";

import { displayOptionModal, displaySimpleSelectCardsModal } from "../Message";
import { getDuelEpoch, hasDuelPrompt } from "../Message/session";
import {
  clearAllIdleInteractivities,
  interactTypeToIcon,
  interactTypeToString,
} from "../utils";
import { getActionHighlight } from "../utils/actionHighlight";
import { ACTION_ORDER, interactionAvailable } from "./actionRules";
import styles from "./index.module.scss";

const store = proxy({
  open: false,
  uuids: [] as string[],
  x: 0,
  y: 0,
  below: false,
});
export function closeCardActions() {
  store.open = false;
  store.uuids = [];
}
export function useCardActionActive(uuid: string) {
  const snap = useSnapshot(store);
  return snap.open && snap.uuids.includes(uuid);
}
export function openCardActions(cards: CardType[], anchor: HTMLElement) {
  if (hasDuelPrompt()) return;
  const uuids = cards
    .filter((card) => card.idleInteractivities.length)
    .map((card) => card.uuid);
  if (!uuids.length) {
    closeCardActions();
    return;
  }
  if (store.open && store.uuids.join() === uuids.join()) {
    closeCardActions();
    return;
  }
  const rect = anchor.getBoundingClientRect();
  store.x = rect.left + rect.width / 2;
  store.below = rect.top < 130;
  store.y = store.below ? rect.bottom + 12 : rect.top - 12;
  store.uuids = uuids;
  store.open = true;
}

async function runAction(action: InteractType, cards: CardType[]) {
  const epoch = getDuelEpoch();
  const container = getUIContainer();
  // Snapshot the command identity BEFORE awaiting another choice.
  const candidates = cards
    .map((card) => ({
      card,
      actions: card.idleInteractivities
        .filter((item) => item.interactType === action)
        .map((item) => ({ ...item })),
    }))
    .filter((entry) => entry.actions.length);
  closeCardActions();
  if (!candidates.length) return;
  let candidate = candidates[0];
  if (candidates.length > 1) {
    const result = await displaySimpleSelectCardsModal({
      selectables: candidates.map(({ card }) => ({
        meta: card.meta,
        location: card.location,
        actionHighlight: getActionHighlight([{ interactType: action }]),
        card,
      })),
    });
    if (!result.length || epoch !== getDuelEpoch()) return;
    const selected = candidates.find(
      (entry) => entry.card.uuid === result[0].card?.uuid,
    );
    if (!selected) return;
    candidate = selected;
  }
  const send = (response: number) => {
    if (epoch !== getDuelEpoch() || container !== getUIContainer())
      return false;
    const liveCard = cardStore.inner.find(
      (entry) => entry.uuid === candidate.card.uuid,
    );
    const chosen = candidate.actions.find(
      (entry) => entry.response === response,
    );
    if (
      !liveCard ||
      !chosen ||
      !interactionAvailable(liveCard.idleInteractivities, chosen)
    )
      return false;
    // Consume commands synchronously to prevent double click/reentrant responses.
    clearAllIdleInteractivities();
    if (chosen.responseSource === "battle")
      sendSelectBattleCmdResponse(container.conn, response);
    else sendSelectIdleCmdResponse(container.conn, response);
    return true;
  };
  if (candidate.actions.length === 1) {
    send(candidate.actions[0].response);
    return;
  }
  await displayOptionModal(
    fetchStrings(Region.System, 556),
    candidate.actions.map((entry, i) => ({
      info: entry.activateIndex
        ? getStrings(entry.activateIndex) ?? `效果 ${i + 1}`
        : `效果 ${i + 1}`,
      response: entry.response,
    })),
    1,
    candidate.actions[0].responseSource === "battle" ? "battle" : "idle",
    { preview: candidate.card.meta, onResponse: send },
  );
}

export function CardActions() {
  const snap = useSnapshot(store);
  const { inner } = useSnapshot(cardStore);
  const renderedOpen = store.open;
  const ref = useRef<HTMLDivElement>(null);
  const cards = snap.uuids
    .map((uuid) => cardStore.inner.find((entry) => entry.uuid === uuid))
    .filter((card): card is CardType => !!card);
  const types = new Set(
    inner
      .filter((card) => store.uuids.includes(card.uuid))
      .flatMap((card) =>
        card.idleInteractivities.map((entry) => entry.interactType),
      ),
  );
  const actions = ACTION_ORDER.filter((action) => types.has(action));
  useEffect(() => {
    if (!renderedOpen) return;
    const close = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      // A card click owns the toggle/open behavior.
      if ((event.target as Element)?.closest?.('[data-testid="duel-card"]'))
        return;
      closeCardActions();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCardActions();
    };
    const resize = () => closeCardActions();
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
    };
  }, [snap.open]);
  if (!snap.open || !actions.length || hasDuelPrompt()) return null;
  const width = actions.length * 58 + 20;
  const menuWidth = Math.min(width, window.innerWidth - 16);
  return createPortal(
    <div
      ref={ref}
      className={`${styles.actions} ${snap.below ? styles.below : ""}`}
      style={
        {
          left: Math.max(
            menuWidth / 2 + 8,
            Math.min(window.innerWidth - menuWidth / 2 - 8, snap.x),
          ),
          top: snap.y,
          "--menu-width": `${menuWidth}px`,
        } as CSSProperties
      }
      role="toolbar"
      aria-label="卡片操作"
      data-testid="duel-card-actions"
    >
      {actions.map((action) => {
        const candidate = cards
          .flatMap((card) => card.idleInteractivities)
          .filter((entry) => entry.interactType === action);
        return (
          <button
            key={action}
            type="button"
            className={
              getActionHighlight([{ interactType: action }]) === "gold"
                ? styles.gold
                : styles.blue
            }
            data-testid={`duel-action-${InteractType[action].toLowerCase()}`}
            data-action-type={InteractType[action]}
            data-action-response={
              candidate.length === 1 ? candidate[0].response : undefined
            }
            data-action-response-source={
              candidate.length === 1
                ? candidate[0].responseSource ?? "idle"
                : undefined
            }
            aria-label={interactTypeToString(action)}
            onClick={() => void runAction(action, cards)}
          >
            <span>
              {interactTypeToIcon(action, cards[0]?.location.position)}
            </span>
            <small>{interactTypeToString(action)}</small>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
