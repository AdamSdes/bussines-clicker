import { useEffect, useState } from 'react';

/** Перерисовка компонента раз в ms — для списков котировок, которым не нужны все 10 тиков в секунду. */
export function useClock(ms = 500) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
