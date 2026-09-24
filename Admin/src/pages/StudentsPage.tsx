import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2, Upload, UserPlus } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StudentFormModal } from '../components/forms/StudentFormModal';
import { StudentImportModal } from '../components/forms/StudentImportModal';
import { selectClass } from '../components/ui/formStyles';
import { useTableQuery } from '../hooks/useTableQuery';
import { useSemesterStore } from '../stores/semesterStore';
import { canWrite, useAuthStore } from '../stores/authStore';
import { cn } from '../lib/cn';
import { endpoints, errorMessage, type StudentInput, type StudentRow } from '../backend/connection';

type ActiveFilter = 'all' | 'active' | 'inactive';
type SubmissionFilter = 'all' | 'yes' | 'no';

const STATUS_TONE = {
  pending: 'warning',
  allocated: 'success',
  unplaced: 'danger',
} as const;

const STATUS_LABEL = {
  pending: 'enviado',
  allocated: 'asignado',
  unplaced: 'sin lugar',
} as const;

/**
 * Padrón del semestre — el registro de códigos.
 *
 * Es la pantalla que decide quién puede entrar al portal: un código que no
 * está acá no existe para el sistema. Por eso el alta manual, la búsqueda y
 * los filtros por estado son lo esencial; la carga masiva por CSV usa el
 * archivo que exporta Control Escolar y va contra `students/bulk`.
 */
