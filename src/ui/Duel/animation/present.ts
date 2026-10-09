import { proxy } from "valtio";

import { fetchCard, ygopro } from "@/api";
import { getPresentationMessage } from "@/api/ocgcore/ocgAdapter/stoc/stocGameMsg/presentation";
import {
  TYPE_FUSION,
  TYPE_LINK,
  TYPE_PENDULUM,
  TYPE_RITUAL,
  TYPE_SYNCHRO,
  TYPE_TOKEN,
  TYPE_XYZ,
} from "@/common";
import type { Container } from "@/container";
import { isCurrentUIContainer } from "@/container/compat";
import { AudioActionType, playEffect } from "@/infra/audio";
import { cardStore, type CardType } from "@/stores";
import { callCardAttack } from "@/ui/Duel/PlayMat/Card";

import {
  type DuelCue,
  duelTimeline,
  emitDuelCue,
  measureCard,
  type Point,
  revealDuelCue,
  showDuelResolution,
} from "./runtime";

const { HAND, MZONE, SZONE, GRAVE, REMOVED, DECK, EXTRA, EMPTY } =
  ygopro.CardZone;
const names: Record<number, string> = {
  [HAND]: "手牌",
  [MZONE]: "怪兽区",
  [SZONE]: "魔陷区",
  [GRAVE]: "墓地",
  [REMOVED]: "除外区",
  [DECK]: "卡组",
  [EXTRA]: "额外卡组",
};
export const combatPresentation = proxy({
  relations: [] as { from: Point; to: Point; equip: boolean }[],
  attack: undefined as
    | { from: Point; to: Point; direct: boolean; tone: string }
    | undefined,
});
const attributeTones: Record<number, string> = {
  1: "#d6aa6c",
  2: "#67c9ff",
  4: "#ff865d",
  8: "#80e1b5",
  16: "#fff3ae",
  32: "#c897ff",
  64: "#ffcf69",
};
let summonMaterials: number[] = [];
let pendulumSummon = false;
const isChainReveal = (cue: DuelCue) =>
  ["activate", "chain", "resolve"].includes(cue.kind);

export function summonType(type: number): DuelCue["summonType"] {
  if (type & TYPE_LINK) return "link";
  if (type & TYPE_XYZ) return "xyz";
  if (type & TYPE_SYNCHRO) return "synchro";
  if (type & TYPE_FUSION) return "fusion";
  if (type & TYPE_RITUAL) return "ritual";
  if (type & TYPE_PENDULUM) return "pendulum";
  return "normal";
}
export function resetCombatPresentation() {
  combatPresentation.attack = undefined;
  combatPresentation.relations = [];
  summonMaterials = [];
  pendulumSummon = false;
}
export function inspectCardRelations(card: CardType) {
  const from = measureCard(card.uuid);
  combatPresentation.relations = [];
  if (!from) return;
  const add = (target: ygopro.CardLocation, equip: boolean) => {
    const to = measureCard(cardStore.find(target)?.uuid);
    if (to) combatPresentation.relations.push({ from, to, equip });
  };
  if (card.equipTarget) add(card.equipTarget, true);
  card.effectTargets?.forEach((target) => add(target, false));
  for (const other of cardStore.inner)
    if (
      other.equipTarget &&
      cardStore.find(other.equipTarget)?.uuid === card.uuid
    ) {
      const otherPoint = measureCard(other.uuid);
      if (otherPoint)
        combatPresentation.relations.push({
          from: otherPoint,
          to: from,
          equip: true,
        });
    }
}

