import { Button } from "antd";
import classnames from "classnames";
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
} from "react";
import { type INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { type CardMeta, fetchStrings, Region, ygopro } from "@/api";
import { cardStore, type CardType, isMe, matStore } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { closeCardActions } from "../../interaction/CardActions";
import { registerFieldSelection } from "../../interaction/fieldSelection";
import { useDuelRightClick } from "../../interaction/rightClick";
import { SelectionControls } from "../../interaction/SelectionControls";
import { selectionValid } from "../../interaction/selectionRules";
import { useHorizontalWheel } from "../../interaction/useHorizontalWheel";
import { ActionFrame } from "../../PlayMat/ActionFrame";
import type { ActionHighlight } from "../../utils/actionHighlight";
import { showCardModal } from "../CardModal";
import { NeosModal } from "../NeosModal";
import { setDuelPrompt } from "../session";
import styles from "./index.module.scss";

export interface SelectCardsModalProps {
  isOpen: boolean;
  min: number;
  max: number;
  single: boolean;
  selecteds: Snapshot<Option[]>;
  selectables: Snapshot<Option[]>;
  mustSelects: Snapshot<Option[]>;
  cancelable: boolean;
  finishable: boolean;
  totalLevels: number;
  overflow: boolean;
  isChain?: boolean;
  fieldSelection?: boolean;
  autoSubmit?: "max" | "sum";
  onSubmit: (options: Snapshot<Option[]>) => void;
  onCancel: () => void;
  onFinish: () => void;
}

const cardKey = (option: Snapshot<Option>) =>
  option.location
    ? `${option.location.controller}:${option.location.zone}:${
        option.location.sequence
      }:${option.location.is_overlay ? option.location.overlay_sequence : ""}`
    : `code:${option.meta.id}`;

export function SelectCardsModal({
  isOpen,
  min,
  max,
  single,
  selecteds,
  selectables,
  mustSelects,
  cancelable,
  finishable,
  totalLevels,
  overflow,
  isChain = false,
  fieldSelection = false,
  autoSubmit,
  onSubmit,
  onCancel,
  onFinish,
}: SelectCardsModalProps) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [effectCard, setEffectCard] = useState<string>();
  const promptId = useId();
  const hint = useSnapshot(matStore.hint);
  useLayoutEffect(() => {
    setChosen(isChain && selectables.length === 1 ? [0] : []);
    setEffectCard(undefined);
  }, [selectables, isOpen, isChain]);
  const options = chosen.map((index) => selectables[index]);
  const valid = selectionValid(
    options,
    mustSelects,
    min,
    max,
    single,
    totalLevels,
    overflow,
  );
  const toggle = (index: number) => {
    showCardModal(selectables[index]);
    setChosen((values) =>
      values.includes(index)
        ? values.filter((value) => value !== index)
        : single || max === 1
        ? [index]
        : values.length < max
        ? [...values, index]
        : values,
    );
  };
  useLayoutEffect(() => {
    if (!isOpen || !fieldSelection) return;
    closeCardActions();
    setDuelPrompt(promptId, true);
    const candidates = selectables.map((option) =>
      option.location
        ? cardStore.find(option.location as ygopro.CardLocation)
        : undefined,
    );
    mustSelects.forEach((option) => {
      const card = option.location
        ? cardStore.find(option.location as ygopro.CardLocation)
        : undefined;
      if (!card) return;
      card.selectInfo.selectable = false;
      card.selectInfo.selected = true;
      card.selectInfo.response = undefined;
    });
    candidates.forEach((card, index) => {
      if (!card) return;
      card.selectInfo.selectable = true;
      card.selectInfo.selected = chosen.includes(index);
      card.selectInfo.response = undefined;
    });
    const release = registerFieldSelection((uuid) => {
      const index = candidates.findIndex((card) => card?.uuid === uuid);
      if (index >= 0) toggle(index);
    });
    return () => {
      release();
      setDuelPrompt(promptId, false);
    };
  }, [isOpen, fieldSelection, selectables, mustSelects, chosen]);
  const submit = () => {
    if (valid && isOpen) onSubmit([...mustSelects, ...options]);
  };
  useDuelRightClick(
    isOpen && fieldSelection,
    () => {
      if (cancelable) onCancel();
      else if (finishable) onFinish();
    },
    250,
  );
  useEffect(() => {
    if (!isOpen || !fieldSelection || !valid) return;
    if (
      (autoSubmit === "max" && chosen.length >= max) ||
      (autoSubmit === "sum" && totalLevels > 0 && !overflow)
    )
      submit();
  }, [isOpen, fieldSelection, autoSubmit, valid, chosen]);
  const footer = (
    <div className={styles.footer}>
      {cancelable && (
        <Button data-testid="duel-select-card-cancel" onClick={onCancel}>
          取消
        </Button>
      )}
      {finishable && (
        <Button data-testid="duel-select-card-finish" onClick={onFinish}>
          完成选择
        </Button>
      )}
      <Button
        type="primary"
        data-testid="duel-select-card-submit"
        disabled={!valid}
        onClick={submit}
      >
        确认选择{chosen.length ? ` (${chosen.length})` : ""}
      </Button>
    </div>
  );
  const title = `${hint.esHint ?? ""} ${
    hint.esSelectHint || (isChain ? "选择要发动的卡片" : "请选择卡片")
  } (${min === max ? min : `${min}–${max}`} 张)`;
  if (fieldSelection)
    return isOpen ? (
      <SelectionControls title={title}>{footer}</SelectionControls>
    ) : null;
  const groups = new Map<string, number[]>();
  selectables.forEach((option, index) => {
    const key = isChain ? cardKey(option) : `option:${index}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  const effectOptions = effectCard ? groups.get(effectCard) ?? [] : [];
  const cardButton = (
    option: Snapshot<Option>,
    index: number,
    indexes = [index],
    key = `option:${index}`,
    alreadySelected = false,
    mandatory = false,
  ) => {
    const picked =
      alreadySelected ||
      effectCard === key ||
      indexes.some((idx) => chosen.includes(idx));
    const origin = originLabel(option);
    const choose = () => {
      showCardModal(option);
      if (mandatory) return;
      if (alreadySelected && single) {
        onSubmit([option]);
        return;
      }
      if (alreadySelected) return;
      if (isChain && indexes.length > 1) {
        setEffectCard(key);
        setChosen([]);
        return;
      }
      if (isChain) setEffectCard(undefined);
      toggle(index);
    };
    return (
      <button
        type="button"
        key={key}
        className={classnames(styles.cardButton, {
          [styles.selected]: picked,
        })}
        aria-label={`${option.meta.text.name || "卡片"}${
          origin ? `，${origin}` : ""
        }`}
        aria-pressed={picked}
        data-testid="duel-select-card-option"
        data-card-code={option.meta.id}
        data-card-controller={option.location?.controller}
        data-card-zone={
          option.location ? ygopro.CardZone[option.location.zone] : undefined
        }
        data-card-zone-value={option.location?.zone}
        data-card-sequence={option.location?.sequence}
        data-card-response={option.response}
        data-action-highlight={
          isChain ? "gold" : option.actionHighlight ?? "none"
        }
        onClick={choose}
        onDoubleClick={() => {
          if (mandatory || (alreadySelected && !single)) return;
          if (
            (single || max === 1) &&
            indexes.length === 1 &&
            selectionValid(
              [option],
              mustSelects,
              min,
              max,
              single,
              totalLevels,
              overflow,
            )
          )
            onSubmit([...mustSelects, option]);
        }}
      >
        <YgoCard
          code={option.meta.id}
          targeted={option.targeted}
          disabled={option.disabled}
          className={styles.card}
          urgent
        />
        <ActionFrame
          highlight={isChain ? "gold" : option.actionHighlight}
          className={styles.actionFrame}
        />
        <span className={styles.cardName}>{option.meta.text.name}</span>
        {picked && <b className={styles.check}>✓</b>}
        {indexes.length > 1 && (
          <b className={styles.effectCount}>{indexes.length} 个效果</b>
        )}
      </button>
    );
  };
  const candidates = [...groups].map(([key, indexes]) => ({
    option: selectables[indexes[0]],
    node: cardButton(selectables[indexes[0]], indexes[0], indexes, key),
  }));
  const mandatoryCards = mustSelects.map((option, index) => ({
    option,
    node: cardButton(option, index, [index], `mandatory:${index}`, true, true),
  }));
  const selectedCards = selecteds.map((option, index) => ({
    option,
    node: cardButton(option, index, [index], `selected:${index}`, true),
  }));
  return (
    <NeosModal
      title={title}
      duelPosition="selection"
      duelWidth={Math.min(
        1100,
        Math.max(
          650,
          stripWidth(candidates),
          stripWidth(mandatoryCards),
          stripWidth(selectedCards),
        ),
      )}
      open={isOpen}
      onDuelCancel={cancelable ? onCancel : finishable ? onFinish : undefined}
      footer={footer}
      afterClose={() => {
        if (!isOpen) {
          matStore.hint.esHint = undefined;
          matStore.hint.esSelectHint = undefined;
        }
      }}
    >
      <div
        className={styles.content}
        data-testid="duel-select-cards-modal"
        data-select-min={min}
        data-select-max={max}
        data-select-single={single}
        data-select-is-chain={isChain}
        data-select-cancelable={cancelable}
        data-select-finishable={finishable}
      >
        <CardStrip
          label="可选卡片"
          testId="duel-select-candidates"
          cards={candidates}
        />
        {effectOptions.length > 1 && (
          <div
            className={styles.effectOptions}
            role="group"
            aria-label="选择卡片效果"
          >
            <strong>
              {selectables[effectOptions[0]].meta.text.name} · 选择效果
            </strong>
            {effectOptions.map((index, order) => (
              <button
                type="button"
                key={index}
                data-testid="duel-chain-effect-option"
                data-card-response={selectables[index].response}
                aria-pressed={chosen.includes(index)}
                onClick={() => setChosen([index])}
              >
                {order + 1}. {selectables[index].effectDesc || "发动此效果"}
              </button>
            ))}
          </div>
        )}
        {!!mustSelects.length && (
          <section className={styles.section} aria-label="必须使用的素材">
            <h3>必须使用的素材</h3>
            <CardStrip
              label="必须使用的素材"
              testId="duel-select-mandatory"
              cards={mandatoryCards}
            />
          </section>
        )}
        {!!selecteds.length && (
          <section className={styles.section} aria-label="已选择的卡片">
            <h3>{single ? "已选择（点击取消选择）" : "已选择"}</h3>
            <CardStrip
              label="已选择的卡片"
              testId="duel-select-selected"
              cards={selectedCards}
            />
          </section>
        )}
      </div>
    </NeosModal>
  );
}

interface StripCard {
  option: Snapshot<Option>;
  node: ReactNode;
}

function originLabel(option: Snapshot<Option>) {
  const location = option.location;
  if (!location) return undefined;
  return `${isMe(location.controller) ? "我方" : "对方"} ${
    location.is_overlay
      ? "叠放素材"
      : fetchStrings(Region.System, location.zone + 1000)
  }`;
}

function groupOrigins(cards: StripCard[]) {
  const groups = new Map<
    string,
    { key: string; option: Snapshot<Option>; cards: StripCard[] }
  >();
  cards.forEach((card) => {
    const location = card.option.location;
    const key = location
      ? `${location.controller}:${location.zone}:${!!location.is_overlay}`
      : "unknown";
    let group = groups.get(key);
    if (!group) {
      group = { key, option: card.option, cards: [] };
      groups.set(key, group);
    }
    group.cards.push(card);
  });
  return [...groups.values()];
}

function stripWidth(cards: StripCard[]) {
  const groups = groupOrigins(cards);
  return (
    56 +
    Math.max(0, groups.length - 1) * 20 +
    groups.reduce(
      (width, group) =>
        width +
        group.cards.length * 126 +
        Math.max(0, group.cards.length - 1) * 20 +
        (group.option.location ? 26 : 0),
      0,
    )
  );
}

function CardStrip({
  cards,
  label,
  testId,
}: {
  cards: StripCard[];
  label: string;
  testId: string;
}) {
  const ref = useHorizontalWheel();
  return (
    <div
      ref={ref}
      className={styles.grid}
      role="group"
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
    >
      {groupOrigins(cards).map(({ key, option, cards }) =>
        option.location ? (
          <fieldset
            key={key}
            className={classnames(styles.originGroup, {
              [styles.opponent]: !isMe(option.location.controller),
            })}
            data-testid="duel-select-origin-group"
            data-origin-controller={option.location.controller}
            data-origin-zone={ygopro.CardZone[option.location.zone]}
            data-origin-overlay={!!option.location.is_overlay}
          >
            <legend className={styles.originTitle}>
              {originLabel(option)}
            </legend>
            <div className={styles.groupCards}>
              {cards.map((card) => card.node)}
            </div>
          </fieldset>
        ) : (
          <div key={key} className={styles.groupCards}>
            {cards.map((card) => card.node)}
          </div>
        ),
      )}
    </div>
  );
}

export interface Option {
  // card id
  meta: CardMeta;
  location?: ygopro.CardLocation;
  // 效果
  effectDesc?: string;
  // 作为素材的cost，比如同调召唤的星级
  level1?: number;
  level2?: number;
  response?: number;
  targeted?: boolean;
  disabled?: boolean;
  actionHighlight?: ActionHighlight;
  // 便于直接返回这个信息
  //
  // 尽量不要用这个字段
  card?: CardType;
}
