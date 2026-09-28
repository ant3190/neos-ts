import type { SpringConfig, SpringRef } from "@react-spring/web";

// A stalled browser should not make each subsequent card wait again.
let animationStalled = false;

export const asyncStart = <T extends {}>(api: SpringRef<T>) => {
  return (p: Partial<T> & { config?: SpringConfig }) => {
    const target = { ...p };
    delete target.config;
    if (animationStalled || p.config?.duration === 0) {
      api.set(target as T);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      // 如果浏览器暂停了动画帧，之后的卡片直接显示在目标位置。
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        animationStalled = true;
        try {
          api.stop();
          api.set(target as T);
        } catch (error) {
          console.error("Could not finish card animation:", error);
        }
        resolve();
      }, 900);
      try {
        api.start({ ...p, onResolve: finish });
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    });
  };
};
