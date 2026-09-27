import classNames from "classnames";
import { CSSProperties, useState } from "react";

import { getCardImgUrl } from "@/api";
import { useConfig } from "@/config";

import styles from "./index.module.scss";

const { assetsPath } = useConfig();

interface Props {
  className?: string;
  isBack?: boolean;
  code?: number;
  targeted?: boolean;
  disabled?: boolean;
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
    width,
    style,
    onClick,
    onLoad,
  } = props;
  const src = getCardImgUrl(code, isBack);
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

  return (
    <div
      className={classNames(styles["ygo-card"], className)}
      style={{ width, ...style }}
      onClick={onClick}
    >
      {failed ? (
        <span className={styles.missing}>
          {isBack || code === 0 ? "NEOS" : `#${code}`}
        </span>
      ) : (
        <img
          className={styles.art}
          src={imageSrc}
          alt={isBack || code === 0 ? "" : `Card ${code}`}
          decoding="async"
          draggable={false}
          onLoad={onLoad}
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
