import React, { useEffect } from "react";
import { LoaderFunction, useNavigate, useSearchParams } from "react-router-dom";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { useEnv } from "@/hook";
import { AudioActionType, changeScene } from "@/infra/audio";
import { matStore, replayStore, SideStage, sideStore } from "@/stores";
import { warmDeckImages } from "@/ui/Shared/YgoCard/imageCache";

import {
  ActionHistory,
  Alert,
  AnnounceModal,
  CardListModal,
  CardModal,
  CheckCounterModal,
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
import { ChainDisplay } from "./PlayMat/ChainDisplay";

export const loader: LoaderFunction = async () => {
  // 更新场景
  changeScene(AudioActionType.BGM_DUEL);
  return null;
};

export const Component: React.FC = () => {
  const { stage } = useSnapshot(sideStore);
  const { duelEnd } = useSnapshot(matStore);
  const navigate = useNavigate();

  // 如果处于开发时的本地文件回放模式，则重新跳回Match且保持record参数，从而开始下一轮播放
  const [searchParams] = useSearchParams();
  const { DEV } = useEnv();
  const RECORD = "record";

  useEffect(() => () => resetDuelDialogs(), []);

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
    <>
      <Underlying />
      <SelectActionsModal />
      <Alert />
      <Menu />
      <LifeBar />
      <Mat />
      <CardModal />
      <CardListModal />
      <HintNotification />
      <YesNoModal />
      <PositionModal />
      <OptionModal />
      <CheckCounterModal />
      <SortCardModal />
      <SimpleSelectCardsModal />
      <AnnounceModal />
      <EndModal />
      <ChatBox />
      <HandChain />
      <ChainDisplay />
      <ActionHistory />
    </>
  );
};
Component.displayName = "NeosDuel";
