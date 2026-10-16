import {
  DatabaseFilled,
  FullscreenOutlined,
  LoginOutlined,
  LogoutOutlined,
  SettingFilled,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, App, Avatar, Button, Dropdown } from "antd";
import classNames from "classnames";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  type LoaderFunction,
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom";
import { useSnapshot } from "valtio";

import {
  CookieKeys,
  getSSOSignInUrl,
  getSSOSignOutUrl,
  removeCookie,
} from "@/api";
import { useConfig } from "@/config";
import { useAdaptiveViewportScale } from "@/hook";
import { accountStore, initStore } from "@/stores";

import { updateMdproDeck } from "../BuildDeck/DeckDatabase/DeckResults";
import { setCssProperties } from "../Duel/PlayMat/css";
import { Setting } from "../Setting";
import styles from "./index.module.scss";
import { ResourceStorageDialog } from "./ResourceStorageDialog";
import { ResourceUpdateDialog } from "./ResourceUpdateDialog";
import {
  getLoginStatus,
  handleSSOLogin,
  initDeck,
  initializeResources,
} from "./utils";

const NeosConfig = useConfig();
const DEFAULT_VIEWPORT_SCALE = { designWidth: 1000, designHeight: 620 };
const DUEL_VIEWPORT_SCALE = {
  designWidth: 1920,
  designHeight: 1080,
  minScale: 0.1,
  duel: true,
};

export const loader: LoaderFunction = async () => {
  getLoginStatus();
  initDeck();
  void initializeResources();
  // TODO: should avoid reloading mdpro deck again
  updateMdproDeck();

  // set some styles
  setCssProperties();

  return null;
};

const HeaderBtn: React.FC<
  React.PropsWithChildren<{ to: string; disabled?: boolean }>
> = ({ to, children, disabled = false }) => {
  const Element = disabled ? "div" : NavLink;
  return (
    <Element
      to={disabled ? "/" : to}
      className={classNames(styles.link, { [styles.disabled]: disabled })}
    >
      {children}
    </Element>
  );
};

export const Component = () => {
  const { t: i18n } = useTranslation("Header");
  const resources = useSnapshot(initStore.resources);

  // 捕获SSO登录
  const routerLocation = useLocation();
  useEffect(() => {
    routerLocation.search && handleSSOLogin(routerLocation.search);
  }, [routerLocation.search]);

  // 根据是否登录，显示内容
  const logined = Boolean(useSnapshot(accountStore).user);

  const { pathname } = routerLocation;
  useAdaptiveViewportScale(
    pathname === "/duel" ? DUEL_VIEWPORT_SCALE : DEFAULT_VIEWPORT_SCALE,
  );
  const pathnamesHideHeader = ["/waitroom", "/duel", "/side"];
  const { modal } = App.useApp();
  const callbackUrl = `${location.origin}/match/`;
  const onLogin = () => location.replace(getSSOSignInUrl(callbackUrl));
  const onLogout = () => {
    removeCookie(CookieKeys.USER);
    accountStore.logout();
    // 跳转SSO登出
    location.replace(getSSOSignOutUrl(callbackUrl));
  };

  return (
    <>
      {!pathnamesHideHeader.includes(pathname) && (
        <nav className={styles.navbar}>
          <a
            href="https://github.com/DarkNeos/neos-ts"
            title="repo"
            className={styles["logo-container"]}
          >
            <img
              className={styles.logo}
              src={`${NeosConfig.assetsPath}/neos-logo.svg`}
              alt="NEOS"
            />
          </a>

          <HeaderBtn to="/">{i18n("HomePage")}</HeaderBtn>
          <HeaderBtn to="/match" disabled={!logined}>
            {i18n("Match")}
          </HeaderBtn>
          <HeaderBtn to="/build" disabled={!logined}>
            {i18n("DeckBuilding")}
          </HeaderBtn>
          <span style={{ flexGrow: 1 }} />
          <span className={styles.profile}>
            <Dropdown
              arrow
              menu={{
                items: [
                  {
                    label: (
                      <a href={NeosConfig.profileUrl} target="_blank">
                        <>
                          <UserOutlined style={{ fontSize: "16px" }} />{" "}
                          <strong>{i18n("PersonalCenter")}</strong>
                        </>
                      </a>
                    ),
                  },
                  {
                    label: (
                      <a href="https://ygobbs.com" target="_blank">
                        <>
                          <TeamOutlined style={{ fontSize: "16px" }} />{" "}
                          <strong>{i18n("MyCardCommunity")}</strong>
                        </>
                      </a>
                    ),
                  },
                  {
                    label: (
                      <a
                        href="https://mycard.moe/ygopro/arena/#/"
                        target="_blank"
                      >
                        <>
                          <DatabaseFilled style={{ fontSize: "16px" }} />{" "}
                          <strong>{i18n("DuelDatabase")}</strong>
                        </>
                      </a>
                    ),
                  },
                  {
                    label: (
                      <>
                        <SettingFilled />{" "}
                        <strong>{i18n("SystemSettings")}</strong>
                      </>
                    ),
                    onClick: () => {
                      modal.info({
                        content: (
                          <>
                            <Setting />
                          </>
                        ),
                        centered: true,
                        maskClosable: true,
                        icon: null,
                        footer: null,
                      });
                    },
                  },
                  {
                    label: (
                      <>
                        <strong style={{ color: "#1890ff" }}>
                          <FullscreenOutlined style={{ fontSize: "16px" }} />{" "}
                          {i18n("Fullscreen")}
                        </strong>
                      </>
                    ),
                    onClick: () => document.documentElement.requestFullscreen(),
                  },
                  {
                    label: logined ? (
                      <>
                        <LogoutOutlined style={{ fontSize: "16px" }} />{" "}
                        <strong>{i18n("LogOut")}</strong>
                      </>
                    ) : (
                      <>
                        <LoginOutlined style={{ fontSize: "16px" }} />{" "}
                        <strong>{i18n("Login")}</strong>
                      </>
                    ),
                    onClick: logined ? onLogout : onLogin,
                    danger: logined ? true : false,
                  },
                ].map((x, key) => ({ ...x, key })),
              }}
            >
              <div>
                <NeosAvatar />
              </div>
            </Dropdown>
          </span>
        </nav>
      )}
      <main className={styles.main}>
        {resources.error && (
          <Alert
            type="error"
            showIcon
            message={resources.error}
            style={{
              position: "absolute",
              top: 8,
              left: 16,
              right: 16,
              zIndex: 2000,
            }}
            action={
              <Button
                aria-label="重试"
                size="small"
                onClick={() => void initializeResources()}
              >
                重试
              </Button>
            }
            data-testid="local-resource-error"
          />
        )}
        <Outlet />
      </main>
      <ResourceUpdateDialog />
      <ResourceStorageDialog />
    </>
  );
};

const NeosAvatar = () => {
  const { user } = useSnapshot(accountStore);
  return (
    <Avatar size="small" src={user?.avatar_url} style={{ cursor: "pointer" }} />
  );
};
