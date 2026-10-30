import React, { useEffect, useRef } from "react";
import { LoaderFunction, useNavigate, useSearchParams } from "react-router-dom";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { useEnv } from "@/hook";
import { AudioActionType, changeScene } from "@/infra/audio";
import { matStore, replayStore, SideStage, sideStore } from "@/stores";
import { warmDeckImages } from "@/ui/Shared/YgoCard/imageCache";

import { DuelEffects } from "./animation/Effects";
import { CardActions, closeCardActions } from "./interaction/CardActions";
import { handInteraction, suppressHandClick } from "./interaction/hand";
import { IncrementalSelectionControls } from "./interaction/IncrementalSelectionControls";
import { useDuelRightClick } from "./interaction/rightClick";
import { FieldInfo } from "./layout/FieldInfo";
import layoutStyles from "./layout/index.module.scss";
import { useDuelCamera } from "./layout/viewport";
import {
  ActionHistory,
  Alert,
  AnnounceModal,
  CardListModal,
  CardModal,
  CheckCounterModal,
  closeCardListModal,
  closeCardModal,
  ConfirmCardsModal,
  EndModal,
  HintNotification,
  OptionModal,
  PositionModal,
  SelectActionsModal,
  SimpleSelectCardsModal,
  SortCardModal,
  YesNoModal,
} from "./Message";
import { resetDuelDialogs } from "./Message/reset";
import { ChatBox, HandChain, LifeBar, Mat, Menu, Underlying } from "./PlayMat";

export const loader: LoaderFunction = async () => {
  // 更新场景
  changeScene(AudioActionType.BGM_DUEL);
  return null;
};

export const Component: React.FC = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  useDuelCamera(stageRef);
  const { stage } = useSnapshot(sideStore);
  const { duelEnd } = useSnapshot(matStore);
  const navigate = useNavigate();

  // 如果处于开发时的本地文件回放模式，则重新跳回Match且保持record参数，从而开始下一轮播放
  const [searchParams] = useSearchParams();
  const { DEV } = useEnv();
  const RECORD = "record";

  useDuelRightClick(
    true,
    () => {
      closeCardActions();
      closeCardModal();
      closeCardListModal();
    },
    0,
  );
  useEffect(() => () => resetDuelDialogs(), []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        !(event.target as Element)?.closest?.(
          '[data-testid="duel-card"], [data-testid="duel-card-actions"]',
        )
      )
        handInteraction.selected = "";
    };
    const release = () => {
      if (handInteraction.dragging) suppressHandClick();
      handInteraction.dragging = false;
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("pointerup", release);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("pointerup", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  useEffect(() => {
    if (
      replayStore.isReplay ||
      matStore.selfType === ygopro.StocTypeChange.SelfType.OBSERVER
    )
      return;
    try {
      const deck = sideStore.getSideDeck();
      if (deck.main.length || deck.extra.length)
        return warmDeckImages([...deck.main, ...deck.extra]);
    } catch (error) {
      console.warn("Unable to warm selected deck artwork", error);
    }
  }, []);

  useEffect(() => {
    if (!DEV) return;
    const recordName = searchParams.get(RECORD);
    if (
      recordName &&
      matStore.selfType === ygopro.StocTypeChange.SelfType.UNKNOWN
    ) {
      navigate(`/match?${new URLSearchParams({ [RECORD]: recordName })}`);
    }
  }, []);

  useEffect(() => {
    if (stage === SideStage.SIDE_CHANGING) {
      // 跳转更换Side
      navigate("/side");
    }
  }, [stage]);

  useEffect(() => {
    if (duelEnd) {
      // 决斗结束，返回匹配页
      navigate("/match");
    }
  }, [duelEnd]);

  return (
    <div
      className={layoutStyles.stage}
      ref={stageRef}
      data-testid="duel-stage"
      data-layout="mdpro3"
      aria-label="决斗场地"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        closeCardModal();
        closeCardListModal();
      }}
    >
      <Underlying />
      <SelectActionsModal />
      <Alert />
      <Menu />
      <IncrementalSelectionControls />
      <LifeBar />
      <Mat />
      <FieldInfo />
      <DuelEffects />
      <CardActions />
      <CardModal />
      <CardListModal />
      <HintNotification />
      <YesNoModal />
      <PositionModal />
      <OptionModal />
      <CheckCounterModal />
      <ConfirmCardsModal />
      <SortCardModal />
      <SimpleSelectCardsModal />
      <AnnounceModal />
      <EndModal />
      <ChatBox />
      <HandChain />
      <ActionHistory />
    </div>
  );
};
Component.displayName = "NeosDuel";
