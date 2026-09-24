import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BookPlus, Pencil } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { selectClass } from '../components/ui/formStyles';
import { SubjectFormModal, type SubjectSubmit } from '../components/forms/SubjectFormModal';
import { useTableQuery } from '../hooks/useTableQuery';
import { canWrite, useAuthStore } from '../stores/authStore';
import { cn } from '../lib/cn';
import { endpoints, errorMessage, type SubjectRow } from '../backend/connection';

type ActiveFilter = 'all' | 'active' | 'inactive';

/**
 * Catálogo maestro de asignaturas — compartido por todas las escuelas de la
 * red. Qué ofrece cada semestre se decide en "Oferta y grupos"; acá sólo
 * existe el nombre canónico de cada materia.
 */
export function SubjectsPage() {
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user);

  const table = useTableQuery({ sort: { field: 'name', dir: 'asc' } });
  const [rows, setRows] = useState<SubjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');

  const [editing, setEditing] = useState<SubjectRow | null | undefined>(undefined);
  const [isSaving, setSaving] = useState(false);

  const { page, pageSize, search, sort } = table;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await endpoints.subjects_list({
        page,
        pageSize,
        search: search || undefined,
        sort: sort ? `${sort.field}:${sort.dir}` : undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
      });
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sort, activeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (values: SubjectSubmit) => {
    setSaving(true);
    try {
      if (editing) {
        await endpoints.subject_update(editing.id, {
          name: values.name,
          description: values.description,
        });
        toast.success('Asignatura actualizada.');
      } else {
        await endpoints.subject_create(values);
        toast.success('Asignatura creada en el catálogo.');
      }
      setEditing(undefined);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: SubjectRow) => {
    try {
      await endpoints.subject_update(row.id, { isActive: !row.isActive });
      toast.success(row.isActive ? 'Asignatura archivada.' : 'Asignatura reactivada.');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const columns: Column<SubjectRow>[] = [
    {
      key: 'code',
      header: 'Código',
      sortable: true,
      width: '140px',
      render: (r) => <code className="text-xs font-medium">{r.code}</code>,
    },
    { key: 'name', header: 'Nombre', sortable: true, render: (r) => r.name },
    {
      key: 'description',
      header: 'Descripción',
      render: (r) => (
        <span className="text-(--color-ink-muted) line-clamp-2">{r.description ?? '—'}</span>
      ),
    },
    {
      key: 'offerings',
      header: 'Semestres',
      align: 'right',
      width: '110px',
      render: (r) => <span className="tabular-nums">{r._count.offerings}</span>,
    },
    {
      key: 'isActive',
      header: 'Estado',
      width: '110px',
      render: (r) =>
        r.isActive ? <Badge tone="accent">activa</Badge> : <Badge tone="neutral">archivada</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '180px',
      render: (r) =>
        writable ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" color="neutral" variant="flat" onClick={() => setEditing(r)}>
              <Pencil size={14} /> Editar
            </Button>
            <Button size="sm" color="neutral" variant="flat" onClick={() => void toggleActive(r)}>
              {r.isActive ? 'Archivar' : 'Reactivar'}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Asignaturas"
        subtitle="Catálogo maestro. Lo que ofrece cada semestre se arma en Oferta y grupos."
        actions={
          writable && (
            <Button onClick={() => setEditing(null)}>
              <BookPlus size={15} /> Nueva asignatura
            </Button>
          )
        }
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
        searchPlaceholder="Buscar por código o nombre…"
        sort={table.sort}
        onSortChange={table.setSort}
        isLoading={isLoading}
        emptyMessage="No hay asignaturas que coincidan."
        filters={
          <select
            aria-label="Estado"
            className={cn(selectClass, 'w-auto min-h-10 text-sm')}
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.currentTarget.value as ActiveFilter);
              table.setPage(1);
            }}
          >
            <option value="all">Todas</option>
            <option value="active">Sólo activas</option>
            <option value="inactive">Sólo archivadas</option>
          </select>
        }
        mobileCard={(r) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{r.name}</p>
              <code className="text-xs text-(--color-ink-muted)">{r.code}</code>
              <p className="text-sm text-(--color-ink-muted) mt-1 line-clamp-2">
                {r.description ?? '—'}
              </p>
              <div className="mt-2">
                {r.isActive ? <Badge tone="accent">activa</Badge> : <Badge>archivada</Badge>}
              </div>
            </div>
            {writable && (
              <Button size="sm" color="neutral" variant="outlined" onClick={() => setEditing(r)}>
                <Pencil size={13} />
              </Button>
            )}
          </div>
        )}
      />

      {editing !== undefined && (
        <SubjectFormModal
          subject={editing}
          isSaving={isSaving}
          onClose={() => setEditing(undefined)}
          onSubmit={save}
        />
      )}
    </>
  );
}
