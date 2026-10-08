import { initStrings, initSuperPrerelease } from "@/api";
import { getUIContainer, initUIContainer } from "@/container/compat";
import { WebSocketStream } from "@/infra";
import { initReplaySocket, initSocket } from "@/middleware/socket";
import { pollSocketLooper } from "@/service/executor";
import { roomStore } from "@/stores";
import { resetEndModal } from "@/ui/Duel/Message/EndModal";
import { resetDuelDialogs } from "@/ui/Duel/Message/reset";

import { initSqlite } from "../Layout/utils";

// 连接SRVPRO服务
export const connectSrvpro = async (params: {
  ip: string;
  player: string;
  passWd: string;
  replay?: boolean;
  replayData?: ArrayBuffer;
  singlePlayer?: boolean;
  preferredDeckName?: string;
  customOnConnected?: (conn: WebSocketStream) => void;
}) => {
  // 初始化sqlite
  await initSqlite();

  // 初始化I18N文案
  await initStrings();

  // 初始化超先行配置
  await initSuperPrerelease();

  roomStore.singlePlayer = params.singlePlayer ?? false;
  roomStore.preferredDeckName = params.preferredDeckName;

  if (params.replay && params.replayData) {
    // initialize replay from local yrp3d data
    const conn = initReplaySocket({
      data: params.replayData,
    });

    // initialize the UI Container
    initUIContainer(conn);
    resetEndModal();
    resetDuelDialogs();

    // execute the event looper
    pollSocketLooper(getUIContainer());
  } else {
    // connect to the ygopro Server
    const conn = initSocket(params);

    // initialize the UI Contaner
    initUIContainer(conn);
    resetEndModal();
    resetDuelDialogs();

    // execute the event looper

    pollSocketLooper(getUIContainer());
  }
};
