import { RightOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { LoaderFunction, useNavigate } from "react-router-dom";
import { useSnapshot } from "valtio";

import { getSSOSignInUrl } from "@/api";
import { useConfig } from "@/config";
import { AudioActionType, changeScene } from "@/infra/audio";
import { accountStore, initStore } from "@/stores";
import { resourceStorage } from "@/ui/Layout/resourceStorage";
import { Background, Loading, SpecialButton } from "@/ui/Shared";

import styles from "./index.module.scss";

const NeosConfig = useConfig();

export const loader: LoaderFunction = async () => {
  // 更新场景
  changeScene(AudioActionType.BGM_MENU);
  return null;
};

export const Component: React.FC = () => {
  const { t } = useTranslation("Start");
  const { user } = useSnapshot(accountStore);
  const { progress } = useSnapshot(initStore.sqlite);
  const resources = useSnapshot(initStore.resources);
  const storage = useSnapshot(resourceStorage);
  return (
    <>
      <Background />
      <div className={styles.wrap}>
        {progress === 1 && resources.ready ? (
          <main className={styles.main}>
            <div className={styles.left}>
              <img
                className={styles["neos-logo"]}
                src={`${NeosConfig.assetsPath}/neos-logo.svg`}
                alt="YGO NEOS"
              />
              <div className={styles.title}>{t("Title")}</div>
              <div className={styles.keywords}>{t("Keywords")}</div>
              <div className={styles.details}>{t("Details")}</div>
              <LoginBtn logined={Boolean(user)} />
            </div>
            <div className={styles.right}>
              <img
                className={styles["neos-main-bg"]}
                src={`${NeosConfig.assetsPath}/neos-main-bg.webp`}
              />
              <img
                className={styles["neos-main"]}
                src={`${NeosConfig.assetsPath}/neos-main.webp`}
              />
            </div>
          </main>
        ) : (
          <div
            className={styles.resourceLoading}
            data-testid="local-resource-loading"
          >
            <Loading progress={progress * 100} />
            <p>
              {storage.status?.configured === false
                ? "请先设置数据存储目录"
                : resources.error
                ? "等待重试"
                : "正在准备本地资源并检查更新…"}
            </p>
          </div>
        )}
      </div>
    </>
  );
};
Component.displayName = "Start";

const LoginBtn: React.FC<{ logined: boolean }> = ({ logined }) => {
  const { t } = useTranslation("Start");
  const navigate = useNavigate();

  const loginViaSSO = () =>
    // 跳转回match页
    location.replace(getSSOSignInUrl(`${location.origin}/match/`));

  const goToMatch = () => navigate("/match");

  return (
    <SpecialButton
      style={{ marginTop: "auto" }}
      onClick={logined ? goToMatch : loginViaSSO}
    >
      <span>{logined ? t("StartGame") : t("LoginToGame")}</span>
      <RightOutlined />
    </SpecialButton>
  );
};
