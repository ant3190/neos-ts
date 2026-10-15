import { ygopro } from "@/api";
const { MZONE, SZONE } = ygopro.CardZone;
import { fetchStrings } from "@/api";
import { Region } from "@/api";
import { fetchCard } from "@/api/cards";
import { Context } from "@/container";

export function isAllOnField(locations: ygopro.CardLocation[]): boolean {
  return (
    locations.length > 0 &&
    locations.every(
      (location) =>
        [MZONE, SZONE].includes(location.zone) && !location.is_overlay,
    )
  );
}

export function canSelectOnField(
  context: Context,
  locations: ygopro.CardLocation[],
) {
  return (
    isAllOnField(locations) &&
    locations.every((location) => !!context.cardStore.find(location))
  );
}

export function computeSetDifference(set1: number[], set2: number[]): number[] {
  const freq1 = new Map<number, number>();
  const freq2 = new Map<number, number>();

  for (const num of set1) {
    freq1.set(num, (freq1.get(num) || 0) + 1);
  }
  for (const num of set2) {
    freq2.set(num, (freq2.get(num) || 0) + 1);
  }

  for (const [num, count] of freq2) {
    if (freq1.has(num)) {
      freq1.set(num, freq1.get(num)! - count);
    }
  }
  const difference: number[] = [];
  for (const [num, count] of freq1) {
    if (count > 0) {
      difference.push(...Array(count).fill(num));
    }
  }

  return difference;
}

export function argmax<T>(arr: T[], getValue: (item: T) => number): number {
  if (arr.length === 0) {
    throw new Error("Array is empty");
  }

  let maxIndex = 0;
  let maxValue = getValue(arr[0]);

  for (let i = 1; i < arr.length; i++) {
    const currentValue = getValue(arr[i]);
    if (currentValue > maxValue) {
      maxValue = currentValue;
      maxIndex = i;
    }
  }

  return maxIndex;
}

export const fetchEsHintMeta = async ({
  context,
  originMsg,
  location,
  cardID,
}: {
  context: Context;
  originMsg: string | number;
  location?: ygopro.CardLocation;
  cardID?: number;
}) => {
  const newOriginMsg =
    typeof originMsg === "string"
      ? originMsg
      : fetchStrings(Region.System, originMsg);

  const cardMeta = cardID ? fetchCard(cardID) : undefined;

  let esHint = newOriginMsg;

  if (cardMeta?.text.name) {
    esHint = esHint.replace("[?]", cardMeta.text.name);
  }

  if (location) {
    const fieldMeta = context.cardStore.at(
      location.zone,
      location.controller,
      location.sequence,
    );
    if (fieldMeta?.meta.text.name) {
      esHint = esHint.replace("[?]", fieldMeta.meta.text.name);
    }
  }

  context.matStore.hint.esHint = esHint;
};
