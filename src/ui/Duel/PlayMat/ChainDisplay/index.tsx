import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { fetchCard, ygopro } from "@/api";
import { type ChainDetail, matStore } from "@/stores";
import { showCardModal } from "@/ui/Duel/Message/CardModal";
import { YgoCard } from "@/ui/Shared";

import styles from "./index.module.scss";

const zoneNames: Record<number, string> = {
  [ygopro.CardZone.HAND]: "手牌",
  [ygopro.CardZone.MZONE]: "怪兽区",
  [ygopro.CardZone.SZONE]: "魔陷区",
  [ygopro.CardZone.GRAVE]: "墓地",
  [ygopro.CardZone.REMOVED]: "除外区",
  [ygopro.CardZone.DECK]: "卡组",
  [ygopro.CardZone.EXTRA]: "额外卡组",
};

export const ChainDisplay: React.FC = () => {
  const snap = useSnapshot(matStore);
  const [expiredDetails, setExpiredDetails] = useState<
    readonly ChainDetail[] | undefined
  >();
  const chainDetails = snap.chainDetails.length
    ? snap.chainDetails
    : snap.completedChainDetails !== expiredDetails
    ? snap.completedChainDetails
    : [];
  const entriesRef = useRef<HTMLDivElement>(null);
  const english = /^(en|br|pt|fr|es)/i.test(
    localStorage.getItem("language") ?? "",
  );

  useEffect(() => {
    const completed = snap.completedChainDetails;
    if (!completed.length) return;
    const timer = setTimeout(() => setExpiredDetails(completed), 1400);
    return () => clearTimeout(timer);
  }, [snap.completedChainDetails]);

  useEffect(() => {
    const list = entriesRef.current;
    if (!list) return;
    // Follow new links unless the player scrolled up to inspect an earlier one.
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 90)
      list.scrollTop = list.scrollHeight;
  }, [chainDetails.length]);

  if (chainDetails.length < 2) return null;

  const label = (entry: ChainDetail) => {
    const side = matStore.isMe(entry.controller)
      ? english
        ? "Your"
        : "我方"
      : english
      ? "Opponent"
      : "对方";
    const zone = english
      ? ygopro.CardZone[entry.zone]
      : zoneNames[entry.zone] ?? ygopro.CardZone[entry.zone];
    return english ? `${side} · ${zone}` : `${side}${zone}`;
  };

  const name = (code: number) => fetchCard(code).text.name || `#${code}`;

  return (
    <div className={styles.layer}>
      {chainDetails.length > 0 && (
        <section
          className={styles.stack}
          data-testid="duel-chain-stack"
          aria-label={english ? "Current chain" : "当前连锁"}
        >
          <div className={styles.heading}>
            <span>{english ? "CHAIN" : "连锁"}</span>
            <span>{chainDetails.length}</span>
          </div>
          <div className={styles.entries} ref={entriesRef}>
            {chainDetails.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={`${styles.entry} ${
                  entry.resolved
                    ? styles.resolved
                    : entry.resolving
                    ? styles.resolving
                    : ""
                } ${matStore.isMe(entry.controller) ? "" : styles.opponent}`}
                data-testid="duel-chain-entry"
                data-chain-index={entry.index}
                data-chain-code={entry.code}
                data-chain-resolved={entry.resolved}
                data-chain-negated={entry.negated}
                data-chain-resolving={entry.resolving}
                onClick={() => showCardModal({ meta: fetchCard(entry.code) })}
                aria-label={`${english ? "Chain" : "连锁"} ${
                  entry.index
                }: ${name(entry.code)}, ${label(entry)}${
                  entry.negated ? (english ? ", negated" : ", 已无效") : ""
                }, ${
                  entry.resolving
                    ? english
                      ? "resolving"
                      : "结算中"
                    : entry.resolved
                    ? english
                      ? "resolved"
                      : "已处理"
                    : english
                    ? "pending"
                    : "待处理"
                }`}
              >
                <span className={styles.index}>{entry.index}</span>
                <YgoCard
                  code={entry.code}
                  name={name(entry.code)}
                  className={styles.smallArt}
                  urgent
                />
                <span className={styles.entryText}>
                  <strong>{name(entry.code)}</strong>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
