import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRightLeft, PlayCircle, UserPlus } from 'lucide-react';
import { PageHeader, Card } from '../components/ui/PageHeader';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PlaceAssignmentModal, type PlaceMode } from '../components/forms/PlaceAssignmentModal';
import { selectClass } from '../components/ui/formStyles';
import { useTableQuery } from '../hooks/useTableQuery';
import { useSemesterStore } from '../stores/semesterStore';
import { canWrite, useAuthStore } from '../stores/authStore';
import { cn } from '../lib/cn';
import {
  REASON_LABEL,
  REASON_TONE,
  buildOfferingIndex,
  reasonFor,
} from '../lib/assignmentReason';
import {
  endpoints,
  errorMessage,
  type SubmissionRow,
  type SubmissionStatus,
} from '../backend/connection';

type StatusFilter = SubmissionStatus | 'all';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'unplaced', label: 'Sin lugar' },
  { value: 'allocated', label: 'Colocados' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'all', label: 'Todos' },
];

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-(--color-ink-muted)">{label}</p>
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums mt-1',
          tone === 'danger' && value > 0 && 'text-(--color-danger)',
        )}
      >
        {value}
      </p>
    </Card>
  );
}

/**
 * Asignaciones — lo que se opera DESPUÉS de que cierra la ventana.
 *
 * El motor reparte por orden de llegada y siempre quedan algunos `unplaced`:
 * todas las asignaturas que pidieron estaban llenas. El sistema no les inventa
 * un grupo al azar (rompería el principio de preferencia), así que esta pantalla
 * es la herramienta del coordinador: ver quién quedó afuera y por qué, y
 * colocarlos uno por uno sin cambiar de vista.
 *
 * También sirve para el otro lado del trabajo: filtrar por grupo para ver
 * quiénes quedaron en Robótica A y mover a alguien de grupo.
 */
