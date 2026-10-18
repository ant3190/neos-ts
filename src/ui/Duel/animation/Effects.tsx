import { type CSSProperties, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";

import { fetchCard } from "@/api";
import { matStore } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { mdpro3Asset } from "./assets";
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
const fieldFeedbackKinds = new Set<DuelCue["kind"]>([
  "target",
  "impact",
  "draw",
  "summon",
  "special",
  "flip",
  "set",
  "position",
  "destroy",
  "grave",
  "banish",
  "return",
  "material",
  "release",
]);
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
          <g
            transform={`translate(${combat.attack.from.x} ${
              combat.attack.from.y
            }) rotate(${
              (Math.atan2(
                combat.attack.to.y - combat.attack.from.y,
                combat.attack.to.x - combat.attack.from.x,
              ) *
                180) /
              Math.PI
            })`}
          >
            <image
              href={mdpro3Asset("GUI_Attack_Arrow")}
              x="0"
              y="-12"
              width={Math.hypot(
                combat.attack.to.x - combat.attack.from.x,
                combat.attack.to.y - combat.attack.from.y,
              )}
              height="24"
              preserveAspectRatio="none"
            />
          </g>
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
        ) : cue.kind === "coin" || cue.kind === "dice" ? (
          <TossResult key={cue.id} cue={cue} />
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
                  [
                    "impact",
                    "special",
                    "summon",
                    "destroy",
                    "release",
                  ].includes(cue.kind) &&
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
            {cue.kind === "life" && cue.damage && quality === "full" && (
              <img
                className={styles.damageFrame}
                src={mdpro3Asset("DamageFrame")}
                alt=""
              />
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
          data-summon-type={reveal.summonType}
          style={
            {
              "--tone": cueTone(reveal),
              "--duration": `${reveal.duration}ms`,
            } as CSSProperties
          }
        >
          {reveal.kind === "special" && quality === "full" && (
            <SummonGeometry type={reveal.summonType} />
          )}
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
          {reveal.kind === "special" && (
            <span className={styles.summonLabel}>{reveal.label}</span>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

function TossResult({ cue }: { cue: DuelCue }) {
  const faces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  return (
    <div
      className={styles.toss}
      data-testid="duel-toss-result"
      data-effect-kind={cue.kind}
      style={{ "--duration": `${cue.duration}ms` } as CSSProperties}
    >
      {cue.results?.map((result, index) => (
        <div
          key={index}
          className={cue.kind === "coin" ? styles.coinPiece : styles.dicePiece}
          style={{ "--piece-index": index } as CSSProperties}
          data-result={result}
        >
          {cue.kind === "dice" ? faces[result] ?? result : result ? "正" : "反"}
        </div>
      ))}
    </div>
  );
}

/** Local browser geometry, following each source summon category, never a field backdrop. */
function SummonGeometry({ type }: { type: DuelCue["summonType"] }) {
  return (
    <svg
      className={styles.summonScene}
      viewBox="-100 -100 200 200"
      data-testid="duel-summon-scene"
      data-summon-type={type}
    >
      {type === "fusion" ? (
        <g
          className={styles.vortex}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        >
          <path d="M0-85 C95-85 95 55 0 55 C-65 55-65-30 0-30 C35-30 35 10 0 10" />
          <path d="M0 85 C-95 85-95-55 0-55 C65-55 65 30 0 30 C-35 30-35-10 0-10" />
        </g>
      ) : type === "link" ? (
        <g
          className={styles.portal}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M-40-90 H40 L90-40 V40 L40 90 H-40 L-90 40 V-40 Z M-30-70 H30 L70-30 V30 L30 70 H-30 L-70 30 V-30 Z" />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              transform={`rotate(${i * 45})`}
              d="M-8-86 L0-99 L8-86 M0-99 V-72"
              strokeWidth="4"
            />
          ))}
        </g>
      ) : type === "pendulum" ? (
        <g
          className={styles.pendulums}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="M-75-95 V95 M75-95 V95 M-75-65 Q0-120 75-65 M-75 65 Q0 120 75 65" />
          <path
            d="M-85-20 L-75-40 L-65-20 L-75 0 Z M65 20 L75 0 L85 20 L75 40 Z"
            fill="currentColor"
          />
        </g>
      ) : (
        <g
          className={styles.orbits}
          fill="none"
          stroke="currentColor"
          strokeWidth={type === "xyz" ? 4 : 1.5}
        >
          {[0, 60, 120].map((angle) => (
            <ellipse
              key={angle}
              rx="90"
              ry={type === "ritual" ? 70 : 32}
              transform={`rotate(${angle})`}
            />
          ))}
          {type === "ritual" ? (
            <path d="M0-90 L78 45 H-78 Z" />
          ) : (
            Array.from({ length: 6 }, (_, i) => (
              <circle
                key={i}
                cx={Math.cos((i * Math.PI) / 3) * 78}
                cy={Math.sin((i * Math.PI) / 3) * 78}
                r={type === "synchro" ? 3 : 5}
                fill="currentColor"
              />
            ))
          )}
        </g>
      )}
    </svg>
  );
}
