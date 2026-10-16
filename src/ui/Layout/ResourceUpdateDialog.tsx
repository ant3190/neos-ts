import { CloudDownloadOutlined } from "@ant-design/icons";
import { Alert, Button, Modal, Progress } from "antd";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";

import styles from "./ResourceUpdateDialog.module.scss";
import { checkResourceUpdates, resourceUpdates } from "./resourceUpdates";

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const labels: Record<string, string> = {
  database: "卡库与效果文本",
  strings: "提示文本",
  banlist: "禁限表",
  prerelease: "先行卡配置",
  css: "字体配置",
  font: "字体",
  image: "卡图",
};

export function ResourceUpdateDialog() {
  const { update, connectionError, requesting, reloadAvailable } =
    useSnapshot(resourceUpdates);
  const [open, setOpen] = useState(false);
  const announced = useRef("");
  const updateId = update?.id;
  const updateFound = update?.hasUpdates;

  useEffect(() => {
    const current = resourceUpdates.update;
    if (current?.hasUpdates && current.id !== announced.current) {
      announced.current = current.id;
      setOpen(true);
    }
  }, [updateFound, updateId]);

  if (!update) return null;
  const complete = update.phase === "complete";
  const partial = update.phase === "partial";
  const active = !complete && !partial;
  const stage = update.phase === "checking" ? update.core : update.assets;
  const percent = complete
    ? 100
    : Math.min(
        100,
        Math.floor((stage.completed / Math.max(1, stage.total)) * 100),
      );
  const title = connectionError
    ? "资源更新进度"
    : complete
    ? reloadAvailable
      ? "资源更新完成"
      : "资源已是最新"
    : partial
    ? "部分资源更新失败"
    : "发现资源更新";
  const transfer = update.active[0];
  const retry = () => void checkResourceUpdates().catch(() => undefined);
  const footer = (
    <div className={styles.footer}>
      <Button onClick={() => setOpen(false)}>
        {active ? "后台更新" : complete ? "稍后刷新" : "稍后重试"}
      </Button>
      {partial || connectionError ? (
        <Button type="primary" loading={requesting} onClick={retry}>
          {connectionError ? "重新检查" : "重试更新"}
        </Button>
      ) : complete && reloadAvailable ? (
        <Button type="primary" onClick={() => window.location.reload()}>
          刷新加载新数据
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        title={title}
        onCancel={() => setOpen(false)}
        footer={footer}
        width={560}
        centered
        maskClosable={false}
        transitionName=""
        maskTransitionName=""
        className={styles.dialog}
      >
        <div className={styles.content} data-testid="resource-update-dialog">
          <p className={styles.description}>
            {connectionError
              ? "暂时无法获取最新进度，可重新检查或继续使用已保存的资源。"
              : complete
              ? "资源已同步到本地。刷新页面后加载新数据，当前对局不会自动刷新。"
              : partial
              ? "部分资源暂时无法下载，已保留可用的本地数据，可以稍后重试。"
              : "正在将更新同步到本地，可以收起窗口在后台继续。"}
          </p>
          <div className={styles.progressHeading}>
            <strong>
              {update.phase === "checking"
                ? "卡库与禁限检查"
                : "卡图与字体同步"}
            </strong>
            <span aria-live="polite" data-testid="resource-update-count">
              已处理 {stage.completed.toLocaleString()} /{" "}
              {stage.total.toLocaleString()} 项
            </span>
          </div>
          <Progress
            percent={percent}
            status={
              connectionError || partial
                ? "exception"
                : complete
                ? "success"
                : "normal"
            }
            aria-label="资源处理进度"
          />
          <div className={styles.stats}>
            <div>
              <span>已更新</span>
              <strong>{update.changed.toLocaleString()} 项</strong>
            </div>
            <div>
              <span>已下载</span>
              <strong data-testid="resource-update-bytes">
                {bytes(update.downloadedBytes)}
              </strong>
            </div>
          </div>
          {active && (
            <div
              className={styles.transfer}
              data-testid="resource-update-transfer"
            >
              {transfer && !connectionError ? (
                <>
                  <div className={styles.progressHeading}>
                    <span>正在下载{labels[transfer.kind] || "资源"}</span>
                    <span>
                      {bytes(transfer.received)}
                      {transfer.total > 0 && ` / ${bytes(transfer.total)}`}
                    </span>
                  </div>
                  {transfer.total > 0 && (
                    <Progress
                      size="small"
                      showInfo={false}
                      percent={Math.min(
                        100,
                        (transfer.received / transfer.total) * 100,
                      )}
                      aria-label="当前文件下载进度"
                    />
                  )}
                </>
              ) : (
                <p className={styles.note}>
                  {connectionError ? "等待进度连接恢复…" : "正在检查后续资源…"}
                </p>
              )}
            </div>
          )}
          {update.missing > 0 && (
            <p className={styles.note}>
              有 {update.missing.toLocaleString()}{" "}
              项上游暂未提供的资源，已跳过。
            </p>
          )}
          {partial && (
            <Alert
              type="warning"
              showIcon
              message={`${update.failed.toLocaleString()} 项资源未能更新，可重试补齐。`}
            />
          )}
          {connectionError && (
            <Alert
              type="warning"
              showIcon
              message={connectionError}
              data-testid="resource-update-connection-error"
            />
          )}
        </div>
      </Modal>
      {!open &&
        (update.hasUpdates || reloadAvailable) &&
        createPortal(
          <Button
            className={styles.reopen}
            icon={<CloudDownloadOutlined />}
            onClick={() => setOpen(true)}
            aria-label="查看资源更新进度"
          >
            {connectionError || partial
              ? "资源更新未完成"
              : complete
              ? "资源已更新"
              : `资源更新 · ${percent}%`}
          </Button>,
          document.body,
        )}
    </>
  );
}
