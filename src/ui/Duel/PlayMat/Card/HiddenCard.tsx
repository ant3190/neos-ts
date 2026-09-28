import React, { useEffect } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { eventbus, Task } from "@/infra";
import { cardStore, isCardDisabled } from "@/stores";

/** Keep state visible to replay and selection logic without mounting a spring or image. */
export const HiddenCard: React.FC<{ idx: number }> = React.memo(({ idx }) => {
  const card = cardStore.inner[idx];
  const snap = useSnapshot(card);

  useEffect(() => {
    const complete = async () => true;
    const unsubscribers = [Task.Move, Task.Focus, Task.Attack].map((task) =>
      eventbus.register(task, complete, card.uuid),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [card]);

  const location = snap.location;
  return (
    <div
      data-testid="duel-card"
      data-card-uuid={snap.uuid}
      data-card-code={snap.code}
      data-card-controller={location.controller}
      data-card-zone={ygopro.CardZone[location.zone]}
      data-card-zone-value={location.zone}
      data-card-sequence={location.sequence}
      data-card-position={ygopro.CardPosition[location.position]}
      data-card-position-value={location.position}
      data-card-is-overlay={location.is_overlay}
      data-card-overlay-sequence={location.overlay_sequence}
      data-card-is-token={snap.isToken}
      data-card-status={snap.status}
      data-card-selectable={snap.selectInfo.selectable}
      data-card-selected={snap.selectInfo.selected}
      data-card-targeted={snap.targeted}
      data-card-disabled={isCardDisabled(card)}
      style={{ display: "none" }}
    />
  );
});
