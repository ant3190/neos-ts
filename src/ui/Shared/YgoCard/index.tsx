import classNames from "classnames";
import { CSSProperties, useState } from "react";

import { getCardImgUrl } from "@/api";
import { useConfig } from "@/config";

import styles from "./index.module.scss";

const { assetsPath } = useConfig();

interface Props {
  "data-card-face"?: boolean;
  className?: string;
  isBack?: boolean;
  code?: number;
  targeted?: boolean;
  disabled?: boolean;
  urgent?: boolean;
  name?: string;
  // cardName?: string;
  style?: CSSProperties;
  width?: number | string;
  onClick?: () => void;
  onLoad?: () => void;
}

export const YgoCard: React.FC<Props> = (props) => {
  const {
    className,
    code = 0,
    // cardName,
    isBack = false,
    targeted = false,
    disabled = false,
    urgent = false,
    name,
    width,
    style,
    onClick,
    onLoad,
  } = props;
  const src = getCardImgUrl(code, isBack);
  const [loadedSrc, setLoadedSrc] = useState("");
  const [loadError, setLoadError] = useState({
    src: "",
    attempts: 0,
    retryKey: 0,
  });
  const attempts = loadError.src === src ? loadError.attempts : 0;
  const failed = attempts >= 2;
  const imageSrc =
    attempts === 1
      ? `${src}${src.includes("?") ? "&" : "?"}retry=${loadError.retryKey}`
      : src;
  const knownFace = urgent && !isBack && code !== 0;
  // The preload may finish before this particular DOM image is painted.
  const artReady = !knownFace || loadedSrc === imageSrc;
  const waitingForArt = knownFace && !artReady && !failed;
  const caption = name?.trim() || "卡图加载中";

  return (
    <div
      data-card-face={props["data-card-face"]}
      className={classNames(styles["ygo-card"], className)}
      style={{
        width,
        ...style,
      }}
      onClick={onClick}
    >
      {waitingForArt && <span className={styles.pending}>{caption}</span>}
      {failed ? (
        <span className={styles.missing}>
          {isBack || code === 0 ? "NEOS" : name?.trim() || "卡图加载失败"}
        </span>
      ) : (
        <img
          className={styles.art}
          src={imageSrc}
          alt={isBack || code === 0 ? "" : `Card ${code}`}
          decoding="async"
          loading={urgent ? "eager" : undefined}
          {...(urgent ? { fetchpriority: "high" } : {})}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            const currentSrc = imageSrc;
            const show = () => {
              if (!image.complete || image.naturalWidth === 0) return;
              setLoadedSrc(currentSrc);
              onLoad?.();
            };
            if (knownFace && typeof image.decode === "function") {
              image.decode().then(show, show);
            } else {
              show();
            }
          }}
          style={{ opacity: artReady ? 1 : 0 }}
          onError={() =>
            setLoadError({ src, attempts: attempts + 1, retryKey: Date.now() })
          }
        />
      )}
      {targeted && (
        <div className={styles.targeted}>
          <img src={`${assetsPath}/targeted.png`} alt="" />
        </div>
      )}
      {disabled && (
        <div className={styles.disabled}>
          <img src={`${assetsPath}/disabled.png`} alt="" />
        </div>
      )}
    </div>
  );
};