export function StudentsPage() {
  const semesterId = useSemesterStore((s) => s.selectedId);
  const semesters = useSemesterStore((s) => s.semesters);
  const loadSemesters = useSemesterStore((s) => s.loadSemesters);
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user);

  const table = useTableQuery({ sort: { field: 'code', dir: 'asc' } });
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setLoading] = useState(false);

  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>('all');

  const [editing, setEditing] = useState<StudentRow | null | undefined>(undefined);
  const [removing, setRemoving] = useState<StudentRow | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isImporting, setImporting] = useState(false);

  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);

  const { page, pageSize, search, sort } = table;

  const load = useCallback(async () => {
    if (semesterId == null) return;
    setLoading(true);
    try {
      const { data } = await endpoints.students_list(semesterId, {
        page,
        pageSize,
        search: search || undefined,
        sort: sort ? `${sort.field}:${sort.dir}` : undefined,
        isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
        hasSubmission: submissionFilter === 'all' ? undefined : submissionFilter === 'yes',
      });
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [semesterId, page, pageSize, search, sort, activeFilter, submissionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveStudent = async (values: StudentInput) => {
    if (semesterId == null) return;
    setSaving(true);
    try {
      if (editing) {
        await endpoints.student_update(semesterId, editing.id, values);
        toast.success('Alumno actualizado.');
      } else {
        await endpoints.student_create(semesterId, values);
        toast.success('Estudiante agregado.');
      }
      setEditing(undefined);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const runImport = async (students: StudentInput[]) => {
    if (semesterId == null) return;
    setImporting(true);
    try {
      const { data } = await endpoints.students_bulk(semesterId, students);
      toast.success(
        `Padrón actualizado: ${data.created} alta${data.created === 1 ? '' : 's'}, ` +
          `${data.updated} actualizado${data.updated === 1 ? '' : 's'} (${data.total} en el archivo).`,
      );
      setImportOpen(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const toggleActive = async (row: StudentRow) => {
    if (semesterId == null) return;
    try {
      await endpoints.student_update(semesterId, row.id, { isActive: !row.isActive });
      toast.success(row.isActive ? 'Alumno desactivado.' : 'Alumno reactivado.');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const confirmRemove = async () => {
    if (semesterId == null || !removing) return;
    setSaving(true);
    try {
      const { data } = await endpoints.student_delete(semesterId, removing.id);
      toast.success(
        data.softDelete
          ? 'El alumno ya había enviado: se desactivó en vez de borrarse.'
          : 'Estudiante eliminado.',
      );
      setRemoving(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<StudentRow>[] = [
    {
      key: 'code',
      header: 'Código',
      sortable: true,
      width: '120px',
      render: (r) => <span className="font-medium tabular-nums">{r.code}</span>,
    },
    {
      key: 'fullName',
      header: 'Nombre',
      sortable: true,
      render: (r) => r.fullName ?? <span className="text-(--color-ink-subtle)">—</span>,
    },
    {
      key: 'career',
      header: 'Programa',
      render: (r) => (
        <span className="text-(--color-ink-muted)">
          {r.career ?? '—'}
          {r.studentSemesterLabel ? ` · ${r.studentSemesterLabel}` : ''}
        </span>
      ),
    },
    {
      key: 'submission',
      header: 'Envío',
      render: (r) =>
        r.submission ? (
          <Badge tone={STATUS_TONE[r.submission.status]}>{STATUS_LABEL[r.submission.status]}</Badge>
        ) : (
          <span className="text-(--color-ink-subtle) text-xs">sin enviar</span>
        ),
    },
    {
      key: 'isActive',
      header: 'Estado',
      render: (r) =>
        r.isActive ? <Badge tone="accent">activo</Badge> : <Badge tone="neutral">inactivo</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '150px',
      render: (r) =>
        writable ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" color="neutral" variant="flat" onClick={() => setEditing(r)}>
              <Pencil size={14} /> Editar
            </Button>
            <Button size="sm" color="danger" variant="flat" onClick={() => setRemoving(r)}>
              <Trash2 size={14} />
            </Button>
          </div>
        ) : null,
    },
  ];

  if (semesters.length === 0) {
    return (
      <>
        <PageHeader title="Estudiantes" />
        <p className="text-(--color-ink-muted)">
          Todavía no hay semestres. Creá uno en <strong>Semestres</strong> para cargar sus estudiantes.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Estudiantes"
        subtitle="Los códigos habilitados para entrar al portal en este semestre."
        actions={
          writable && (
            <>
              <Button
                color="neutral"
                variant="outlined"
                onClick={() => setImportOpen(true)}
                title="Carga masiva de alumnos desde un archivo CSV"
              >
                <Upload size={15} /> Importar CSV
              </Button>
              <Button onClick={() => setEditing(null)}>
                <UserPlus size={15} /> Agregar alumno
              </Button>
            </>
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
        searchPlaceholder="Buscar por código, nombre, correo o programa…"
        sort={table.sort}
        onSortChange={table.setSort}
        isLoading={isLoading}
        emptyMessage="Ningún alumno coincide con el filtro."
        filters={
          <>
            <select
              aria-label="Estado"
              className={cn(selectClass, 'w-auto min-h-10 text-sm')}
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.currentTarget.value as ActiveFilter);
                table.setPage(1);
              }}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Sólo activos</option>
              <option value="inactive">Sólo inactivos</option>
            </select>
            <select
              aria-label="Envío"
              className={cn(selectClass, 'w-auto min-h-10 text-sm')}
              value={submissionFilter}
              onChange={(e) => {
                setSubmissionFilter(e.currentTarget.value as SubmissionFilter);
                table.setPage(1);
              }}
            >
              <option value="all">Enviaron o no</option>
              <option value="yes">Ya enviaron</option>
              <option value="no">Sin enviar</option>
            </select>
          </>
        }
        mobileCard={(r) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium tabular-nums">{r.code}</p>
              <p className="text-sm text-(--color-ink-muted) truncate">{r.fullName ?? '—'}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {r.isActive ? <Badge tone="accent">activo</Badge> : <Badge>inactivo</Badge>}
                {r.submission && (
                  <Badge tone={STATUS_TONE[r.submission.status]}>
                    {STATUS_LABEL[r.submission.status]}
                  </Badge>
                )}
              </div>
            </div>
            {writable && (
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" color="neutral" variant="outlined" onClick={() => setEditing(r)}>
                  <Pencil size={13} /> Editar
                </Button>
                <Button size="sm" color="neutral" variant="flat" onClick={() => void toggleActive(r)}>
                  {r.isActive ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            )}
          </div>
        )}
      />

      {importOpen && (
        <StudentImportModal
          isSaving={isImporting}
          onClose={() => setImportOpen(false)}
          onImport={runImport}
        />
      )}

      {editing !== undefined && (
        <StudentFormModal
          student={editing}
          isSaving={isSaving}
          onClose={() => setEditing(undefined)}
          onSubmit={saveStudent}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Quitar ${removing.code} de la lista de estudiantes`}
          confirmLabel="Quitar"
          isBusy={isSaving}
          onClose={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
        >
          {removing.submission ? (
            <>
              Este alumno <strong>ya envió su formulario</strong>. No se borra: queda desactivado
              para conservar su envío y el orden de llegada de los demás.
            </>
          ) : (
            <>
              Se elimina el código <strong>{removing.code}</strong> de la lista de estudiantes de este semestre.
              Podés volver a agregarlo después.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
