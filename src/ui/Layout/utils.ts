import {
  CookieKeys,
  forbidden,
  forbidden_408,
  getCookie,
  initStrings,
  initSuperPrerelease,
  setCookie,
} from "@/api";
import { useConfig } from "@/config";
import sqliteMiddleWare, { sqliteCmd } from "@/middleware/sqlite";
import { accountStore, deckStore, initStore, type User } from "@/stores";

const { releaseResource, preReleaseResource, env408Resource } = useConfig();

let initialization: Promise<void> | undefined;

/** One check per page load; navigation shares it and failed initialization can be retried. */
export const initializeResources = () => {
  if (initialization) return initialization;
  const state = initStore.resources;
  state.checking = true;
  state.error = "";
  initialization = (async () => {
    const language = localStorage.getItem("language") || "cn";
    try {
      const response = await fetch(
        `/api/resources/check?language=${encodeURIComponent(language)}`,
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok)
        throw new Error(`Resource service HTTP ${response.status}`);
    } catch (error) {
      // Existing local files remain usable when an update check is unavailable.
      console.warn("Resource update check:", error);
    }
    await Promise.all([initSqlite(), initForbidden(), initI18N(), initSuper()]);
    state.ready = true;
  })()
    .catch((error) => {
      console.error("Local resources:", error);
      state.error =
        "本地资源加载失败，请稍后重试。首次启动时服务器需要下载卡库。";
      if (initStore.sqlite.progress < 1) initStore.sqlite.progress = 0;
      initialization = undefined;
    })
    .finally(() => {
      state.checking = false;
    });
  return initialization;
};

let sqliteInitialization: Promise<void> | undefined;
let sqliteRequest: symbol | undefined;

/** Shared initialization also guards late progress callbacks after a failed request. */
export const initSqlite = (): Promise<void> => {
  if (initStore.sqlite.progress === 1) return Promise.resolve();
  if (sqliteInitialization) return sqliteInitialization;
  const request = Symbol("sqlite-load");
  sqliteRequest = request;
  initStore.sqlite.progress = 0.01;
  sqliteInitialization = sqliteMiddleWare({
    cmd: sqliteCmd.INIT,
    initInfo: {
      releaseDbUrl: releaseResource.cdb,
      preReleaseDbUrl: preReleaseResource.cdb,
      progressCallback: (progress) => {
        if (sqliteRequest === request)
          initStore.sqlite.progress = progress * 0.9;
      },
    },
  })
    .then(() => {
      if (sqliteRequest === request) initStore.sqlite.progress = 1;
    })
    .catch((error) => {
      if (sqliteRequest === request) initStore.sqlite.progress = 0;
      throw error;
    })
    .finally(() => {
      if (sqliteRequest === request) sqliteRequest = undefined;
      sqliteInitialization = undefined;
    });
  return sqliteInitialization;
};

/** 加载卡组 */
export const initDeck = async () => {
  if (!initStore.decks) {
    await deckStore.initialize();
    initStore.decks = true;
  }
};

/** 加载禁限卡表 */
export const initForbidden = async () => {
  if (!initStore.forbidden) {
    await forbidden.init(releaseResource.lflist);
    await forbidden_408.init(env408Resource.lflist);
    initStore.forbidden = true;
  }
};

/** 加载I18N文案 */
export const initI18N = async () => {
  if (!initStore.i18n) {
    await initStrings();
    initStore.i18n = true;
  }
};

/** 加载超先行服配置 */
export const initSuper = async () => {
  if (!initStore.superprerelease) {
    await initSuperPrerelease();
    initStore.superprerelease = true;
  }
};

/** sso登录跳转回来 */
export const handleSSOLogin = async (search: string) => {
  /** 从SSO跳转回的URL之中，解析用户信息 */
  function getSSOUser(searchParams: URLSearchParams): User {
    return Object.fromEntries(searchParams) as unknown as User;
  }

  const sso = new URLSearchParams(search).get("sso");
  const user = sso ? getSSOUser(new URLSearchParams(atob(sso))) : undefined;
  if (user) {
    // Convert userID to [`Number`] here
    user.id = Number(user.id);
    accountStore.login(user);
    setCookie(CookieKeys.USER, JSON.stringify(user));
    // TODO: toast显示登录成功
  }
};

/** 从cookie获取登录态 */
export const getLoginStatus = async () => {
  const user = getCookie<User>(CookieKeys.USER);
  if (user) accountStore.login(user);
};
