import { animated, to, useSpring } from "@react-spring/web";
import classnames from "classnames";
import React, { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { sendSelectMultiResponse, ygopro } from "@/api";
import { getUIContainer } from "@/container/compat";
import { eventbus, Task } from "@/infra";
import { cardStore, CardType, InteractType, isCardDisabled } from "@/stores";
import { showCardModal as displayCardModal } from "@/ui/Duel/Message/CardModal";
import { YgoCard } from "@/ui/Shared";

import { consumeCardOrigin } from "../../animation/origins";
import { inspectCardRelations } from "../../animation/present";
import { registerCardElement } from "../../animation/runtime";
import {
  openCardActions,
  useCardActionActive,
} from "../../interaction/CardActions";
import { trySelectFieldCard } from "../../interaction/fieldSelection";
import { displayCardListModal } from "../../Message";
import { clearSelectInfo } from "../../utils";
import { getActionHighlight } from "../../utils/actionHighlight";
import { ActionFrame } from "../ActionFrame";
import styles from "./index.module.scss";
import {
  attack,
  type AttackOptions,
  focus,
  move,
  type MoveOptions,
} from "./springs";
import type { SpringApiProps } from "./springs/types";

const { HAND, GRAVE, REMOVED, EXTRA, MZONE, SZONE } = ygopro.CardZone;

const CardImpl: React.FC<{ idx: number }> = ({ idx }) => {
  const container = getUIContainer();
  const card = cardStore.inner[idx];
  const snap = useSnapshot(card);
  const activeAction = useCardActionActive(card.uuid);

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
        focusScale: 1,
        focusDisplay: "none",
        focusOpacity: 1,
        subZ: 0,
        opacity: 1,
      }) satisfies SpringApiProps,
  );

  // A promoted deck card retains its source; other mounts settle at their actual location.
  useEffect(() => {
    const origin = consumeCardOrigin(card.uuid);
    addToAnimation(async () => {
      if (origin) {
        await move({
          card: { ...card, location: origin },
          api,
          options: { instant: true },
        });
        await move({ card, api, options: { fromZone: origin.zone } });
      } else await move({ card, api, options: { instant: true } });
    });
  }, []);

  const [classFocus, setClassFocus] = useState(false);

  // >>> 动画 >>>
  /** 一次动画失败也不能阻塞这张卡之后的所有操作。 */
  const animationQueue = useRef(Promise.resolve());

  const addToAnimation = (p: () => Promise<unknown>) => {
    const next = animationQueue.current
      .then(async () => {
        await p();
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

  useEffect(() => {
    const unsubscribeMove = register(
      Task.Move,
      async (options?: MoveOptions) => {
        consumeCardOrigin(card.uuid);
        await addToAnimation(() => move({ card, api, options }));
      },
    );

    const unsubscribeFocus = register(Task.Focus, async () => {
      await addToAnimation(async () => {
        setClassFocus(true);
        try {
          await focus({ card, api });
        } finally {
          setClassFocus(false);
        }
      });
    });

    const unsubscribeAttack = register(
      Task.Attack,
      async (options: AttackOptions) => {
        await addToAnimation(() => attack({ card, api, options }));
      },
    );
    return () => {
      unsubscribeMove();
      unsubscribeFocus();
      unsubscribeAttack();
    };
  }, []);

  // <<< 动画 <<<

  const element = useRef<HTMLDivElement | null>(null);

  const onClick = () => {
    inspectCardRelations(card);
    if (trySelectFieldCard(card.uuid)) {
      displayCardModal(card);
      return;
    }
    const onCardClick = (card: CardType) => {
      const selectInfo = card.selectInfo;
      if (selectInfo.selectable || selectInfo.selected) {
        if (selectInfo.response !== undefined) {
          sendSelectMultiResponse(container.conn, [selectInfo.response]);
          clearSelectInfo();
          return;
        } else {
          console.error("card is selectable but the response is undefined!");
        }
      }

      // 中央弹窗展示选中卡牌信息
      // TODO: 同一张卡片，是否重复点击会关闭CardModal？
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
      }
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
      aria-label={snap.meta.text.name || "卡片"}
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
      data-card-is-me={container.context.matStore.isMe(location.controller)}
      data-card-idle-actions={idleActions}
      data-card-action-highlight={actionHighlight ?? "none"}
      data-card-idle-responses={idleActionResponses}
      data-card-idle-response-sources={idleActionSources}
      data-card-attack-directable={attackInteractivity?.directAttackAble}
      className={classnames(styles["mat-card"], {
        [styles.selected]: snap.selectInfo.selected,
        [styles.actionsActive]: activeAction,
      })}
      style={
        {
          transform: to(
            [spring.x, spring.y, spring.rx, spring.rz, spring.scale],
            (x, y, rx, rz, scale) =>
              `translate(${x}px, ${y}px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${scale})`,
          ),
          "--z": spring.z,
          "--sub-z": spring.subZ.to([0, 50, 100], [0, 200, 0]), // 中间高，两边低
          "--ry": spring.ry,
          "--hand-angle": spring.rz,
          zIndex: spring.zIndex,
          "--focus-scale": spring.focusScale,
          "--focus-display": spring.focusDisplay,
          "--focus-opacity": spring.focusOpacity,
          opacity: spring.opacity,
        } as any as CSSProperties
      }
      onClick={onClick}
    >
      <div className={styles.focus} />
      <div
        className={classnames(styles["img-wrap"], {
          [styles.focusing]: classFocus,
        })}
      >
        <YgoCard
          className={styles.cover}
          code={snap.code === 0 ? snap.meta.id : snap.code}
          name={snap.meta.text.name}
          disabled={disabled}
          urgent
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
export const callCardFocus = call(Task.Focus);
export const callCardAttack = call<AttackOptions>(Task.Attack);
