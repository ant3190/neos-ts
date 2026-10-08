import { CheckCircleFilled, LoadingOutlined } from "@ant-design/icons";

import {
  sendChat,
  sendHandResult,
  sendHsNotReady,
  sendHsReady,
  sendHsStart,
  sendHsToDuelList,
  sendHsToObserver,
  sendTpResult,
  sendUpdateDeck,
  ygopro,
} from "@/api";
import PlayerState = ygopro.StocHsPlayerChange.State;
import SelfType = ygopro.StocTypeChange.SelfType;
import { App, Avatar, Button, Skeleton, Space } from "antd";
import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoaderFunction, useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { useConfig } from "@/config";
import { getUIContainer } from "@/container/compat";
import { AudioActionType, changeScene } from "@/infra/audio";
import { closeSocket } from "@/middleware/socket";
import {
  accountStore,
  deckStore,
  IDeck,
  Player,
  resetUniverse,
  RoomStage,
  roomStore,
  sideStore,
} from "@/stores";
import { Background, IconFont, Select, SpecialButton } from "@/ui/Shared";
import { warmDeckImages } from "@/ui/Shared/YgoCard/imageCache";

import { Chat } from "./Chat";
import styles from "./index.module.scss";
import { Mora, MoraPopover, Tp, TpPopover } from "./Popover";

const NeosConfig = useConfig();

export const loader: LoaderFunction = async () => {
  // 更新场景
  changeScene(AudioActionType.BGM_MENU);
  return null;
};

export const Component: React.FC = () => {
  const container = getUIContainer();
  const { t: i18n } = useTranslation("WaitRoom");
  const { message } = App.useApp();
  const { user } = useSnapshot(accountStore);
  const [collapsed, setCollapsed] = useState(false);
  const { decks } = useSnapshot(deckStore);
  const [selectedDeckName, setSelectedDeckName] = useState<string | undefined>(
    () => roomStore.preferredDeckName,
  );
  const deck =
    deckStore.get(selectedDeckName ?? "") ??
    deckStore.get(decks[0]?.deckName ?? "");
  const room = useSnapshot(roomStore);
  const { errorMsg } = room;
  const me = room.getMePlayer();
  const op = room.getOpPlayer();
  const navigate = useNavigate();
  const startedSingleDuel = useRef(false);
  const requestedSingleBot = useRef(false);

  useEffect(() => {
    if (deck) return warmDeckImages([...deck.main, ...deck.extra]);
  }, [deck?.deckName]);

  const updateDeck = (deck: IDeck) => {
    sendUpdateDeck(container.conn, deck);
    // 设置side里面的卡组
    sideStore.setSideDeck(deck);
  };

  const onDeckSelected = (deckName: string) => {
    const newDeck = deckStore.get(deckName);
    if (newDeck) {
      if (me?.state === PlayerState.READY) sendHsNotReady(container.conn);
      setSelectedDeckName(deckName);
      roomStore.preferredDeckName = deckName;
    } else {
      message.error(`Deck ${deckName} not found`);
    }
  };

  const onReady = () => {
    if (me?.state === PlayerState.NO_READY) {
      if (deck) {
        updateDeck(deck);
        sendHsReady(container.conn);
        if (
          roomStore.singlePlayer &&
          !roomStore.getOpPlayer() &&
          !requestedSingleBot.current
        ) {
          requestedSingleBot.current = true;
          // SRVPro matches supplied AI names exactly. Let the server choose a
          // currently available public bot instead of hard-coding a nickname.
          sendChat(container.conn, "/ai");
        }
      } else {
        message.error("请先选择卡组");
      }
    } else {
      sendHsNotReady(container.conn);
    }
  };

  useEffect(() => {
    // 卡组异步加载后，及切换卡组时发送更新包。
    //
    // 否则娱乐匹配准备会有问题（原因不明）
    if (deck) updateDeck(deck);
  }, [deck?.deckName, container.conn]);
  useEffect(() => {
    if (!room.singlePlayer || room.stage !== RoomStage.WAITING) return;
    const bothReady =
      room.isHost &&
      me?.state === PlayerState.READY &&
      op?.state === PlayerState.READY;
    if (!bothReady) {
      startedSingleDuel.current = false;
    } else if (!startedSingleDuel.current) {
      startedSingleDuel.current = true;
      sendHsStart(container.conn);
    }
  }, [room.singlePlayer, room.stage, room.isHost, me?.state, op?.state]);
  useEffect(() => {
    if (room.stage === RoomStage.DUEL_START) {
      // 决斗开始，跳转决斗页面
      navigate("/duel");
      // TODO: 重置房间状态(也可能是在这个页面的loader之中重置，就看是进房间重置还是离开时重置，可能需要考虑意外离开的情况)
    }
  }, [room.stage]);
  useEffect(() => {
    // 出现错误
    if (errorMsg !== undefined && errorMsg !== "") {
      message.error(errorMsg);
      roomStore.errorMsg = undefined;
    }
  }, [errorMsg]);

  return (
    <div
      className={classNames(styles.container, {
        [styles.collapsed]: collapsed,
      })}
    >
      <Background />
      <div className={styles.sider}>
        <Chat />
      </div>
      <div className={styles.content}>
        <SideButtons
          collapsed={collapsed}
          switchCollapse={() => setCollapsed(!collapsed)}
        />
        <div className={styles.wrap}>
          <Controller
            onDeckChange={onDeckSelected}
            selectedDeckName={deck?.deckName}
          />
          <div className={styles["both-side-container"]}>
            <PlayerZone
              who={Who.Me}
              player={me}
              avatar={user?.avatar_url}
              ready={me?.state === PlayerState.READY}
              btn={
                room.stage === RoomStage.WAITING ? (
                  <Button
                    data-testid="waitroom-ready-toggle"
                    data-player-ready={me?.state === PlayerState.READY}
                    size="large"
                    className={styles["btn-join"]}
                    onClick={onReady}
                  >
                    {me?.state === PlayerState.NO_READY
                      ? i18n("DuelReady")
                      : i18n("CancelReady")}
                  </Button>
                ) : (
                  <MoraAvatar
                    mora={
                      me?.moraResult !== undefined
                        ? moraFromResult(me.moraResult)
                        : undefined
                    }
                  />
                )
              }
            />
            {room.players
              .filter((player) => player !== undefined && !player.isMe)
              .map((player, idx) => (
                <PlayerZone
                  key={idx}
                  who={Who.Op}
                  player={player}
                  ready={op?.state === PlayerState.READY}
                  btn={
                    room.stage === RoomStage.WAITING ? null : (
                      <MoraAvatar
                        mora={
                          op?.moraResult !== undefined
                            ? moraFromResult(op.moraResult)
                            : undefined
                        }
                      />
                    )
                  }
                />
              ))}
          </div>
          <ActionButton
            onMoraSelect={(mora) => {
              sendHandResult(container.conn, mora);
              roomStore.stage = RoomStage.HAND_SELECTED;
            }}
            onTpSelect={(tp) => {
              sendTpResult(container.conn, tp === Tp.First);
              roomStore.stage = RoomStage.TP_SELECTED;
            }}
          />
        </div>
      </div>
    </div>
  );
};