export function AssignmentsPage() {
  const semesterId = useSemesterStore((s) => s.selectedId);
  const semesters = useSemesterStore((s) => s.semesters);
  const overview = useSemesterStore((s) => s.overview);
  const loadSemesters = useSemesterStore((s) => s.loadSemesters);
  const refreshOverview = useSemesterStore((s) => s.refreshOverview);
  const allocate = useSemesterStore((s) => s.allocate);
  const isMutating = useSemesterStore((s) => s.isMutating);

  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user);

  const table = useTableQuery();
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setLoading] = useState(false);

  const [status, setStatus] = useState<StatusFilter>('unplaced');
  const [offeringFilter, setOfferingFilter] = useState<number | ''>('');
  const [groupFilter, setGroupFilter] = useState<number | ''>('');

  const [target, setTarget] = useState<{ mode: PlaceMode; row: SubmissionRow } | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [confirmAllocate, setConfirmAllocate] = useState(false);

  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);

  // F5 directo en /asignaciones: sin overview no hay cupos ni motivos.
  useEffect(() => {
    if (semesterId != null && overview == null) void refreshOverview();
  }, [semesterId, overview, refreshOverview]);

  const { page, pageSize, search } = table;
  const { setPage } = table;

  const load = useCallback(async () => {
    if (semesterId == null) return;
    setLoading(true);
    try {
      const { data } = await endpoints.submissions_list(semesterId, {
        page,
        pageSize,
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        semesterSubjectId: offeringFilter === '' ? undefined : offeringFilter,
        groupId: groupFilter === '' ? undefined : groupFilter,
      });
      setRows(data.rows);
      setTotal(data.total);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [semesterId, page, pageSize, search, status, offeringFilter, groupFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const offeringIndex = useMemo(() => buildOfferingIndex(overview), [overview]);
  const offerings = overview?.offerings ?? [];
  const groupsOfOffering = useMemo(
    () => offerings.find((o) => o.semesterSubjectId === offeringFilter)?.groups ?? [],
    [offerings, offeringFilter],
  );

  const runAllocation = async () => {
    setConfirmAllocate(false);
    await allocate(); // el store ya hace toast + refreshOverview
    await load();
  };

  const saveAssignment = async (groupId: number, notes: string) => {
    if (semesterId == null || !target) return;
    setSaving(true);
    try {
      if (target.mode === 'place') {
        await endpoints.assignment_place(semesterId, {
          submissionId: target.row.id,
          groupId,
          notes,
        });
        toast.success('Alumno colocado.');
      } else {
        await endpoints.assignment_move(target.row.assignment!.id, { groupId, notes });
        toast.success('Alumno movido de grupo.');
      }
      setTarget(null);
      await load();
      await refreshOverview(); // cupos en vivo + KPIs del dashboard
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<SubmissionRow>[] = [
    {
      key: 'code',
      header: 'Código',
      width: '120px',
      render: (r) => <span className="font-medium tabular-nums">{r.code}</span>,
    },
    {
      key: 'fullName',
      header: 'Alumno',
      render: (r) => r.fullName ?? <span className="text-(--color-ink-subtle)">—</span>,
    },
    {
      key: 'preferences',
      header: 'Lo que pidió',
      render: (r) => (
        <ul className="grid gap-1">
          {r.preferences.map((p) => {
            // El motivo sólo tiene sentido para quien no entró: para un alumno
            // ya colocado, "llena" sería ruido sobre una decisión ya tomada.
            const reason = r.status === 'unplaced' ? reasonFor(p.semesterSubjectId, offeringIndex) : null;
            return (
              <li key={p.rank} className="flex items-center gap-1.5 text-sm">
                <Badge tone="outline">{p.rank}ª</Badge>
                <span className="min-w-0 truncate">{p.name}</span>
                {reason && <Badge tone={REASON_TONE[reason]}>{REASON_LABEL[reason]}</Badge>}
              </li>
            );
          })}
        </ul>
      ),
    },
    {
      key: 'assignment',
      header: 'Quedó en',
      render: (r) =>
        r.assignment ? (
          <div className="grid gap-1">
            <span className="text-sm">
              {r.assignment.subjectName} · <strong>Grupo {r.assignment.groupLabel}</strong>
            </span>
            {r.assignment.assignedRank == null ? (
              <Badge tone="warning">fuera de preferencia</Badge>
            ) : (
              <Badge tone="outline">su {r.assignment.assignedRank}ª preferencia</Badge>
            )}
          </div>
        ) : r.status === 'unplaced' ? (
          <Badge tone="danger">sin lugar</Badge>
        ) : (
          <Badge tone="warning">sin asignar aún</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '130px',
      render: (r) =>
        writable ? (
          r.assignment ? (
            <Button
              size="sm"
              color="neutral"
              variant="outlined"
              onClick={() => setTarget({ mode: 'move', row: r })}
            >
              <ArrowRightLeft size={14} /> Mover
            </Button>
          ) : (
            <Button size="sm" onClick={() => setTarget({ mode: 'place', row: r })}>
              <UserPlus size={14} /> Colocar
            </Button>
          )
        ) : null,
    },
  ];

  if (semesters.length === 0) {
    return (
      <>
        <PageHeader title="Asignaciones" />
        <p className="text-(--color-ink-muted)">
          Todavía no hay semestres. Creá uno en <strong>Semestres</strong> para poder asignar.
        </p>
      </>
    );
  }

  const counts = overview?.counts;

  return (
    <>
      <PageHeader
        title="Asignaciones"
        subtitle="Quién quedó sin lugar, por qué, y dónde acomodarlo."
        actions={
          writable && (
            <Button onClick={() => setConfirmAllocate(true)} disabled={isMutating}>
              <PlayCircle size={15} /> Ejecutar asignación
            </Button>
          )
        }
      />

      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="Sin lugar" value={counts.unplaced} tone="danger" />
          <Stat label="Colocados" value={counts.allocated} />
          <Stat label="Sin asignar aún" value={counts.pending} />
          <Stat label="Envíos" value={counts.submissions} />
        </div>
      )}

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
        isLoading={isLoading}
        emptyMessage={
          status === 'unplaced'
            ? 'Nadie quedó sin lugar.'
            : 'Ningún alumno coincide con el filtro.'
        }
        filters={
          <>
            <div className="flex gap-1">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  size="sm"
                  color={status === tab.value ? 'primary' : 'neutral'}
                  variant={status === tab.value ? 'soft' : 'outlined'}
                  onClick={() => {
                    setStatus(tab.value);
                    setPage(1);
                  }}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <select
              aria-label="Asignatura"
              className={cn(selectClass, 'w-auto min-h-10 text-sm')}
              value={offeringFilter}
              onChange={(e) => {
                const value = e.currentTarget.value ? Number(e.currentTarget.value) : '';
                setOfferingFilter(value);
                setGroupFilter(''); // el grupo elegido ya no pertenece a esta oferta
                setPage(1);
              }}
            >
              <option value="">Toda la oferta</option>
              {offerings.map((o) => (
                <option key={o.semesterSubjectId} value={o.semesterSubjectId}>
                  {o.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Grupo"
              className={cn(selectClass, 'w-auto min-h-10 text-sm')}
              value={groupFilter}
              disabled={offeringFilter === ''}
              onChange={(e) => {
                setGroupFilter(e.currentTarget.value ? Number(e.currentTarget.value) : '');
                setPage(1);
              }}
            >
              <option value="">Todos los grupos</option>
              {groupsOfOffering.map((g) => (
                <option key={g.id} value={g.id}>
                  Grupo {g.label} ({g.assignedCount}/{g.capacity})
                </option>
              ))}
            </select>
          </>
        }
        mobileCard={(r) => (
          <div className="grid gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium tabular-nums">{r.code}</p>
                <p className="text-sm text-(--color-ink-muted) truncate">{r.fullName ?? '—'}</p>
              </div>
              {writable &&
                (r.assignment ? (
                  <Button
                    size="sm"
                    color="neutral"
                    variant="outlined"
                    onClick={() => setTarget({ mode: 'move', row: r })}
                  >
                    Mover
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setTarget({ mode: 'place', row: r })}>
                    Colocar
                  </Button>
                ))}
            </div>

            {r.assignment ? (
              <p className="text-sm">
                {r.assignment.subjectName} · <strong>Grupo {r.assignment.groupLabel}</strong>
              </p>
            ) : (
              <div className="grid gap-1">
                {r.preferences.map((p) => {
                  const reason =
                    r.status === 'unplaced' ? reasonFor(p.semesterSubjectId, offeringIndex) : null;
                  return (
                    <div key={p.rank} className="flex items-center gap-1.5 text-sm">
                      <Badge tone="outline">{p.rank}ª</Badge>
                      <span className="min-w-0 truncate">{p.name}</span>
                      {reason && <Badge tone={REASON_TONE[reason]}>{REASON_LABEL[reason]}</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      />

      {target && (
        <PlaceAssignmentModal
          mode={target.mode}
          row={target.row}
          overview={overview}
          isSaving={isSaving}
          onClose={() => setTarget(null)}
          onSubmit={saveAssignment}
        />
      )}

      {confirmAllocate && (
        <ConfirmDialog
          title="Ejecutar la asignación"
          confirmLabel="Ejecutar"
          tone="primary"
          isBusy={isMutating}
          onClose={() => setConfirmAllocate(false)}
          onConfirm={() => void runAllocation()}
        >
          Reparte a los alumnos <strong>pendientes y sin lugar</strong> en orden de llegada.
          A los que ya tienen grupo <strong>no los toca</strong>, así que se puede volver a correr
          después de abrir un grupo o subir un cupo.
        </ConfirmDialog>
      )}
    </>
  );
}
