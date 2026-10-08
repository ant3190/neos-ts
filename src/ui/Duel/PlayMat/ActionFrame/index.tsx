import classnames from "classnames";

import type { ActionHighlight } from "../../utils/actionHighlight";
import styles from "./index.module.scss";

/** A transparent frame; never cover the art or intercept a card click. */
export const ActionFrame: React.FC<{
  highlight?: ActionHighlight;
  className?: string;
}> = ({ highlight, className }) =>
  highlight ? (
    <div
      aria-hidden="true"
      data-testid="duel-action-frame"
      data-action-highlight={highlight}
      className={classnames(styles.frame, styles[highlight], className)}
    />
  ) : null;
