import type { SpringConfig, SpringRef } from "@react-spring/web";

export const asyncStart = <T extends {}>(api: SpringRef<T>) => {
  return (p: Partial<T> & { config?: SpringConfig }) =>
    new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      // 如果浏览器暂停了动画帧，及时恢复对战流程并将卡片放到目标位置。
      const timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        const target = { ...p };
        delete target.config;
        try {
          api.stop();
          api.set(target as T);
        } catch (error) {
          console.error("Could not finish card animation:", error);
        }
        resolve();
      }, 2500);
      try {
        api.start({ ...p, onResolve: finish });
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    });
};
