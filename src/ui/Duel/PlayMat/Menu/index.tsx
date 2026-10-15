import {
  CloseCircleOutlined,
  FileSearchOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MessageOutlined,
  PauseCircleFilled,
  PlayCircleFilled,
  RightOutlined,
  SettingOutlined,
  StepForwardFilled,
  StopOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Tooltip } from "antd";
import classNames from "classnames";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import {
  sendSelectBattleCmdResponse,
  sendSelectIdleCmdResponse,
  sendSelectSingleResponse,
  sendSurrender,
  ygopro,
} from "@/api";
import { getUIContainer } from "@/container/compat";
import {
  ChainSetting,
  DEFAULT_REPLAY_ADVANCE_MASK,
  matStore,
  replayStore,
} from "@/stores";

import { AnimationQualityControl } from "../../animation/Quality";
import { legalPhaseCommands } from "../../interaction/phaseRules";
import { projectWorld } from "../../layout/geometry";
import { duelPanels, toggleAttachedEffects } from "../../layout/panels";
import { duelPreferences, setAutoInfo } from "../../layout/preferences";
import { duelViewport } from "../../layout/viewport";
import { displayActionHistory } from "../../Message";
import { duelInputState } from "../../Message/session";
import { clearAllIdleInteractivities, clearSelectInfo } from "../../utils";
import { openChatBox } from "../ChatBox";
import styles from "./index.module.scss";
import PhaseType = ygopro.StocGameMessage.MsgNewPhase.PhaseType;

const FINISH_CANCEL_RESPONSE = -1;
const REPLAY_ADVANCE_EVENT = "neos:replay-advance";
interface ReplayAdvanceEventDetail {
  advanceMask?: number;
}

const phaseInfo = (phase: PhaseType) => {
  const names: Partial<Record<PhaseType, [string, string]>> = {
    [PhaseType.DRAW]: ["draw", "DRAW"],
    [PhaseType.STANDBY]: ["standby", "STANDBY"],
    [PhaseType.MAIN1]: ["main1", "MAIN 1"],
    [PhaseType.BATTLE]: ["battle", "BATTLE"],
    [PhaseType.BATTLE_START]: ["battle-start", "BATTLE"],
    [PhaseType.BATTLE_STEP]: ["battle-step", "BATTLE"],
    [PhaseType.DAMAGE]: ["damage", "DAMAGE"],
    [PhaseType.DAMAGE_GAL]: ["damage-calc", "DAMAGE CALC"],
    [PhaseType.MAIN2]: ["main2", "MAIN 2"],
    [PhaseType.END]: ["end", "END"],
  };
  return names[phase] ?? ["unknown", "WAIT"];
};

