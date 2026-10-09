import { type CSSProperties, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";

import { fetchCard } from "@/api";
import { matStore } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import styles from "./index.module.scss";
import { NegationEffect } from "./NegationEffect";
import { combatPresentation } from "./present";
import {
  animationQuality,
  animationSettings,
  type DuelCue,
  duelTimeline,
  startAnimationRuntime,
} from "./runtime";

const cueClasses = styles as Record<string, string>;
const fieldFeedbackKinds = new Set<DuelCue["kind"]>(["target", "impact"]);
const captionKinds = new Set<DuelCue["kind"]>([
  "phase",
  "turn",
  "life",
  "result",
]);
const typeTones = {
  fusion: "#c697ff",
  synchro: "#b5fff1",
  xyz: "#ffdc7a",
  link: "#6ad7ff",
  ritual: "#79a6ff",
  pendulum: "#7cffbb",
  normal: "#ffedb0",
};
const cueTone = (cue: DuelCue) =>
  cue.tone ??
  (cue.summonType
    ? typeTones[cue.summonType]
    : cue.kind === "banish"
    ? "#c49cff"
    : cue.kind === "negate" || cue.kind === "destroy"
    ? "#ff9a8e"
    : "#ffe0a2");

export function DuelEffects() {
  const { cues, reveal } = useSyncExternalStore(
    duelTimeline.subscribe,
    duelTimeline.getSnapshot,
  );
  const settings = useSnapshot(animationSettings);
  const hasChain = useSnapshot(matStore).chainDetails.length > 1;
  const combat = useSnapshot(combatPresentation);
  const quality = animationQuality(settings);
  useEffect(startAnimationRuntime, []);
  useEffect(() => {
    const clear = (event: PointerEvent) => {
      if (!(event.target as Element)?.closest?.('[data-testid="duel-card"]'))
        combatPresentation.relations = [];
    };
    document.addEventListener("pointerdown", clear);
    return () => document.removeEventListener("pointerdown", clear);
  }, []);
  return createPortal(
    <div
      className={styles.layer}
      data-duel-animation-quality={quality}
      aria-hidden="true"
    >
      {combat.relations.length > 0 && (
        <svg
          className={styles.aim}
          width="100%"
          height="100%"
          data-testid="duel-card-relations"
        >
          {combat.relations.map((line, index) => (
            <g
              key={index}
              stroke={line.equip ? "#91e9cc" : "#e8ca7e"}
              strokeWidth="2"
              fill="none"
            >
              <line
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
              />
              <circle cx={line.to.x} cy={line.to.y} r="9" />
            </g>
          ))}
        </svg>
      )}
      {combat.attack && (
        <svg
          className={styles.aim}
          data-testid="duel-attack-aim"
          width="100%"
          height="100%"
        >
          <defs>
            <marker
              id="duel-aim-tip"
              markerWidth="9"
              markerHeight="9"
              refX="8"
              refY="4.5"
              orient="auto"
            >
              <path d="M0,0 L9,4.5 L0,9 Z" fill={combat.attack.tone} />
            </marker>
          </defs>
          <line
            x1={combat.attack.from.x}
            y1={combat.attack.from.y}
            x2={combat.attack.to.x}
            y2={combat.attack.to.y}
            stroke={combat.attack.tone}
            strokeWidth="3"
            strokeDasharray="10 8"
            markerEnd="url(#duel-aim-tip)"
          />
          {combat.attack.direct && (
            <text
              x={combat.attack.to.x}
              y={combat.attack.to.y - 18}
              textAnchor="middle"
              fill={combat.attack.tone}
            >
              DIRECT ATTACK
            </text>
          )}
        </svg>
      )}
      {cues.map((cue) =>
        cue.kind === "negate" ? (
          <NegationEffect key={cue.id} cue={cue} quality={quality} />
        ) : (
          <div
            key={cue.id}
            data-testid="duel-event-effect"
            data-effect-kind={cue.kind}
            data-summon-type={cue.summonType}
            className={`${styles.cue} ${cueClasses[cue.kind] ?? ""} ${
              cue.point ? styles.anchored : styles.banner
            } ${cue.summonType ? cueClasses[cue.summonType] ?? "" : ""}`}
            style={
              {
                "--tone": cueTone(cue),
                "--duration": `${cue.duration}ms`,
                left: cue.point ? cue.point.x : undefined,
                top: cue.point ? cue.point.y : undefined,
                "--size": `${Math.max(
                  64,
                  Math.min(cue.point?.width ?? 100, 140),
                )}px`,
              } as CSSProperties
            }
          >
            {cue.point && fieldFeedbackKinds.has(cue.kind) && (
              <>
                <i className={styles.ring} />
                <i className={styles.innerRing} />
                {cue.summonType === "link" && quality === "full" && (
                  <svg className={styles.linkGate} viewBox="0 0 100 100">
                    <path
                      d="M50 0 L100 50 L50 100 L0 50 Z M50 14 L86 50 L50 86 L14 50 Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M45 4 L55 4 L50 14 Z M96 45 L96 55 L86 50 Z M45 96 L55 96 L50 86 Z M4 45 L4 55 L14 50 Z"
                      fill="currentColor"
                    />
                  </svg>
                )}
                {quality === "full" &&
                  cue.kind === "impact" &&
                  Array.from({ length: 6 }, (_, i) => (
                    <i
                      key={i}
                      className={styles.ray}
                      style={{ "--angle": `${i * 60}deg` } as CSSProperties}
                    />
                  ))}
              </>
            )}
            {cue.label && captionKinds.has(cue.kind) && (
              <span className={styles.caption}>{cue.label}</span>
            )}
          </div>
        ),
      )}
      {reveal &&
        !reveal.live &&
        quality === "full" &&
        ["activate", "resolve", "chain"].includes(reveal.kind) && (
          <div
            className={styles.scrim}
            key={`scrim:${reveal.id}`}
            style={{ "--duration": `${reveal.duration}ms` } as CSSProperties}
          />
        )}
      {reveal && (
        <div
          key={reveal.id}
          className={`${styles.reveal} ${cueClasses[reveal.kind] ?? ""} ${
            reveal.opponent ? styles.opponent : ""
          }`}
          data-testid="duel-card-reveal"
          data-effect-kind={reveal.kind}
          data-effect-live={reveal.live}
          data-chain-index={reveal.index}
          data-card-code={reveal.code}
          style={
            {
              "--tone": cueTone(reveal),
              "--duration": `${reveal.duration}ms`,
            } as CSSProperties
          }
        >
          {reveal.kind === "chain" && (
            <div className={styles.chainWord}>CHAIN</div>
          )}
          <div className={styles.revealCards}>
            {quality === "full" &&
              reveal.kind === "special" &&
              !!reveal.materialCodes?.length && (
                <div className={styles.materials}>
                  {reveal.materialCodes.slice(0, 4).map((code, index) => (
                    <YgoCard
                      key={index}
                      code={code}
                      className={styles.materialArt}
                      urgent
                      style={
                        {
                          "--material-x": `${
                            (index % 2 ? 1 : -1) * (index < 2 ? 100 : 145)
                          }px`,
                          "--material-y": `${index < 2 ? -25 : 25}px`,
                          "--duration": `${reveal.duration}ms`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              )}
            {reveal.previousCode !== undefined && (
              <div className={styles.previous}>
                <YgoCard
                  code={reveal.previousCode}
                  className={styles.art}
                  urgent
                />
                <b>{reveal.previousIndex}</b>
              </div>
            )}
            {reveal.previousCode !== undefined && (
              <svg
                className={styles.chainJoin}
                width="32"
                height="48"
                viewBox="0 0 32 48"
              >
                <g stroke="currentColor" strokeWidth="3" fill="none">
                  <rect
                    x="4"
                    y="5"
                    width="13"
                    height="25"
                    rx="6"
                    transform="rotate(-30 10 17)"
                  />
                  <rect
                    x="14"
                    y="19"
                    width="13"
                    height="25"
                    rx="6"
                    transform="rotate(-30 20 31)"
                  />
                </g>
              </svg>
            )}
            {reveal.code !== undefined && (
              <div className={styles.current}>
                <YgoCard
                  code={reveal.code}
                  name={fetchCard(reveal.code).text.name}
                  className={styles.art}
                  urgent
                />
                {hasChain && reveal.index && <b>{reveal.index}</b>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
