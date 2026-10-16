import { FolderOpenOutlined } from "@ant-design/icons";
import { Alert, App, Button, Form, Input, type InputRef, Modal } from "antd";
import { useEffect, useRef } from "react";
import { useSnapshot } from "valtio";

import { resourceStorage, saveResourceStorage } from "./resourceStorage";
import styles from "./ResourceStorageDialog.module.scss";
import { initializeResources } from "./utils";

export function ResourceStorageDialog() {
  const { status, saving, checking, error, saveError } =
    useSnapshot(resourceStorage);
  const [form] = Form.useForm<{ directory: string }>();
  const input = useRef<InputRef>(null);
  const { message } = App.useApp();
  const suggestion = status?.suggestedDirectory;
  const open = status?.configured === false || Boolean(error);

  useEffect(() => {
    if (suggestion) form.setFieldsValue({ directory: suggestion });
  }, [form, suggestion]);

  useEffect(() => {
    if (!open || error) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, error, suggestion]);
  const retry = () => void initializeResources();
  const save = async ({ directory }: { directory: string }) => {
    if (await saveResourceStorage(directory)) {
      void message.success("数据目录已保存，正在加载资源。", 3);
      void initializeResources();
    }
  };

  return (
    <Modal
      open={open}
      title="首次设置 · 数据存储"
      width={600}
      centered
      closable={false}
      maskClosable={false}
      keyboard={false}
      transitionName=""
      maskTransitionName=""
      footer={null}
      className={styles.dialog}
      afterOpenChange={(visible) => {
        if (visible) input.current?.focus();
      }}
    >
      <div className={styles.content} data-testid="resource-storage-setup">
        <p className={styles.description}>
          选择卡图、卡库和禁限表的保存位置。确认后开始同步，之后打开网页会自动检查更新。
        </p>
        {error ? (
          <>
            <Alert type="error" showIcon message={error} role="alert" />
            <div className={styles.actions}>
              <Button type="primary" onClick={retry} loading={checking}>
                重新连接
              </Button>
            </div>
          </>
        ) : (
          <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
            <Form.Item
              name="directory"
              label="数据存储目录"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: "请填写数据存储目录。",
                },
              ]}
              extra={
                status?.baseDirectory
                  ? `可使用 ${status.baseDirectory} 或其中的子目录。`
                  : "填写部署 Neos 的设备上的完整目录路径。"
              }
            >
              <Input
                ref={input}
                prefix={<FolderOpenOutlined />}
                placeholder={suggestion || "/mnt/data/neos-data"}
                autoComplete="off"
                spellCheck={false}
              />
            </Form.Item>
            <p className={styles.note}>
              数据保存在运行 Neos
              的设备上，所有页面共用。已有数据可直接复用，首次完整同步建议预留至少
              4 GB 空间。
            </p>
            {(saveError || status?.error) && (
              <Alert
                type="error"
                showIcon
                role="alert"
                message={saveError || status?.error}
                data-testid="resource-storage-error"
              />
            )}
            <div className={styles.actions}>
              {saveError && (
                <Button onClick={retry} loading={checking}>
                  重新检查
                </Button>
              )}
              <Button type="primary" htmlType="submit" loading={saving}>
                保存并开始下载
              </Button>
            </div>
          </Form>
        )}
      </div>
    </Modal>
  );
}

export function ResourceStorageInfo() {
  const { status } = useSnapshot(resourceStorage);
  return (
    <div className={styles.info}>
      <strong>当前数据存储目录</strong>
      <code data-testid="resource-storage-directory">
        {status?.directory || "由资源服务管理"}
      </code>
      <p>设置保存在服务端，刷新页面或重新打开网页后继续使用。</p>
    </div>
  );
}