enum Who {
  Me = "me",
  Op = "op",
}

// 玩家区域: 双方各有一个
const PlayerZone: React.FC<{
  btn?: React.ReactNode; // 在内部右侧可以放一个按钮
  who: Who;
  player?: Player;
  avatar?: string; // 因为对手的头像目前不清楚如何获取，因此暂时这里作为一个参数传入
  ready: boolean;
}> = ({ btn, who, player, avatar, ready }) => {
  return (
    <div
      data-testid={`waitroom-player-${who}`}
      data-player-name={
        player && player.state !== PlayerState.LEAVE ? player.name : ""
      }
      data-player-ready={ready}
      className={classNames(styles["side-box"], styles[who], {
        [styles.ready]: ready,
      })}
    >
      <div className={styles.inner}></div>
      <div style={{ position: "relative" }}>
        <Avatar
          src={
            avatar && player
              ? avatar
              : player && player.state !== PlayerState.LEAVE
              ? `${NeosConfig.assetsPath}/default-avatar.png`
              : ""
          }
          size={48}
        />
        {player?.state === PlayerState.READY && (
          <CheckCircleFilled className={styles.check} />
        )}
      </div>
      <div className={styles.name}>
        {player && player.state !== PlayerState.LEAVE ? (
          player.name
        ) : (
          <Skeleton.Input size="small" />
        )}
      </div>
      {btn}
    </div>
  );
};

// 展示猜拳结果的组件
const MoraAvatar: React.FC<{ mora?: Mora }> = ({ mora }) => (
  <div style={{ marginLeft: "auto" }}>
    {mora ? (
      <Avatar
        style={{ marginLeft: "auto" }}
        size={48}
        icon={<IconFont type={`icon-hand-${mora}`} />}
      />
    ) : (
      <Skeleton.Avatar active size={48} />
    )}
  </div>
);

const moraFromResult = (result: ygopro.HandType): Mora | undefined => {
  switch (result) {
    case ygopro.HandType.SCISSORS:
      return Mora.Scissors;
    case ygopro.HandType.ROCK:
      return Mora.Rock;
    case ygopro.HandType.PAPER:
      return Mora.Paper;
    default:
      return undefined;
  }
};

