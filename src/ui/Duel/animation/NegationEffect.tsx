import { type CSSProperties, useLayoutEffect } from "react";

import { fetchCard } from "@/api";
import { YgoCard } from "@/ui/Shared";

import styles from "./index.module.scss";
import { type DuelCue, getCardElement } from "./runtime";

/** Reuse the painted source card; no image request or spring/message wait. */
export function NegationEffect({
  cue,
  quality,
}: {
  cue: DuelCue & { id: number };
  quality: "full" | "lite" | "off";
}) {
  const card = getCardElement(cue.cardUuid);
  useLayoutEffect(() => {
    if (!card) return;
    const token = String(cue.id);
    const animations: Animation[] = [];
    card.dataset.cardNegating = token;
    card.dataset.cardNegation = cue.negation ?? "effect";
    card.dataset.cardNegationMotion = quality;
    const wrap = card.querySelector<HTMLElement>("[data-card-negation-wrap]");
    const face = card.querySelector<HTMLElement>("[data-card-face]");
    if (quality !== "off" && wrap?.animate && face?.animate) {
      const flip = Number.parseFloat(card.style.getPropertyValue("--ry")) || 0;
      const fan =
        card.dataset.cardZone === "HAND"
          ? Number.parseFloat(card.style.getPropertyValue("--hand-angle")) || 0
          : 0;
      const lifted = `translateY(-${
        quality === "full" ? 8 : 4
      }px) translateZ(16px) rotateY(${-flip}deg) rotateZ(${-fan}deg) scale(${
        quality === "full" ? 1.12 : 1.04
      })`;
      const options = { duration: cue.duration, easing: "linear" };
      animations.push(
        wrap.animate(
          [
            { transform: "none", offset: 0 },
            { transform: lifted, offset: 0.1 },
            { transform: lifted, offset: 0.8 },
            { transform: "none", offset: 1 },
          ],
          options,
        ),
        face.animate(
          [
            { filter: "grayscale(var(--card-monochrome))", offset: 0 },
            { filter: "grayscale(1)", offset: 0.1 },
            { filter: "grayscale(1)", offset: 0.8 },
            { filter: "grayscale(var(--card-monochrome))", offset: 1 },
          ],
          options,
        ),
      );
    }
    return () => {
      animations.forEach((animation) => animation.cancel());
      // Another link of the same card can supersede this cue.
      if (card.dataset.cardNegating !== token) return;
      delete card.dataset.cardNegating;
      delete card.dataset.cardNegation;
      delete card.dataset.cardNegationMotion;
    };
  }, [card, cue.duration, cue.id, cue.negation, quality]);

  if (card || !cue.code) return null;
  // Buried pile cards have no painted DOM face: briefly show the public chain
  // identity at its pile instead of revealing some other card on top of it.
  return (
    <div
      className={styles.negationAtSource}
      data-testid="duel-card-negation"
      data-card-code={cue.code}
      data-card-negation={cue.negation}
      data-chain-index={cue.index}
      style={
        {
          left: Math.max(
            64,
            Math.min(
              cue.point?.x ?? window.innerWidth / 2,
              window.innerWidth - 64,
            ),
          ),
          top: Math.max(
            96,
            Math.min(
              cue.point?.y ?? window.innerHeight / 2,
              window.innerHeight - 96,
            ),
          ),
          "--duration": `${cue.duration}ms`,
        } as CSSProperties
      }
    >
      <YgoCard
        code={cue.code}
        name={fetchCard(cue.code).text.name}
        className={styles.negationArt}
        urgent
      />
    </div>
  );
}
