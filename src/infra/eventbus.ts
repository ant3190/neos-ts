import { EventEmitter } from "eventemitter3";

import { createLocalId } from "./localId";

const eventEmitter = new EventEmitter();
const cardHandlers = new Map<string, (...args: any[]) => Promise<boolean>>();
const pendingCardCalls = new Map<string, Set<() => void>>();
const CARD_HANDLER_WAIT_MS = 5000;

export enum Task {
  Move = "move", // 卡片移动
  Focus = "focus", // 卡片聚焦
  Attack = "attack", // 卡片攻击
  Mora = "mora", // 猜拳
  Tp = "tp", // 选边
}

const getEnd = (task: Task) => `${task}-end`;
const cardKey = (task: Task, uuid: string) => `${task}:${uuid}`;
const isCardTask = (task: Task) =>
  task === Task.Move || task === Task.Focus || task === Task.Attack;

/** 在组件之中注册方法，注意注册的方法一旦执行成功，必须返回一个true */
const register = <T extends unknown[]>(
  task: Task,
  fn: (...args: T) => Promise<boolean>,
  uuid?: string,
) => {
  if (uuid !== undefined && isCardTask(task)) {
    const key = cardKey(task, uuid);
    const handler = fn as (...args: any[]) => Promise<boolean>;
    cardHandlers.set(key, handler);
    for (const resume of pendingCardCalls.get(key) ?? []) resume();
    pendingCardCalls.delete(key);
    return () => {
      if (cardHandlers.get(key) === handler) cardHandlers.delete(key);
    };
  }
  const listener = async ({ taskId, args }: { taskId: string; args: T }) => {
    const result = await fn(...args);
    if (result) eventEmitter.emit(getEnd(task), taskId);
  };
  eventEmitter.on(task, listener);
  return () => eventEmitter.off(task, listener);
};

/** 在service之中调用组件中的方法 */
const call = (task: Task, ...args: any[]) => {
  if (isCardTask(task) && typeof args[0] === "string") {
    const key = cardKey(task, args[0]);
    return new Promise<void>((resolve, reject) => {
      const run = () => {
        clearTimeout(timer);
        pendingCardCalls.get(key)?.delete(run);
        Promise.resolve(cardHandlers.get(key)!(...args)).then(
          () => resolve(),
          reject,
        );
      };
      const handler = cardHandlers.get(key);
      if (handler) {
        Promise.resolve(handler(...args)).then(() => resolve(), reject);
        return;
      }
      const timer = setTimeout(() => {
        pendingCardCalls.get(key)?.delete(run);
        if (pendingCardCalls.get(key)?.size === 0) pendingCardCalls.delete(key);
        console.warn(`Card animation handler was not mounted: ${key}`);
        resolve();
      }, CARD_HANDLER_WAIT_MS);
      if (!pendingCardCalls.has(key)) pendingCardCalls.set(key, new Set());
      pendingCardCalls.get(key)!.add(run);
    });
  }
  return new Promise<void>((rs) => {
    const taskId = createLocalId();
    const cb = (respTaskId: string) => {
      if (respTaskId === taskId) {
        eventEmitter.removeListener(getEnd(task), cb);
        rs();
      }
    };
    eventEmitter.on(getEnd(task), cb);
    eventEmitter.emit(task, { taskId, args });
  });
};

export const eventbus = {
  call,
  register,
  on: eventEmitter.on.bind(eventEmitter),
  off: eventEmitter.off.bind(eventEmitter),
  once: eventEmitter.once.bind(eventEmitter),
  emit: eventEmitter.emit.bind(eventEmitter),
};
