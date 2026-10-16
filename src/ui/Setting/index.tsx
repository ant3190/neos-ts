import {
  AudioFilled,
  CloudDownloadOutlined,
  PlayCircleOutlined,
  TranslationOutlined,
} from "@ant-design/icons";
import { Alert, Button, ConfigProvider, Modal, Tabs, TabsProps } from "antd";
import zhCN from "antd/locale/zh_CN";
import React from "react";
import { render, unmountComponentAtNode } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { I18NSelector } from "../I18N";
import {
  checkResourceUpdates,
  resourceUpdates,
} from "../Layout/resourceUpdates";
import { theme } from "../theme";
import { AnimationSetting } from "./Animation";
import { AudioSetting } from "./Audio";

/** 设置面板属性 */
export interface SettingProps {
  /** 默认设置页 */
  defaultKey?: "audio" | "other" | "resources";
  onResourceCheck?: () => void;
}

export const Setting = (props: SettingProps) => {
  const { defaultKey = "audio" } = props;
  const { t: i18n } = useTranslation("SystemSettings");
  const { requesting, connectionError } = useSnapshot(resourceUpdates);

  const items: TabsProps["items"] = [
    {
      key: "audio",
      label: (
        <>
          {i18n("AudioSettings")} <AudioFilled />
        </>
      ),
      children: <AudioSetting />,
    },
    {
      key: "language",
      label: (
        <>
          {i18n("LanguageSettings")} <TranslationOutlined />
        </>
      ),
      children: <I18NSelector />,
    },
    {
      key: "animation",
      label: (
        <>
          {i18n("AnimationSettings")} <PlayCircleOutlined />
        </>
      ),
      children: <AnimationSetting />,
    },
    {
      key: "resources",
      label: (
        <>
          资源 <CloudDownloadOutlined />
        </>
      ),
      children: (
        <div style={{ fontSize: 16, lineHeight: 1.6 }}>
          <p>
            日常检查会复用本地资源。需要立即核对所有卡图时，可运行完整检查；文件较多时会耗时较长，可在后台继续。
          </p>
          <Button
            loading={requesting}
            style={{ minHeight: 44, fontSize: 16 }}
            onClick={() => {
              props.onResourceCheck?.();
              void checkResourceUpdates({ full: true }).catch(() => undefined);
            }}
          >
            完整检查资源
          </Button>
          {connectionError && (
            <Alert
              type="warning"
              showIcon
              message={connectionError}
              style={{ marginTop: 16 }}
            />
          )}
        </div>
      ),
    },
  ];

  return <Tabs defaultActiveKey={defaultKey} items={items} />;
};

/**
 * 打开设置面板，允许在非组件内通过此 API 打开设置面板
 */
export function openSettingPanel(props: SettingProps) {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const destroy = () => {
    const result = unmountComponentAtNode(div);
    if (result && div.parentNode) {
      div.parentNode.removeChild(div);
    }
  };
  render(
    <ConfigProvider theme={theme} locale={zhCN}>
      <Modal open centered footer={null} onCancel={destroy} closeIcon={null}>
        <Setting
          {...props}
          onResourceCheck={() => {
            destroy();
            props.onResourceCheck?.();
          }}
        />
      </Modal>
    </ConfigProvider>,
    div,
  );
}