export const Menu = () => {
  const container = getUIContainer();
  const { t: i18n } = useTranslation("Menu");
  const snap = useSnapshot(matStore);
  const replay = useSnapshot(replayStore);
  const preferences = useSnapshot(duelPreferences);
  const viewport = useSnapshot(duelViewport);
  const panels = useSnapshot(duelPanels);
  const input = useSnapshot(duelInputState);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [surrenderOpen, setSurrenderOpen] = useState(false);
  const phaseAnchor = projectWorld(
    { x: 26.314339, y: 0.46804985, z: 0 },
    viewport,
  );
  const [phaseKey, phaseText] = phaseInfo(snap.phase.currentPhase);
  const canCommand =
    !!snap.commandSource &&
    snap.commandPlayer !== undefined &&
    matStore.isMe(snap.commandPlayer) &&
    !replay.isReplay &&
    input.prompts === 0;
  const commands = legalPhaseCommands(snap.commandSource, snap.phase);
  const chainNames = {
    [ChainSetting.CHAIN_ALL]: "全部连锁",
    [ChainSetting.CHAIN_SMART]: "智能连锁",
    [ChainSetting.CHAIN_IGNORE]: "忽略连锁",
  };
  const chainIds = {
    [ChainSetting.CHAIN_ALL]: "all",
    [ChainSetting.CHAIN_SMART]: "smart",
    [ChainSetting.CHAIN_IGNORE]: "ignore",
  };
  useEffect(() => {
    if (!canCommand) setPhaseOpen(false);
  }, [canCommand]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable=true]",
        )
      )
        return;
      if (event.key.toLowerCase() === "a")
        matStore.chainSetting = ChainSetting.CHAIN_ALL;
      else if (event.key.toLowerCase() === "s")
        matStore.chainSetting = ChainSetting.CHAIN_IGNORE;
      else if (event.key.toLowerCase() === "d")
        matStore.chainSetting = ChainSetting.CHAIN_SMART;
      else if (event.key === "Escape") {
        setPhaseOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest(
          '[data-testid="duel-settings"], [data-testid="duel-settings-panel"]',
        )
      )
        setSettingsOpen(false);
      if (
        !target.closest(
          '[data-testid="duel-phase-select"], [data-testid="duel-phase-picker"]',
        )
      )
        setPhaseOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const choosePhase = (key: string) => {
    // Check the live request again: an old open picker cannot answer a new prompt.
    const command = legalPhaseCommands(
      matStore.commandSource,
      matStore.phase,
    ).find((entry) => entry.key === key);
    if (!command?.enabled || !canCommand || duelInputState.prompts) return;
    const source = matStore.commandSource;
    clearAllIdleInteractivities();
    setPhaseOpen(false);
    if (source === "battle")
      sendSelectBattleCmdResponse(container.conn, command.response);
    else sendSelectIdleCmdResponse(container.conn, command.response);
  };
  const phaseLeft = Math.min(
    window.innerWidth - 88,
    Math.max(88, viewport.left + phaseAnchor.x * viewport.scale),
  );
  const phaseTop = viewport.top + phaseAnchor.y * viewport.scale;
  return (
    <div
      className={styles.ui}
      style={{
        left: -viewport.left / viewport.scale,
        top: -viewport.top / viewport.scale,
        width: window.innerWidth,
        height: window.innerHeight,
        transform: `scale(${1 / viewport.scale})`,
      }}
    >
      <button
        type="button"
        className={styles.phase}
        style={{ left: phaseLeft, top: phaseTop }}
        data-testid="duel-phase-select"
        data-current-phase={phaseKey}
        aria-expanded={phaseOpen}
        disabled={!canCommand}
        onClick={() => {
          setPhaseOpen((value) => !value);
          setSettingsOpen(false);
        }}
        aria-label={`切换阶段：${phaseText}`}
      >
        <span className={styles.turn}>T{snap.turnCount}</span>
        <strong>{phaseText}</strong>
        <RightOutlined />
      </button>
      {phaseOpen && (
        <div
          className={styles.phasePicker}
          style={{
            left: Math.min(
              window.innerWidth - 260,
              Math.max(12, phaseLeft - 120),
            ),
            top: Math.min(
              window.innerHeight - 280,
              Math.max(12, phaseTop + 32),
            ),
          }}
          role="dialog"
          aria-modal="false"
          aria-label="选择阶段"
          data-testid="duel-phase-picker"
        >
          <header>
            <strong>选择阶段</strong>
            <button
              type="button"
              aria-label="关闭阶段选择"
              onClick={() => setPhaseOpen(false)}
            >
              ×
            </button>
          </header>
          <div className={styles.phaseChoices}>
            {commands.map((command) => (
              <button
                key={command.key}
                type="button"
                data-testid={`duel-phase-${command.key}`}
                disabled={!command.enabled}
                onClick={() => choosePhase(command.key)}
              >
                <strong>{command.text}</strong>
                <RightOutlined />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles["menu-container"]} data-testid="duel-controls">
        <SelectManager />
        <div className={styles.replay}>
          <ReplayControl />
        </div>
        <Button
          aria-label={chainNames[snap.chainSetting]}
          title={`${
            chainNames[snap.chainSetting]
          }（A：全部 / S：忽略 / D：智能）`}
          data-testid="duel-chain-setting"
          data-chain-setting={chainIds[snap.chainSetting]}
          icon={<ChainIcon chainSetting={snap.chainSetting} />}
          onClick={() => {
            matStore.chainSetting =
              snap.chainSetting === ChainSetting.CHAIN_SMART
                ? ChainSetting.CHAIN_ALL
                : snap.chainSetting === ChainSetting.CHAIN_ALL
                ? ChainSetting.CHAIN_IGNORE
                : ChainSetting.CHAIN_SMART;
          }}
        />
        <Tooltip title="附加效果">
          <Button
            data-testid="duel-attached-effects-toggle"
            aria-label="附加效果"
            aria-pressed={panels.right === "effects"}
            icon={<InfoCircleOutlined />}
            onClick={toggleAttachedEffects}
          />
        </Tooltip>
        <Tooltip title={i18n("ChatRoom")}>
          <Button
            data-testid="duel-chat-toggle"
            aria-label={i18n("ChatRoom")}
            icon={<MessageOutlined />}
            onClick={openChatBox}
          />
        </Tooltip>
        <Tooltip title={i18n("History")}>
          <Button
            data-testid="duel-log-toggle"
            aria-label={i18n("History")}
            icon={<FileSearchOutlined />}
            onClick={displayActionHistory}
          />
        </Tooltip>
        <Tooltip title="决斗菜单">
          <Button
            data-testid="duel-settings"
            aria-label="决斗菜单"
            icon={<SettingOutlined />}
            aria-expanded={settingsOpen}
            onClick={() => {
              setSettingsOpen((value) => !value);
              setPhaseOpen(false);
              setSurrenderOpen(false);
            }}
          />
        </Tooltip>
      </div>
      {settingsOpen && (
        <section
          className={styles.settings}
          aria-label="决斗菜单"
          data-testid="duel-settings-panel"
        >
          <header>
            决斗菜单
            <button
              type="button"
              aria-label="关闭决斗菜单"
              onClick={() => setSettingsOpen(false)}
            >
              ×
            </button>
          </header>
          <AnimationQualityControl inline />
          <Checkbox
            checked={preferences.autoInfo}
            onChange={(event) => setAutoInfo(event.target.checked)}
          >
            自动显示发动卡片说明
          </Checkbox>
          <button
            className={styles.surrender}
            type="button"
            data-testid="duel-surrender"
            aria-label={i18n("DoYouSurrunder")}
            onClick={() => setSurrenderOpen((value) => !value)}
          >
            <CloseCircleOutlined />
            {i18n("DoYouSurrunder")}
          </button>
          {surrenderOpen && (
            <div className={styles.confirm}>
              <span>确定投降？</span>
              <button type="button" onClick={() => setSurrenderOpen(false)}>
                {i18n("Cancel")}
              </button>
              <button
                type="button"
                data-testid="duel-surrender-confirm"
                onClick={() => {
                  setSurrenderOpen(false);
                  setSettingsOpen(false);
                  sendSurrender(container.conn);
                }}
              >
                {i18n("Confirm")}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

const ChainIcon = ({ chainSetting }: { chainSetting: ChainSetting }) =>
  chainSetting === ChainSetting.CHAIN_ALL ? (
    <LinkOutlined />
  ) : chainSetting === ChainSetting.CHAIN_SMART ? (
    <ThunderboltOutlined />
  ) : (
    <StopOutlined />
  );

const ReplayControl: React.FC = () => {
  const { isReplay, paused, waiting, currentIndex } = useSnapshot(replayStore);

  useEffect(() => {
    const advanceReplay = (event: Event) => {
      const { advanceMask } =
        (event as CustomEvent<ReplayAdvanceEventDetail>).detail ?? {};

      if (typeof advanceMask === "number") {
        replayStore.advance(advanceMask);
      } else {
        replayStore.advance();
      }
    };

    window.addEventListener(REPLAY_ADVANCE_EVENT, advanceReplay);

    return () => {
      window.removeEventListener(REPLAY_ADVANCE_EVENT, advanceReplay);
    };
  }, []);

  if (!isReplay) return <></>;

  const togglePaused = () => {
    if (replayStore.paused) replayStore.resume();
    else replayStore.pause();
  };

  return (
    <>
      <Tooltip title={paused ? "Resume replay" : "Pause replay"}>
        <Button
          aria-label={paused ? "Resume replay" : "Pause replay"}
          data-testid="replay-toggle"
          data-replay-index={currentIndex}
          data-replay-paused={paused}
          data-replay-waiting={waiting}
          icon={paused ? <PlayCircleFilled /> : <PauseCircleFilled />}
          onClick={togglePaused}
          type="text"
        />
      </Tooltip>
      <Tooltip title="Advance replay">
        <Button
          aria-label="Advance replay"
          data-testid="replay-advance"
          data-replay-default-advance-mask={DEFAULT_REPLAY_ADVANCE_MASK}
          data-replay-index={currentIndex}
          data-replay-waiting={waiting}
          disabled={!paused || !waiting}
          icon={<StepForwardFilled />}
          onClick={() => replayStore.advance()}
          type="text"
        />
      </Tooltip>
    </>
  );
};

const SelectManager: React.FC = () => {
  const container = getUIContainer();
  const { t: i18n } = useTranslation("Menu");
  const { finishable, cancelable } = useSnapshot(matStore.selectUnselectInfo);
  const onFinishOrCancel = () => {
    sendSelectSingleResponse(container.conn, FINISH_CANCEL_RESPONSE);
    clearSelectInfo();
  };
  return (
    <div className={styles["select-manager"]}>
      <Button
        className={classNames(styles.btn, { [styles.cancle]: cancelable })}
        disabled={!cancelable && !finishable}
        onClick={onFinishOrCancel}
      >
        {finishable ? i18n("SelectionComplete") : i18n("Deselect")}
      </Button>
    </div>
  );
};
