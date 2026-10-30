import { proxy } from "valtio";

import { sendSelectMultiResponse, sendSelectSingleResponse } from "@/api";
import type { Container } from "@/container";
import { getUIContainer, isCurrentUIContainer } from "@/container/compat";
import { matStore } from "@/stores";

import type { Option } from "../Message/SelectCardsModal";
import { getDuelEpoch } from "../Message/session";
import { clearSelectInfo } from "../utils/clearSelectInfo";
import { resetFieldSelection } from "./fieldSelection";
import { selectionKey } from "./selectionRules";

interface MaterialRequest {
  selectables: Option[];
  selecteds: Option[];
  fieldSelection: boolean;
  min: number;
  max: number;
  finishable: boolean;
  cancelable: boolean;
}

export const materialSelection = proxy({
  active: false,
  requestId: 0,
  waiting: false,
  canceling: false,
  pendingKey: "",
  queued: [] as string[],
  selectables: [] as Option[],
  selecteds: [] as Option[],
  fieldSelection: false,
  min: 0,
  max: 0,
  finishable: false,
  cancelable: false,
});

let owner: Container | undefined;
let epoch = 0;
let pending: { expected: Set<string> } | undefined;

function current(requestId: number) {
  return (
    materialSelection.active &&
    owner === getUIContainer() &&
    epoch === getDuelEpoch() &&
    requestId === materialSelection.requestId
  );
}

function candidates() {
  return [...materialSelection.selectables, ...materialSelection.selecteds];
}

export function materialSelectedKeys() {
  const keys = new Set(materialSelection.selecteds.map(selectionKey));
  for (const key of [
    materialSelection.pendingKey,
    ...materialSelection.queued,
  ]) {
    if (!key) continue;
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
  }
  return [...keys];
}

function sendToggle(option: Option) {
  if (!owner || option.response === undefined) return;
  const key = selectionKey(option);
  const expected = new Set(materialSelection.selecteds.map(selectionKey));
  if (expected.has(key)) expected.delete(key);
  else expected.add(key);
  pending = { expected };
  materialSelection.pendingKey = key;
  materialSelection.waiting = true;
  sendSelectMultiResponse(owner.conn, [option.response]);
}

function pump() {
  if (!current(materialSelection.requestId) || materialSelection.waiting)
    return;
  if (materialSelection.canceling) {
    // A finishable request also uses -1 to COMMIT: undo every material first.
    const selected = materialSelection.selecteds.at(-1);
    if (selected) sendToggle(selected);
    else {
      materialSelection.canceling = false;
      if (materialSelection.cancelable) {
        const container = owner!;
        resetMaterialSelection();
        sendSelectSingleResponse(container.conn, -1);
      }
    }
    return;
  }
  while (materialSelection.queued.length) {
    const key = materialSelection.queued.shift()!;
    const option = candidates().find((option) => selectionKey(option) === key);
    // The kernel may have removed a queued candidate after the previous choice.
    if (option) {
      sendToggle(option);
      return;
    }
  }
}

/** Every click is checked by the engine; only the whole valid group needs confirmation. */
export function showMaterialSelection(
  container: Container,
  request: MaterialRequest,
) {
  if (!isCurrentUIContainer(container)) return;
  const sameSession = owner === container && epoch === getDuelEpoch();
  const selected = new Set(request.selecteds.map(selectionKey));
  const continuation =
    sameSession &&
    pending &&
    selected.size === pending.expected.size &&
    [...selected].every((key) => pending!.expected.has(key));
  if (!continuation) {
    materialSelection.queued = [];
    materialSelection.canceling = false;
  }
  clearSelectInfo();
  owner = container;
  epoch = getDuelEpoch();
  pending = undefined;
  Object.assign(materialSelection, request, {
    active: true,
    waiting: false,
    pendingKey: "",
    requestId: materialSelection.requestId + 1,
  });
  if (request.fieldSelection) {
    Object.assign(matStore.selectUnselectInfo, {
      selectableList: request.selectables.map((option) => option.location!),
      selectedList: request.selecteds.map((option) => option.location!),
      finishable: request.finishable,
      cancelable: request.cancelable,
    });
  }
  pump();
}

export function toggleMaterial(key: string, requestId: number) {
  if (!current(requestId) || materialSelection.canceling) return;
  if (!candidates().some((option) => selectionKey(option) === key)) return;
  const queued = materialSelection.queued.indexOf(key);
  if (queued >= 0) materialSelection.queued.splice(queued, 1);
  else materialSelection.queued.push(key);
  pump();
}

export function cancelMaterials(requestId: number) {
  if (!current(requestId)) return;
  materialSelection.queued = [];
  materialSelection.canceling = true;
  pump();
}

export function confirmMaterials(requestId: number) {
  if (
    !current(requestId) ||
    !materialSelection.finishable ||
    materialSelection.waiting ||
    materialSelection.queued.length ||
    materialSelection.canceling
  )
    return;
  const container = owner!;
  resetMaterialSelection();
  sendSelectSingleResponse(container.conn, -1);
}

export function resetMaterialSelection() {
  if (!owner && !materialSelection.active) return;
  owner = undefined;
  pending = undefined;
  Object.assign(materialSelection, {
    active: false,
    waiting: false,
    canceling: false,
    pendingKey: "",
    queued: [],
    selectables: [],
    selecteds: [],
    requestId: materialSelection.requestId + 1,
  });
  clearSelectInfo();
  resetFieldSelection();
}
