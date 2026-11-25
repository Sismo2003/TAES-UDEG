import { useEffect, useState } from 'react';

/**
 * Alto real de la barra superior del panel. En móvil crece (el título se parte),
 * así que lo que se queda fijo debajo no puede asumir un número.
 */
export function useAppHeaderHeight(fallback = 63): number {
  const [height, setHeight] = useState(fallback);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-header]');
    if (!header) return;
    const observer = new ResizeObserver(() => setHeight(header.offsetHeight));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return height;
}
