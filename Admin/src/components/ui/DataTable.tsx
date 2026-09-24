import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { inputClass, selectClass } from './formStyles';

export interface Column<T> {
  /** Coincide con el campo `sort` que acepta el endpoint cuando `sortable`. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Se oculta en pantallas chicas dentro de la tabla (la tarjeta la muestra). */
  className?: string;
  width?: string;
}

export interface SortState {
  field: string;
  dir: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;

  /** Paginación server-side: la tabla nunca corta filas por su cuenta. */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;

  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  /** Selects/toggles propios de la pantalla, a la izquierda de las acciones. */
  filters?: ReactNode;
  actions?: ReactNode;

  isLoading?: boolean;
  emptyMessage?: string;
  /** Vista de una fila en móvil. Sin esto, se apilan las columnas con su header. */
  mobileCard?: (row: T) => ReactNode;
}

const PAGE_SIZES = [10, 25, 50, 100];

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * Tabla del panel: búsqueda con debounce, filtros, headers ordenables,
 * paginación server-side y colapso a tarjetas en móvil.
 *
 * No filtra ni ordena en el cliente a propósito: el que sabe hacerlo con un
 * padrón de miles de filas es PostgreSQL. Acá sólo se emiten los parámetros.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  sort,
  onSortChange,
  filters,
  actions,
  isLoading = false,
  emptyMessage = 'Sin resultados.',
  mobileCard,
}: DataTableProps<T>) {
  const [term, setTerm] = useState(search ?? '');
  const debounced = useDebouncedValue(term);

  // El input escribe local y avisa al padre recién cuando se estabiliza.
  useEffect(() => {
    if (onSearchChange && debounced !== (search ?? '')) onSearchChange(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    const dir = sort?.field === key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ field: key, dir });
  };

  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface)">
      {/* Toolbar */}
      {(onSearchChange || filters || actions) && (
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-(--color-border)">
          {onSearchChange && (
            <div className="relative flex-1 min-w-52">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-ink-subtle)"
              />
              <input
                className={cn(inputClass, 'pl-9 pr-9')}
                placeholder={searchPlaceholder}
                value={term}
                onChange={(e) => setTerm(e.currentTarget.value)}
              />
              {term && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--color-ink-subtle) hover:text-(--color-ink)"
                  onClick={() => setTerm('')}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}
          {filters}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Tabla (desde md) */}
      <div className="hidden md:block scroll-x">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-(--color-border) bg-(--color-surface-muted)/60">
              {columns.map((col) => {
                const active = sort?.field === col.key;
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted) whitespace-nowrap',
                      alignClass[col.align ?? 'left'],
                      col.className,
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-(--color-ink) transition',
                          active && 'text-(--color-ink)',
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUp size={12} className="opacity-25" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={cn(isLoading && 'opacity-50 transition-opacity')}>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-(--color-border) last:border-0 hover:bg-(--color-surface-muted)/50"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5 align-middle',
                      alignClass[col.align ?? 'left'],
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-(--color-ink-muted)">
                  {isLoading ? 'Cargando…' : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tarjetas (móvil) */}
      <div className={cn('md:hidden divide-y divide-(--color-border)', isLoading && 'opacity-50')}>
        {rows.map((row) => (
          <div key={rowKey(row)} className="p-4">
            {mobileCard ? (
              mobileCard(row)
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {columns.map((col) => (
                  <div key={col.key} className="contents">
                    <dt className="text-xs text-(--color-ink-muted) py-0.5">{col.header}</dt>
                    <dd className="py-0.5">{col.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-8 text-center text-(--color-ink-muted) text-sm">
            {isLoading ? 'Cargando…' : emptyMessage}
          </div>
        )}
      </div>

      {/* Paginación */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-(--color-border)">
        <p className="text-xs text-(--color-ink-muted) tabular-nums">
          {from}–{to} de {total}
        </p>

        <div className="flex items-center gap-2">
          {onPageSizeChange && (
            <select
              aria-label="Filas por página"
              className={cn(selectClass, 'min-h-8 py-1 text-xs w-auto')}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.currentTarget.value))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / pág.
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Página anterior"
              className="inline-flex items-center justify-center size-8 rounded-lg border border-(--color-border) disabled:opacity-40 hover:bg-(--color-surface-muted)"
              disabled={page <= 1 || isLoading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-(--color-ink-muted) tabular-nums px-1">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              aria-label="Página siguiente"
              className="inline-flex items-center justify-center size-8 rounded-lg border border-(--color-border) disabled:opacity-40 hover:bg-(--color-surface-muted)"
              disabled={page >= pageCount || isLoading}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
