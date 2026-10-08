import { INTERNAL_Snapshot as Snapshot, proxy, useSnapshot } from "valtio";

import { sendSelectMultiResponse, sendSelectSingleResponse } from "@/api";
import { getUIContainer } from "@/container/compat";

import { resetFieldSelection } from "../../interaction/fieldSelection";
import {
  type Option,
  SelectCardsModal,
  type SelectCardsModalProps,
} from "../SelectCardsModal";
import { PromptSession } from "../session";

const CANCEL_RESPONSE = -1;
const FINISH_RESPONSE = -1;

const defaultProps: Omit<
  SelectCardsModalProps,
  "onSubmit" | "onCancel" | "onFinish"
> & { isChain: boolean } = {
  isOpen: false,
  isChain: false,
  fieldSelection: false,
  min: 0, // 最少选择多少卡
  max: 0, // 最多选择多少卡
  single: false, // 是否只能单选
  selecteds: [] as Option[],
  selectables: [] as Option[],
  mustSelects: [] as Option[],
  cancelable: false, // 能否取消
  finishable: false, // 选择足够了之后，能否确认
  totalLevels: 0, // 需要的总等级数（用于同调/仪式/...）
  overflow: false, // 选择等级时候，是否可以溢出
};

const localStore = proxy({ ...defaultProps, promptId: 0 });
const session = new PromptSession<void>();

export const SelectActionsModal: React.FC = () => {
  const container = getUIContainer();
  const snap = useSnapshot(localStore);
  const renderedPromptId = localStore.promptId;

  const onSubmit = (options: Snapshot<Option[]>) => {
    if (!localStore.isOpen || renderedPromptId !== localStore.promptId) return;
    const values = options.map((option) => option.response!);
    if (!values.length || values.some((value) => value === undefined)) return;
    localStore.isOpen = false;
    resetFieldSelection();
    if (localStore.isChain) {
      sendSelectSingleResponse(container.conn, values[0]);
    } else {
      sendSelectMultiResponse(container.conn, values);
    }
    session.settle();
  };

  const onFinish = () => {
    if (!localStore.isOpen || renderedPromptId !== localStore.promptId) return;
    localStore.isOpen = false;
    resetFieldSelection();
    sendSelectSingleResponse(container.conn, FINISH_RESPONSE);
    session.settle();
  };

  const onCancel = () => {
    if (!localStore.isOpen || renderedPromptId !== localStore.promptId) return;
    localStore.isOpen = false;
    resetFieldSelection();
    sendSelectSingleResponse(container.conn, CANCEL_RESPONSE);
    session.settle();
  };

  return (
    <SelectCardsModal
      {...{
        ...snap,
        onSubmit,
        onFinish,
        onCancel,
      }}
    />
  );
};

export const displaySelectActionsModal = async (
  args: Partial<Omit<typeof defaultProps, "isOpen">> & {
    fieldSelection?: boolean;
  },
) => {
  const pending = session.begin();
  Object.assign(
    localStore,
    defaultProps,
    { selecteds: [], selectables: [], mustSelects: [], fieldSelection: false },
    args,
  );
  localStore.promptId = pending.id;
  localStore.isOpen = true;
  await pending.promise;
  if (session.current(pending.id)) localStore.isOpen = false;
};

export const cancelSelectActionsModal = () => {
  localStore.isOpen = false;
  localStore.selectables = [];
  localStore.selecteds = [];
  localStore.mustSelects = [];
  session.reset();
};
