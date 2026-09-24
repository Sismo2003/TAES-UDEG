import { useEffect, useState } from 'react';

/**
 * Retrasa la propagación de un valor. Se usa para el buscador de las tablas:
 * sin esto, cada tecla dispara un request al backend.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
