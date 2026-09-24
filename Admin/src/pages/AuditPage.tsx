import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '../components/ui/PageHeader';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { selectClass } from '../components/ui/formStyles';
import { useTableQuery } from '../hooks/useTableQuery';
import { formatDateTime } from '../lib/dates';
import { cn } from '../lib/cn';
import { endpoints, errorMessage, type AuditRow } from '../backend/connection';

const ENTITY_TYPES = [
  { value: '', label: 'Todas las entidades' },
  { value: 'semester', label: 'Semestre' },
  { value: 'semester_subject', label: 'Oferta' },
  { value: 'subject_group', label: 'Grupo' },
  { value: 'group_assignment', label: 'Asignación' },
  { value: 'subject', label: 'Asignatura' },
];

/** Acciones destructivas o irreversibles: se marcan para que salten a la vista. */
const LOUD = /force_closed|delete|override|allocation\.run/;

export function AuditPage() {
  const table = useTableQuery({ pageSize: 50 });
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState('');

  const { page, pageSize, search } = table;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await endpoints.auditLog({
        page,
        pageSize,
        search: search || undefined,
        entityType: entityType || undefined,
      });
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<AuditRow>[] = [
    {
      key: 'createdAt',
      header: 'Cuándo',
      width: '170px',
      render: (r) => <span className="tabular-nums whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: 'action',
      header: 'Acción',
      render: (r) =>
        LOUD.test(r.action) ? (
          <Badge tone="danger">{r.action}</Badge>
        ) : (
          <code className="text-xs">{r.action}</code>
        ),
    },
    {
      key: 'entity',
      header: 'Entidad',
      render: (r) => (
        <span className="text-(--color-ink-muted) text-xs">
          {r.entityType ? `${r.entityType} #${r.entityId ?? '—'}` : '—'}
        </span>
      ),
    },
    {
      key: 'payload',
      header: 'Detalle',
      render: (r) => (
        <code className="text-xs text-(--color-ink-muted) line-clamp-2 break-all">
          {r.payload ? JSON.stringify(r.payload) : '—'}
        </code>
      ),
    },
    {
      key: 'user',
      header: 'Quién',
      width: '180px',
      render: (r) => r.user?.fullName ?? <span className="text-(--color-ink-subtle)">sistema</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Bitácora"
        subtitle="Append-only: quién hizo qué y cuándo. No se edita ni se borra."
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={total}
        page={table.page}
        pageSize={table.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder="Buscar por acción o por quién…"
        isLoading={isLoading}
        emptyMessage="Sin entradas todavía."
        filters={
          <select
            aria-label="Entidad"
            className={cn(selectClass, 'w-auto min-h-10 text-sm')}
            value={entityType}
            onChange={(e) => {
              setEntityType(e.currentTarget.value);
              table.setPage(1);
            }}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        }
        mobileCard={(r) => (
          <div>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-medium">{r.action}</code>
              <span className="text-xs text-(--color-ink-muted) tabular-nums">
                {formatDateTime(r.createdAt)}
              </span>
            </div>
            <p className="text-xs text-(--color-ink-muted) mt-1">
              {r.entityType ? `${r.entityType} #${r.entityId ?? '—'}` : '—'} ·{' '}
              {r.user?.fullName ?? 'sistema'}
            </p>
          </div>
        )}
      />
    </>
  );
}
