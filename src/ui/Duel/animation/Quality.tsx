import { DashboardOutlined } from "@ant-design/icons";
import { Button, Dropdown, Tooltip } from "antd";
import { useSnapshot } from "valtio";

import {
  type AnimationMode,
  animationQuality,
  animationSettings,
  setAnimationMode,
} from "./runtime";

export function AnimationQualityControl() {
  const settings = useSnapshot(animationSettings);
  const { mode } = settings;
  const qualityLabel = { full: "完整", lite: "轻量", off: "减少动画" }[
    animationQuality(settings)
  ];
  const modes: [AnimationMode, string][] = [
    ["auto", "自动"],
    ["full", "完整"],
    ["lite", "轻量"],
    ["off", "减少动画"],
  ];
  return (
    <Tooltip
      title={`决斗动画：${modes.find(
        ([key]) => key === animationSettings.mode,
      )?.[1]}（当前${qualityLabel}）`}
    >
      <Dropdown
        trigger={["click"]}
        menu={{
          selectable: true,
          selectedKeys: [mode],
          items: modes.map(([key, label]) => ({
            key,
            label,
            onClick: () => setAnimationMode(key),
          })),
        }}
      >
        <Button
          data-testid="duel-animation-quality"
          aria-label="决斗动画质量"
          type="text"
          icon={<DashboardOutlined />}
        />
      </Dropdown>
    </Tooltip>
  );
}