/** Capture source positions BEFORE the rules store moves/removes a card. */
export function presentGameMessage(
  container: Container,
  msg: ygopro.StocGameMessage,
): boolean {
  if (!isCurrentUIContainer(container)) return false;
  const context = container.context;
  const point = (location: ygopro.CardLocation) =>
    measureCard(
      context.cardStore.find(location)?.uuid,
      `${location.controller}:${location.zone}`,
    );
  const playerPoint = (controller: number): Point => ({
    x: window.innerWidth / 2,
    y: window.innerHeight * (context.matStore.isMe(controller) ? 0.92 : 0.1),
    width: 100,
    height: 50,
  });
  const source = (location: ygopro.CardLocation) =>
    `${context.matStore.isMe(location.controller) ? "我方" : "对方"}${
      names[location.zone] ?? "场上"
    }`;
  const notification = getPresentationMessage(msg);
  if (notification) {
    if (notification.kind === "battle") {
      const attacker = context.cardStore.find(notification.attacker);
      const target = context.cardStore.find(notification.target);
      const direct = notification.target.zone === EMPTY;
      if (attacker) {
        attacker.meta.data.atk = notification.attackerAttack;
        attacker.meta.data.def = notification.attackerDefense;
      }
      if (target) {
        target.meta.data.atk = notification.targetAttack;
        target.meta.data.def = notification.targetDefense;
      }
      const tone = attributeTones[attacker?.meta.data.attribute ?? 0];
      resetCombatPresentation();
      if (attacker) {
        playEffect(
          direct
            ? AudioActionType.SOUND_DIRECT_ATTACK
            : AudioActionType.SOUND_ATTACK,
        );
        void callCardAttack(
          attacker.uuid,
          direct
            ? { directAttack: true }
            : { directAttack: false, target: notification.target },
        );
        emitDuelCue(
          {
            kind: "impact",
            point: direct
              ? playerPoint(1 - notification.attacker.controller)
              : measureCard(target?.uuid),
            tone,
          },
          700,
        );
      }
    } else if (notification.kind === "damage-end") resetCombatPresentation();
    else if ("index" in notification) {
      const detail = context.matStore.chainDetails.find(
        (entry) => entry.index === notification.index,
      );
      if (detail) {
        if (notification.kind === "solving") {
          for (const entry of context.matStore.chainDetails)
            entry.resolving = entry.id === detail.id && !entry.resolved;
          if (!detail.negated && !detail.resolved)
            showDuelResolution({
              kind: "resolve",
              code: detail.code,
              index: detail.index,
              chainId: detail.id,
              label: "连锁结算",
              opponent: !context.matStore.isMe(detail.controller),
              source: `${
                context.matStore.isMe(detail.controller) ? "我方" : "对方"
              }${names[detail.zone]}`,
            });
          else duelTimeline.discardReveals(isChainReveal);
        } else if (
          notification.kind === "negated" ||
          notification.kind === "disabled"
        ) {
          if (detail.negated) return true;
          detail.negated = true;
          detail.negation =
            notification.kind === "negated" ? "activation" : "effect";
          duelTimeline.discardReveals(
            (cue) => cue.kind === "resolve" && cue.chainId === detail.id,
          );
          const card = context.cardStore.inner.find(
            (entry) => entry.uuid === detail.cardUuid,
          );
          const knownFace =
            detail.code > 0 &&
            card &&
            (card.code === detail.code ||
              (card.code === 0 && card.meta.id === detail.code));
          // MDPro3 AnimationNegate acts on the source card, outside the chain cut-in.
          // Identity comes only from this publicly revealed chain link.
          emitDuelCue(
            {
              kind: "negate",
              code: detail.code,
              cardUuid: knownFace ? card.uuid : undefined,
              index: detail.index,
              negation: detail.negation,
              point: measureCard(
                knownFace ? card.uuid : undefined,
                `${card?.location.controller ?? detail.controller}:${
                  card?.location.zone ?? detail.zone
                }`,
              ),
            },
            1000,
          );
        } else if (notification.kind === "chained" && detail.index > 1) {
          const previous = context.matStore.chainDetails.find(
            (entry) => entry.index === detail.index - 1,
          );
          const pair = {
            kind: "chain",
            code: detail.code,
            index: detail.index,
            chainId: detail.id,
            previousCode: previous?.code,
            previousIndex: previous?.index,
            label: "CHAIN",
            opponent: !context.matStore.isMe(detail.controller),
          } as const;
          if (
            !duelTimeline.reviseReveal(
              (cue) => cue.kind === "activate" && cue.chainId === detail.id,
              pair,
            )
          )
            revealDuelCue(pair, 650);
        }
      }
    }
    return true;
  }
  switch (msg.gameMsg) {
    case "attack": {
      const event = msg.attack;
      const attacker = context.cardStore.find(event.attacker_location);
      const from = point(event.attacker_location);
      const to = event.direct_attack
        ? playerPoint(1 - event.attacker_location.controller)
        : point(event.target_location);
      if (from && to)
        combatPresentation.attack = {
          from,
          to,
          direct: event.direct_attack,
          tone: attributeTones[attacker?.meta.data.attribute ?? 0] ?? "#ffe09c",
        };
      break;
    }
    case "attack_disable":
      resetCombatPresentation();
      break;
    case "new_phase": {
      resetCombatPresentation();
      const phase = msg.new_phase.phase_type;
      const phases = ygopro.StocGameMessage.MsgNewPhase.PhaseType;
      const label = (
        {
          [phases.DRAW]: "DRAW PHASE",
          [phases.STANDBY]: "STANDBY PHASE",
          [phases.MAIN1]: "MAIN PHASE 1",
          [phases.BATTLE_START]: "BATTLE PHASE",
          [phases.BATTLE_STEP]: "BATTLE PHASE",
          [phases.MAIN2]: "MAIN PHASE 2",
          [phases.END]: "END PHASE",
        } as Record<number, string>
      )[phase];
      if (label) emitDuelCue({ kind: "phase", label }, 800);
      break;
    }
    case "new_turn":
      emitDuelCue(
        {
          kind: "turn",
          label: `${
            context.matStore.isMe(msg.new_turn.player)
              ? "YOUR TURN"
              : "OPPONENT'S TURN"
          } · ${context.matStore.turnCount + 1}`,
          opponent: !context.matStore.isMe(msg.new_turn.player),
        },
        950,
      );
      break;
    case "move": {
      combatPresentation.relations = [];
      const { from, to, reason } = msg.move;
      const at = point(from);
      if (
        reason & 8 &&
        msg.move.code > 0 &&
        !from.is_overlay &&
        (from.zone !== to.zone || to.is_overlay)
      )
        summonMaterials = [...summonMaterials, msg.move.code].slice(-6);
      if (reason & 1)
        emitDuelCue({ kind: "destroy", point: at, label: "破坏" }, 650);
      else if (reason & 8)
        emitDuelCue({ kind: "material", point: at, label: "素材" }, 550);
      else if (reason & 2)
        emitDuelCue({ kind: "release", point: at, label: "解放" }, 550);
      if (to.zone === GRAVE || to.zone === REMOVED)
        emitDuelCue(
          {
            kind: to.zone === GRAVE ? "grave" : "banish",
            point: measureCard(undefined, `${to.controller}:${to.zone}`),
            label: to.zone === GRAVE ? "送墓" : "除外",
          },
          650,
        );
      else if ((to.zone === DECK || to.zone === EXTRA) && from.zone !== to.zone)
        emitDuelCue(
          {
            kind: "return",
            point: measureCard(undefined, `${to.controller}:${to.zone}`),
            label: "返回卡组",
          },
          500,
        );
      break;
    }
    case "draw":
      emitDuelCue(
        {
          kind: "draw",
          point: measureCard(undefined, `${msg.draw.player}:${DECK}`),
        },
        500,
      );
      break;
    case "summoning":
    case "sp_summoning":
    case "flip_summoning": {
      const event =
        msg.gameMsg === "summoning"
          ? msg.summoning
          : msg.gameMsg === "sp_summoning"
          ? msg.sp_summoning
          : msg.flip_summoning;
      const kind =
        msg.gameMsg === "sp_summoning"
          ? "special"
          : msg.gameMsg === "flip_summoning"
          ? "flip"
          : "summon";
      const meta = fetchCard(event.code);
      const type = pendulumSummon
        ? "pendulum"
        : summonMaterials.length
        ? summonType(meta.data.type ?? 0)
        : "normal";
      playEffect(
        meta.data.type && meta.data.type & TYPE_TOKEN
          ? AudioActionType.SOUND_TOKEN
          : kind === "special"
          ? AudioActionType.SOUND_SPECIAL_SUMMON
          : kind === "flip"
          ? AudioActionType.SOUND_FILP
          : AudioActionType.SOUND_SUMMON,
      );
      const facedown = [
        ygopro.CardPosition.FACEDOWN,
        ygopro.CardPosition.FACEDOWN_ATTACK,
        ygopro.CardPosition.FACEDOWN_DEFENSE,
      ].includes(event.location.position);
      const titles = {
        fusion: "融合召唤",
        synchro: "同调召唤",
        xyz: "超量召唤",
        link: "连接召唤",
        ritual: "仪式召唤",
        pendulum: "灵摆召唤",
        normal: "特殊召唤",
      };
      emitDuelCue(
        {
          kind,
          point: point(event.location),
          summonType: type,
          label:
            kind === "special"
              ? titles[type!]
              : kind === "flip"
              ? "反转召唤"
              : "通常召唤",
        },
        750,
      );
      if (kind === "special" && type !== "normal" && !facedown)
        revealDuelCue(
          {
            kind: "special",
            code: event.code,
            label: titles[type!],
            summonType: type,
            opponent: !context.matStore.isMe(event.location.controller),
            source: source(event.location),
            materialCodes: [...summonMaterials],
          },
          900,
        );
      if (kind === "special") summonMaterials = [];
      break;
    }
    case "set":
      emitDuelCue(
        { kind: "set", point: point(msg.set.location), label: "盖放" },
        450,
      );
      break;
    case "pos_change": {
      const info = msg.pos_change.card_info;
      emitDuelCue(
        {
          kind: "position",
          point: measureCard(
            context.cardStore.at(info.location, info.controller, info.sequence)
              ?.uuid,
          ),
          label: [
            ygopro.CardPosition.FACEUP_DEFENSE,
            ygopro.CardPosition.FACEDOWN_DEFENSE,
          ].includes(msg.pos_change.cur_position)
            ? "守备表示"
            : "攻击表示",
        },
        500,
      );
      break;
    }
    case "select_idle_cmd":
      summonMaterials = [];
      pendulumSummon = false;
      break;
    case "become_target": {
      const targets = msg.become_target.locations;
      const phases = ygopro.StocGameMessage.MsgNewPhase.PhaseType;
      if (
        targets.length === 2 &&
        context.matStore.chains.length === 0 &&
        [phases.MAIN1, phases.MAIN2].includes(
          context.matStore.phase.currentPhase,
        ) &&
        targets[0].controller === targets[1].controller &&
        targets.every(
          (location) =>
            location.zone === SZONE &&
            [0, 4, 6, 7].includes(location.sequence) &&
            !!(
              (context.cardStore.find(location)?.meta.data.type ?? 0) &
              TYPE_PENDULUM
            ),
        )
      ) {
        pendulumSummon = true;
        emitDuelCue(
          { kind: "special", label: "PENDULUM SUMMON", summonType: "pendulum" },
          1000,
        );
      }
      msg.become_target.locations.forEach((location) =>
        emitDuelCue(
          { kind: "target", point: point(location), label: "效果对象" },
          700,
        ),
      );
      break;
    }
    case "chaining": {
      const event = msg.chaining;
      summonMaterials = [];
      revealDuelCue({
        kind: "activate",
        code: event.code,
        index: context.matStore.chains.length + 1,
        chainId: context.matStore.chainEventId + 1,
        label: "效果发动",
        source: source(event.location),
        opponent: !context.matStore.isMe(event.location.controller),
      });
      emitDuelCue({ kind: "activate", point: point(event.location) }, 900);
      break;
    }
    case "chain_solved": {
      const detail = context.matStore.chainDetails.find(
        (entry) => entry.index === msg.chain_solved.solved_index,
      );
      if (detail)
        duelTimeline.discardReveals(
          (cue) => isChainReveal(cue) && cue.chainId === detail.id,
        );
      break;
    }
    case "chain_end":
      duelTimeline.discardReveals(isChainReveal);
      break;
    case "confirm_cards":
      msg.confirm_cards.cards.forEach((card) =>
        revealDuelCue(
          {
            kind: "reveal",
            code: card.code,
            label: "卡片确认",
            source: `${
              context.matStore.isMe(card.controller) ? "我方" : "对方"
            }${names[card.location]}`,
          },
          850,
        ),
      );
      break;
    case "shuffle_deck":
      emitDuelCue(
        {
          kind: "shuffle",
          point: measureCard(undefined, `${msg.shuffle_deck.player}:${DECK}`),
          label: "洗切",
        },
        550,
      );
      break;
    case "shuffle_hand_extra":
      emitDuelCue({ kind: "shuffle", label: "卡片洗切" }, 450);
      break;
    case "update_hp": {
      const event = msg.update_hp;
      const recover =
        event.type_ === ygopro.StocGameMessage.MsgUpdateHp.ActionType.RECOVER;
      emitDuelCue(
        {
          kind: "life",
          label: `${recover ? "+" : "−"}${event.value}`,
          tone: recover ? "#83f7bf" : "#ff8b83",
          point: playerPoint(event.player),
        },
        1100,
      );
      break;
    }
    case "win":
      resetCombatPresentation();
      emitDuelCue(
        {
          kind: "result",
          label:
            msg.win.win_player > 1
              ? "DRAW"
              : context.matStore.isMe(msg.win.win_player)
              ? "VICTORY"
              : "DEFEAT",
        },
        1800,
      );
      break;
  }
  return false;
}
