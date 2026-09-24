import { useCallback, useState } from 'react';
import type { SortState } from '../components/ui/DataTable';

/**
 * Estado de una tabla server-side: página, tamaño, búsqueda y orden.
 *
 * Cambiar búsqueda, orden o tamaño SIEMPRE vuelve a la página 1 — si no, se
 * cae en el clásico "busqué algo y la tabla salió vacía" porque quedó parada
 * en la página 7 de un resultado que ahora tiene una.
 */
export function useTableQuery(initial?: { pageSize?: number; sort?: SortState }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(initial?.pageSize ?? 25);
  const [search, setSearchRaw] = useState('');
  const [sort, setSortRaw] = useState<SortState | undefined>(initial?.sort);

  const setSearch = useCallback((value: string) => {
    setSearchRaw(value);
    setPage(1);
  }, []);

  const setSort = useCallback((value: SortState) => {
    setSortRaw(value);
    setPage(1);
  }, []);

  const setPageSize = useCallback((value: number) => {
    setPageSizeRaw(value);
    setPage(1);
  }, []);

  /** Params tal como los espera el backend (`sort` va como `campo:dir`). */
  const params = {
    page,
    pageSize,
    search: search || undefined,
    sort: sort ? `${sort.field}:${sort.dir}` : undefined,
  };

  return { page, pageSize, search, sort, setPage, setPageSize, setSearch, setSort, params };
}
