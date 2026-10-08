import { Button } from "antd";
import classnames from "classnames";
import { useEffect, useId, useState } from "react";
import { type INTERNAL_Snapshot as Snapshot, useSnapshot } from "valtio";

import { type CardMeta, fetchStrings, Region, ygopro } from "@/api";
import { cardStore, type CardType, isMe, matStore } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { closeCardActions } from "../../interaction/CardActions";
import { registerFieldSelection } from "../../interaction/fieldSelection";
import { selectionValid } from "../../interaction/selectionRules";
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
  onSubmit,
  onCancel,
  onFinish,
}: SelectCardsModalProps) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [effectCard, setEffectCard] = useState<string>();
  const [zone, setZone] = useState<number | undefined>();
  const promptId = useId();
  const hint = useSnapshot(matStore.hint);
  useEffect(() => {
    setChosen(isChain && selectables.length === 1 ? [0] : []);
    setEffectCard(undefined);
    setZone(selectables[0]?.location?.zone);
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
  useEffect(() => {
    if (!isOpen || !fieldSelection) return;
    closeCardActions();
    setDuelPrompt(promptId, true);
    const candidates = selectables.map((option) =>
      option.location
        ? cardStore.find(option.location as ygopro.CardLocation)
        : undefined,
    );
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
  }, [isOpen, fieldSelection, selectables, chosen]);
  const submit = () => {
    if (valid && isOpen) onSubmit([...mustSelects, ...options]);
  };
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
        确定{chosen.length ? ` (${chosen.length})` : ""}
      </Button>
    </div>
  );
  const title = `${hint.esHint ?? ""} ${
    hint.esSelectHint || (isChain ? "选择要发动的卡片" : "请选择卡片")
  } (${min === max ? min : `${min}–${max}`} 张)`;
  if (fieldSelection)
    return isOpen ? (
      <div
        className={styles.fieldPrompt}
        data-testid="duel-field-selection"
        role="region"
        aria-label={title}
      >
        <p>{title}</p>
        <span>点击场上的卡片选择，再点击确定</span>
        {footer}
      </div>
    ) : null;
  const zones = [
    ...new Set(selectables.map((option) => option.location?.zone)),
  ];
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
  ) => {
    const picked =
      alreadySelected ||
      effectCard === key ||
      indexes.some((idx) => chosen.includes(idx));
    const choose = () => {
      showCardModal(option);
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
          [styles.opponent]:
            option.location?.controller !== undefined &&
            !isMe(option.location.controller),
        })}
        aria-label={option.meta.text.name || "卡片"}
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
          if (alreadySelected && !single) return;
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
  return (
    <NeosModal
      title={title}
      width="min(680px, 94vw)"
      open={isOpen}
      footer={footer}
      afterClose={() => {
        if (!isOpen) {
          matStore.hint.esHint = undefined;
          matStore.hint.esSelectHint = undefined;
        }
      }}
    >
      <div
        data-testid="duel-select-cards-modal"
        data-select-min={min}
        data-select-max={max}
        data-select-single={single}
        data-select-is-chain={isChain}
        data-select-cancelable={cancelable}
        data-select-finishable={finishable}
      >
        {zones.length > 1 && (
          <nav className={styles.zones} aria-label="卡片区域">
            {zones.map((value) => (
              <button
                key={value ?? "unknown"}
                type="button"
                aria-pressed={zone === value}
                onClick={() => setZone(value)}
              >
                {value === undefined
                  ? "卡片"
                  : fetchStrings(Region.System, value + 1000)}
              </button>
            ))}
          </nav>
        )}
        <div className={styles.grid}>
          {[...groups]
            .filter(
              ([, indexes]) => selectables[indexes[0]].location?.zone === zone,
            )
            .map(([key, indexes]) =>
              cardButton(selectables[indexes[0]], indexes[0], indexes, key),
            )}
        </div>
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
          <>
            <p>必须使用的素材</p>
            <div className={styles.mandatory}>
              {mustSelects.map((option, index) => (
                <YgoCard
                  key={index}
                  code={option.meta.id}
                  width="3.5rem"
                  urgent
                />
              ))}
            </div>
          </>
        )}
        {!!selecteds.length && (
          <>
            <p>{single ? "已选择（点击取消选择）" : "已选择"}</p>
            <div className={styles.grid}>
              {selecteds.map((option, index) =>
                cardButton(option, index, [index], `selected:${index}`, true),
              )}
            </div>
          </>
        )}
      </div>
    </NeosModal>
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
