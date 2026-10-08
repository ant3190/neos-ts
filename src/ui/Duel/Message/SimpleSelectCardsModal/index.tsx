// import "./index.scss";
import { INTERNAL_Snapshot as Snapshot, proxy, useSnapshot } from "valtio";

import { type Option, SelectCardsModal } from "../SelectCardsModal";
import { PromptSession } from "../session";

const defaultProps = {
  isOpen: false,
  selectables: [] as Option[],
};

const localStore = proxy({ ...defaultProps, promptId: 0 });
const session = new PromptSession<Snapshot<Option[]>>();

export const SimpleSelectCardsModal: React.FC = () => {
  const { isOpen, selectables } = useSnapshot(localStore);
  const promptId = localStore.promptId;
  const submit = (options: Snapshot<Option[]>) => {
    if (!localStore.isOpen || localStore.promptId !== promptId) return;
    localStore.isOpen = false;
    session.settle(options);
  };
  return (
    <SelectCardsModal
      isOpen={isOpen}
      min={1}
      max={1}
      single={false}
      selecteds={[]}
      mustSelects={[]}
      selectables={selectables}
      cancelable
      finishable={false}
      totalLevels={0}
      overflow
      onSubmit={submit}
      onFinish={() => submit([])}
      onCancel={() => submit([])}
    />
  );
};

export const displaySimpleSelectCardsModal = async (
  args: Omit<typeof defaultProps, "isOpen">,
) => {
  const pending = session.begin([]);
  localStore.selectables = args.selectables;
  localStore.promptId = pending.id;
  localStore.isOpen = true;
  const res = await pending.promise;
  if (session.current(pending.id)) localStore.isOpen = false;
  return res;
};

export const resetSimpleSelectCardsModal = () => {
  localStore.isOpen = false;
  localStore.selectables = [];
  session.reset([]);
};
