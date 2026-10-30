import { type ReactNode } from "react";
import { useSnapshot } from "valtio";

import { duelViewport } from "../layout/viewport";
import styles from "./SelectionControls.module.scss";

export function SelectionControls({
  title,
  children,
  testId = "duel-field-selection",
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  const viewport = useSnapshot(duelViewport);
  return (
    <div
      className={styles.layer}
      style={{
        left: -viewport.left / viewport.scale,
        top: -viewport.top / viewport.scale,
        width: window.innerWidth,
        height: window.innerHeight,
        transform: `scale(${1 / viewport.scale})`,
      }}
    >
      <section
        className={styles.controls}
        data-testid={testId}
        role="region"
        aria-label={title}
      >
        <p>{title}</p>
        <div className={styles.buttons}>{children}</div>
      </section>
    </div>
  );
}