const Controller: React.FC<{
  onDeckChange: (deckName: string) => void;
  selectedDeckName?: string;
}> = ({ onDeckChange, selectedDeckName }) => {
  const container = getUIContainer();
  const { t: i18n } = useTranslation("WaitRoom");
  const snapDeck = useSnapshot(deckStore);
  const snapRoom = useSnapshot(roomStore);
  return (
    <Space>
      <Select
        data-testid="waitroom-deck-select"
        title={i18n("Deck")}
        showSearch
        style={{ width: "15.6rem" }}
        value={selectedDeckName}
        disabled={
          snapRoom.stage !== RoomStage.WAITING || !snapDeck.decks.length
        }
        options={snapDeck.decks.map((deck) => ({
          value: deck.deckName,
          label: deck.deckName,
        }))}
        onChange={(value) => onDeckChange(value as string)}
      />
      <Button
        size="large"
        icon={<IconFont type="icon-record" size={18} />}
        onClick={() => {
          if (snapRoom.selfType !== SelfType.OBSERVER) {
            sendHsToObserver(container.conn);
          } else {
            sendHsToDuelList(container.conn);
          }
        }}
      >
        {snapRoom.selfType === SelfType.OBSERVER
          ? i18n("JoinDuelist")
          : i18n("JoinSpectator")}
        {!!snapRoom.observerCount && (
          <Avatar size="small" style={{ marginLeft: 8 }}>
            {snapRoom.observerCount}
          </Avatar>
        )}
      </Button>
    </Space>
  );
};

const SideButtons: React.FC<{
  switchCollapse: () => void;
  collapsed: boolean;
}> = ({ switchCollapse, collapsed }) => {
  const navigate = useNavigate();
  const { t: i18n } = useTranslation("WaitRoom");
  return (
    <div className={styles["btns-side"]}>
      <Button
        className={styles["btn"]}
        danger
        icon={
          <span className={styles["btn-icon"]}>
            <IconFont type="icon-exit" size={17} />
            <span className={styles["btn-text"]}>
              &nbsp;&nbsp;{i18n("LeaveRoom")}
            </span>
          </span>
        }
        onClick={() => {
          // 断开websocket🔗
          closeSocket(getUIContainer().conn);
          // 重置stores
          resetUniverse();
          // 返回上一个路由
          navigate("/match");
        }}
      />
      <Button
        className={styles["btn"]}
        icon={
          <span className={styles["btn-icon"]}>
            <IconFont type="icon-side-bar-fill" size={16} />
            <span className={styles["btn-text"]}>
              &nbsp;&nbsp;{collapsed ? i18n("Expand") : i18n("Collapse")}{" "}
              {i18n("Sidebar")}
            </span>
          </span>
        }
        onClick={switchCollapse}
      />
    </div>
  );
};

const ActionButton: React.FC<{
  onMoraSelect: (mora: Mora) => void;
  onTpSelect: (tp: Tp) => void;
}> = ({ onMoraSelect, onTpSelect }) => {
  const container = getUIContainer();
  const room = useSnapshot(roomStore);
  const { stage, isHost } = room;
  const { t: i18n } = useTranslation("WaitRoom");
  const startDisabled =
    stage !== RoomStage.WAITING ||
    (stage === RoomStage.WAITING &&
      (!isHost ||
        room.getMePlayer()?.state !== PlayerState.READY ||
        room.getOpPlayer()?.state !== PlayerState.READY));
  return (
    <MoraPopover onSelect={onMoraSelect}>
      <TpPopover onSelect={onTpSelect}>
        <SpecialButton
          data-testid="waitroom-start"
          data-room-stage={stage}
          data-room-is-host={isHost}
          aria-disabled={startDisabled}
          className={styles["btns-action"]}
          disabled={startDisabled}
          onClick={() => {
            sendHsStart(container.conn);
          }}
        >
          {stage === RoomStage.WAITING ? (
            <>
              <IconFont type="icon-play" size={12} />
              <span>{i18n("StartGame")}</span>
            </>
          ) : stage === RoomStage.HAND_SELECTING ? (
            <>
              <IconFont type="icon-mora" size={20} />
              <span>{i18n("PlsRockPaperScissors")}</span>
            </>
          ) : stage === RoomStage.HAND_SELECTED ? (
            <>
              <LoadingOutlined />
              <span>{i18n("WaitOpponentPlayRockPaperScissors")}</span>
            </>
          ) : stage === RoomStage.TP_SELECTING ? (
            <>
              <IconFont type="icon-one" size={18} />
              <span>{i18n("PlsChooseWhoGoesFirst")}</span>
            </>
          ) : stage === RoomStage.TP_SELECTED ? (
            <>
              <LoadingOutlined />
              <span>{i18n("WaitingForGameToStart")}</span>
            </>
          ) : (
            <>
              <LoadingOutlined />
              <span>{i18n("WaitingForGameToStart")}</span>
            </>
          )}
        </SpecialButton>
      </TpPopover>
    </MoraPopover>
  );
};
