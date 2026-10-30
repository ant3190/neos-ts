import { animated, to, useSpring } from "@react-spring/web";
import classnames from "classnames";
import React, {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { getUIContainer } from "@/container/compat";
import { eventbus, Task } from "@/infra";
import {
  cardStore,
  CardType,
  InteractType,
  isCardDisabled,
  isMe,
} from "@/stores";
import { showCardModal as displayCardModal } from "@/ui/Duel/Message/CardModal";
import { YgoCard } from "@/ui/Shared";

import {
  type CardMotionKind,
  cardMotionPlan,
} from "../../animation/motionRules";
import {
  cardMotionState,
  revealPublicCardFace,
} from "../../animation/motionState";
import { consumeCardOrigin } from "../../animation/origins";
import { inspectCardRelations } from "../../animation/present";
import { registerCardElement } from "../../animation/runtime";
import {
  openCardActions,
  useCardActionActive,
} from "../../interaction/CardActions";
import { trySelectFieldCard } from "../../interaction/fieldSelection";
import {
  handClickSuppressed,
  handInteraction,
  suppressHandClick,
} from "../../interaction/hand";
import { cardPose } from "../../layout/cardPose";
import { isFaceDownPosition } from "../../layout/geometry";
import { closeCardListModal, displayCardListModal } from "../../Message";
import { getActionHighlight } from "../../utils/actionHighlight";
import { ActionFrame } from "../ActionFrame";
import styles from "./index.module.scss";
import {
  attack,
  type AttackOptions,
  focus,
  land,
  move,
  type MoveOptions,
} from "./springs";
import type { SpringApiProps } from "./springs/types";

const { HAND, DECK, GRAVE, REMOVED, EXTRA, MZONE, SZONE } = ygopro.CardZone;

const CardImpl: React.FC<{ idx: number }> = ({ idx }) => {
  const container = getUIContainer();
  const card = cardStore.inner[idx];
  const snap = useSnapshot(card);
  const activeAction = useCardActionActive(card.uuid);
  const hand = useSnapshot(handInteraction);
  const publicFace = useSnapshot(cardMotionState).revealed[card.uuid]?.code;
  const gesture = useRef<{ x: number; offset: number; pointer: number }>();
  const [moving, setMoving] = useState(false);
  const [motion, setMotion] = useState<{ kind: CardMotionKind; arc: number }>({
    kind: "move",
    arc: 200,
  });
  const mine = isMe(snap.location.controller);
  const handCard = snap.location.zone === HAND;
  const canInspect =
    snap.code !== 0 &&
    (mine || handCard || !isFaceDownPosition(snap.location.position));

  const [spring, api] = useSpring<SpringApiProps>(
    () =>
      ({
        x: 0,
        y: 0,
        z: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        zIndex: 0,
        scale: 0,
        subZ: 0,
        opacity: 1,
      }) satisfies SpringApiProps,
  );

  // Establish the source before the first paint. Only the queue owns motion after this.
  useLayoutEffect(() => {
    const origin = consumeCardOrigin(card.uuid);
    api.set({
      ...cardPose(origin ? { ...card, location: origin } : card),
      subZ: 0,
      opacity: 1,
    });
    return () => {
      api.stop();
    };
  }, []);

  const [classFocus, setClassFocus] = useState(false);

  // >>> 动画 >>>
  /** 一次动画失败也不能阻塞这张卡之后的所有操作。 */
  const animationQueue = useRef(Promise.resolve());
  const movingRef = useRef(false);

  const addToAnimation = (p: () => Promise<unknown>, animate = true) => {
    const next = animationQueue.current
      .then(async () => {
        if (animate) {
          movingRef.current = true;
          setMoving(true);
          cardMotionState.moving[card.uuid] = true;
        }
        try {
          await p();
        } finally {
          if (animate) {
            movingRef.current = false;
            setMoving(false);
            delete cardMotionState.moving[card.uuid];
          }
        }
      })
      .catch((error) => {
        console.error("Card animation failed:", error);
      });
    animationQueue.current = next;
    return next;
  };

  const register = <T extends any[]>(
    task: Task,
    fn: (...args: T) => Promise<unknown>,
  ) => {
    return eventbus.register(
      task,
      async (uuid, ...rest: T) => {
        if (uuid === card.uuid) {
          await fn(...rest);
          return true;
        } else return false;
      },
      card.uuid,
    );
  };

  const queueMove = (options?: MoveOptions) =>
    addToAnimation(
      async () => {
        const plan = cardMotionPlan({
          ...options,
          toZone: card.location.zone,
          toPosition: card.location.position,
          mine: isMe(card.location.controller),
        });
        // Update arc ownership before starting the frame loop, rather than in a later render.
        element.current?.style.setProperty(
          "--move-arc",
          `${Math.min(24, plan.arc * 0.08)}px`,
        );
        setMotion(plan);
        await move({ card, api, options });
      },
      !options?.instant,
    );

  useEffect(() => {
    const unsubscribeMove = register(
      Task.Move,
      async (options?: MoveOptions) => {
        consumeCardOrigin(card.uuid);
        await queueMove(options);
      },
    );

    const unsubscribeFocus = register(
      Task.Focus,
      async (options?: { code?: number; kind?: "activate" | "confirm" }) => {
        await addToAnimation(async () => {
          const conceal = revealPublicCardFace(card.uuid, options?.code);
          setClassFocus(true);
          try {
            await focus({ card, api, kind: options?.kind });
          } finally {
            conceal();
            setClassFocus(false);
          }
        });
      },
    );

    const unsubscribeAttack = register(
      Task.Attack,
      async (options: AttackOptions) => {
        await addToAnimation(() => attack({ card, api, options }));
      },
    );
    const unsubscribeLand = register(
      Task.Land,
      async (options?: { strong?: boolean }) => {
        await addToAnimation(() => land({ api, strong: options?.strong }));
      },
    );
    return () => {
      unsubscribeMove();
      unsubscribeFocus();
      unsubscribeAttack();
      unsubscribeLand();
    };
  }, []);

  // <<< 动画 <<<

  const element = useRef<HTMLDivElement | null>(null);

  const lastHandOffset = useRef(hand.offset);
  useLayoutEffect(() => {
    if (lastHandOffset.current === hand.offset) return;
    lastHandOffset.current = hand.offset;
    if (
      card.location.zone === HAND &&
      isMe(card.location.controller) &&
      !movingRef.current
    ) {
      api.stop();
      api.set({ ...cardPose(card), subZ: 0 });
    }
  }, [hand.offset]);

  const endGesture = () => {
    if (handInteraction.dragging) suppressHandClick();
    handInteraction.dragging = false;
    gesture.current = undefined;
  };

  const onClick = () => {
    if (handCard && handClickSuppressed()) return;
    handInteraction.selected = handCard && mine ? card.uuid : "";
    inspectCardRelations(card);
    if (trySelectFieldCard(card.uuid)) {
      if (canInspect) displayCardModal(card);
      return;
    }
    const onCardClick = (card: CardType) => {
      // Card inspection and its available commands stay open on repeated clicks.
      displayCardModal(card);
      if (element.current) openCardActions([card], element.current);

      // 侧边栏展示超量素材信息
      const overlayMaterials = cardStore.findOverlay(
        card.location.zone,
        card.location.controller,
        card.location.sequence,
      );
      if (overlayMaterials.length > 0) {
        displayCardListModal({
          isZone: false,
          monster: card,
        });
      } else closeCardListModal();
    };

    const onFieldClick = (card: CardType) => {
      displayCardListModal({
        isZone: true,
        zone: card.location.zone,
        controller: card.location.controller,
      });
      // Collect this pile’s commands for its nearby action buttons.
      const cards = cardStore.at(card.location.zone, card.location.controller);
      if (element.current) openCardActions(cards, element.current);
    };

    if ([MZONE, SZONE, HAND].includes(card.location.zone)) {
      onCardClick(card);
    } else if ([EXTRA, GRAVE, REMOVED].includes(card.location.zone)) {
      onFieldClick(card);
    } else if (card.location.zone === DECK && element.current) {
      // The painted top card owns the hit area, including commands on buried cards.
      closeCardListModal();
      openCardActions(
        cardStore.at(DECK, card.location.controller),
        element.current,
      );
    }
  };
  // <<< 效果 <<<

  const location = snap.location;
  // Stacked zones use one aggregate frame in Bg, including buried cards.
  const actionHighlight = [MZONE, SZONE, HAND].includes(location.zone)
    ? getActionHighlight(snap.idleInteractivities)
    : undefined;
  const disabled = isCardDisabled(snap as CardType);
  const idleActions = snap.idleInteractivities
    .map(({ interactType }) => InteractType[interactType])
    .join(" ");
  const idleActionResponses = snap.idleInteractivities
    .map(
      ({ interactType, response }) =>
        `${InteractType[interactType]}:${response}`,
    )
    .join(" ");
  const idleActionSources = snap.idleInteractivities
    .map(
      ({ interactType, responseSource }) =>
        `${InteractType[interactType]}:${responseSource ?? "idle"}`,
    )
    .join(" ");
  const attackInteractivity = snap.idleInteractivities.find(
    ({ interactType }) => interactType === InteractType.ATTACK,
  );

  return (
    <animated.div
      ref={(node) => {
        element.current = node;
        registerCardElement(card.uuid, node);
      }}
      role="button"
      tabIndex={
        snap.selectInfo.selectable ||
        snap.selectInfo.selected ||
        snap.idleInteractivities.length
          ? 0
          : -1
      }
      aria-label={canInspect ? snap.meta.text.name || "卡片" : "背面卡片"}
      aria-pressed={snap.selectInfo.selected}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      data-testid="duel-card"
      data-card-uuid={snap.uuid}
      data-card-code={snap.code}
      data-card-controller={location.controller}
      data-card-zone={ygopro.CardZone[location.zone]}
      data-card-zone-value={location.zone}
      data-card-sequence={location.sequence}
      data-card-position={ygopro.CardPosition[location.position]}
      data-card-position-value={location.position}
      data-card-is-overlay={location.is_overlay}
      data-card-overlay-sequence={location.overlay_sequence}
      data-card-is-token={snap.isToken}
      data-card-status={snap.status}
      data-card-selectable={snap.selectInfo.selectable}
      data-card-selected={snap.selectInfo.selected}
      data-card-targeted={snap.targeted}
      data-card-disabled={disabled}
      data-card-in-motion={moving}
      data-card-move-kind={motion.kind}
      data-card-is-me={container.context.matStore.isMe(location.controller)}
      data-card-idle-actions={idleActions}
      data-card-action-highlight={actionHighlight ?? "none"}
      data-card-idle-responses={idleActionResponses}
      data-card-idle-response-sources={idleActionSources}
      data-card-attack-directable={attackInteractivity?.directAttackAble}
      className={classnames(styles["mat-card"], {
        [styles.selected]: snap.selectInfo.selected,
        [styles.actionsActive]: activeAction,
        [styles.handAppeal]: handCard && hand.selected === card.uuid,
      })}
      style={
        {
          transform: to(
            [spring.x, spring.y, spring.z, spring.rx, spring.rz, spring.scale],
            (x, y, z, rx, rz, scale) =>
              `translate3d(${x}px, ${y}px, ${
                moving && motion.kind !== "reflow" ? Math.max(z, 360) : z
              }px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${scale})`,
          ),
          "--z": spring.z,
          "--sub-z": spring.subZ.to(
            (progress) => Math.sin((Math.PI * progress) / 100) ** 2,
          ),
          "--move-arc": `${Math.min(24, motion.arc * 0.08)}px`,
          "--ry": spring.ry,
          "--hand-angle": spring.rz,
          zIndex:
            moving && motion.kind !== "reflow"
              ? 100
              : spring.zIndex.to(Math.round),
          opacity: spring.opacity,
        } as any as CSSProperties
      }
      onClick={onClick}
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          !handCard ||
          !mine ||
          moving ||
          cardStore.at(HAND, card.location.controller).length <= 10
        )
          return;
        gesture.current = {
          x: event.clientX,
          offset: handInteraction.offset,
          pointer: event.pointerId,
        };
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || event.pointerId !== start.pointer) return;
        const delta = event.clientX - start.x;
        if (!handInteraction.dragging && Math.abs(delta) < 8) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        handInteraction.dragging = true;
        handInteraction.selected = "";
        const stage = document.querySelector<HTMLElement>(
          '[data-testid="duel-stage"]',
        )!;
        const scale = stage.getBoundingClientRect().width / stage.clientWidth;
        const max =
          cardStore.at(HAND, card.location.controller).length * 30 * 0.76;
        handInteraction.offset = Math.max(
          -max,
          Math.min(max, start.offset + (delta / scale) * 0.76),
        );
      }}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <div
        className={classnames(styles["img-wrap"], {
          [styles.focusing]: classFocus,
        })}
      >
        <div className={styles["appeal-wrap"]}>
          <div className={styles["negation-wrap"]} data-card-negation-wrap>
            <YgoCard
              className={styles.cover}
              code={canInspect ? snap.code : publicFace ?? 0}
              name={canInspect ? snap.meta.text.name : "背面卡片"}
              urgent
              data-card-face
            />
            <YgoCard className={styles.back} isBack />
            <ActionFrame
              highlight={actionHighlight}
              className={styles["action-frame"]}
            />
            {(snap.selectInfo.selectable || snap.selectInfo.selected) && (
              <div aria-hidden="true" className={styles["selection-frame"]} />
            )}
          </div>
        </div>
      </div>
      {snap.targeted && <div className={styles.targeted} />}
    </animated.div>
  );
};

export const Card = React.memo(CardImpl);

const call =
  <Options,>(task: Task) =>
  (uuid: string, options?: Options extends undefined ? never : Options) =>
    eventbus.call(task, uuid, options);

export const callCardMove = call<MoveOptions>(Task.Move);
export const callCardFocus = call<{
  code?: number;
  kind?: "activate" | "confirm";
}>(Task.Focus);
export const callCardAttack = call<AttackOptions>(Task.Attack);
export const callCardLand = call<{ strong?: boolean }>(Task.Land);
