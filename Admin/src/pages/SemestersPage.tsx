import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  MousePointerClick,
  Pencil,
  PowerOff,
} from 'lucide-react';
import { PageHeader, Card } from '../components/ui/PageHeader';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SemesterFormModal } from '../components/forms/SemesterFormModal';
import { useSemesterStore } from '../stores/semesterStore';
import { canWrite, useAuthStore } from '../stores/authStore';
import { formatDateTime, minutesBetween } from '../lib/dates';
import {
  endpoints,
  errorMessage,
  type Campus,
  type SemesterInput,
  type SemesterRow,
  type WindowMode,
} from '../backend/connection';

const WINDOW_BADGE: Record<WindowMode, { tone: 'neutral' | 'success' | 'danger'; label: string }> = {
  scheduled: { tone: 'neutral', label: 'programado' },
  force_open: { tone: 'success', label: 'abierto a la fuerza' },
  force_closed: { tone: 'danger', label: 'cerrado (kill switch)' },
};

type PortalTone = 'success' | 'danger' | 'warning' | 'neutral';

/**
 * Estado del portal público de alumnos, calculado con el reloj del navegador.
 * Refleja la MISMA precedencia que `resolveSemesterWindow` del backend
 * (force_closed → force_open → horario). El Dashboard muestra el estado
 * autoritativo con la hora del servidor; acá es una guía rápida.
 */
function portalState(
  active: SemesterRow | undefined,
  now: Date,
): { open: boolean; tone: PortalTone; label: string; detail: string } {
  if (!active) {
    return {
      open: false,
      tone: 'danger',
      label: 'Cerrado',
      detail:
        'Ningún semestre está activo. Los alumnos ven «el registro no está disponible». Activá un semestre para abrir.',
    };
  }

  const opens = new Date(active.opensAt).getTime();
  const closes = new Date(active.closesAt).getTime();
  const t = now.getTime();
  const tag = `${active.code} — ${active.label}`;

  if (active.windowMode === 'force_closed') {
    return {
      open: false,
      tone: 'danger',
      label: 'Cerrado (kill switch)',
      detail: `${tag} está activo pero cerrado a la fuerza desde el Dashboard. El horario programado se ignora.`,
    };
  }
  if (active.windowMode === 'force_open') {
    return {
      open: true,
      tone: 'success',
      label: 'Abierto (a la fuerza)',
      detail: `${tag} está abierto a la fuerza desde el Dashboard, sin importar el horario.`,
    };
  }
  if (t < opens) {
    return {
      open: false,
      tone: 'warning',
      label: 'Aún no abre',
      detail: `${tag} está programado. El formulario abre el ${formatDateTime(active.opensAt)}.`,
    };
  }
  if (t >= closes) {
    return {
      open: false,
      tone: 'danger',
      label: 'Ya cerró',
      detail: `La ventana programada de ${tag} terminó el ${formatDateTime(active.closesAt)}.`,
    };
  }
  return {
    open: true,
    tone: 'success',
    label: 'Abierto',
    detail: `${tag} está dentro de su ventana programada. Cierra el ${formatDateTime(active.closesAt)}.`,
  };
}

const PORTAL_BADGE: Record<PortalTone, 'success' | 'danger' | 'warning' | 'neutral'> = {
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  neutral: 'neutral',
};

const ACTIONS: {
  icon: typeof Pencil;
  name: string;
  does: string;
  portal: string;
  tone: PortalTone;
}[] = [
  {
    icon: MousePointerClick,
    name: 'Seleccionar semestre',
    does: 'Elige sobre qué semestre trabajás en el resto del panel: Estudiantes, Oferta y Asignación operan sobre el semestre seleccionado.',
    portal: 'No afecta al portal de alumnos. Es sólo tu vista del panel.',
    tone: 'neutral',
  },
  {
    icon: Pencil,
    name: 'Editar',
    does: 'Cambia la etiqueta, la fecha y hora de apertura, la duración de la ventana y cuántas preferencias ordena el alumno.',
    portal:
      'Si es el semestre activo, cambia a qué hora abre el formulario y cuántas opciones se le piden al alumno.',
    tone: 'warning',
  },
  {
    icon: CheckCircle2,
    name: 'Activar',
    does: 'Marca este semestre como el activo del campus. Sólo puede haber uno a la vez; el que estuviera activo se desactiva.',
    portal:
      'El portal pasa a apuntar a este semestre: sus estudiantes, su oferta y su ventana. Es lo que hace que el registro exista para los alumnos.',
    tone: 'success',
  },
  {
    icon: PowerOff,
    name: 'Cerrar plataforma',
    does: 'Quita el semestre activo. El campus queda sin ningún semestre activo.',
    portal:
      'El portal deja de aceptar alumnos y muestra «el registro no está disponible» hasta que actives un semestre. Los envíos ya registrados no se tocan.',
    tone: 'danger',
  },
];

/**
 * Semestres del campus — cada uno es un evento de registro con su propia
 * ventana, padrón y oferta. Exactamente uno puede ser el ACTIVO: es al que
 * apunta el portal público, y la base lo garantiza con un índice único parcial.
 */
export function SemestersPage() {
  const { semesters, selectedId, isMutating } = useSemesterStore();
  const { loadSemesters, select, setCurrent, clearCurrent } = useSemesterStore();
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user);
  const needsCampus = user?.role === 'superadmin' && user.campusId === null;

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [editing, setEditing] = useState<SemesterRow | null | undefined>(undefined);
  const [activating, setActivating] = useState<SemesterRow | null>(null);
  const [closingPlatform, setClosingPlatform] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void loadSemesters();
    endpoints
      .campuses_list()
      .then((res) => setCampuses(res.data))
      .catch((err) => toast.error(errorMessage(err)));
  }, [loadSemesters]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const activeSemester = useMemo(() => semesters.find((s) => s.isCurrent), [semesters]);
  const portal = portalState(activeSemester, now);

  // La lista de semestres es corta (un puñado por escuela) y llega entera:
  // acá sí se filtra y pagina en el cliente, a diferencia del padrón.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return semesters;
    return semesters.filter(
      (s) =>
        s.code.toLowerCase().includes(term) ||
        s.label.toLowerCase().includes(term) ||
        s.campus?.name.toLowerCase().includes(term),
    );
  }, [semesters, search]);

  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const save = async (values: SemesterInput) => {
    setSaving(true);
    try {
      if (editing) {
        await endpoints.semester_update(editing.id, {
          label: values.label,
          opensAt: values.opensAt,
          durationMinutes: values.durationMinutes,
          ranksRequired: values.ranksRequired,
          notes: values.notes,
        });
        toast.success('Semestre actualizado.');
      } else {
        const { data } = await endpoints.semester_create(values);
        toast.success(`Semestre ${data.code} creado.`);
      }
      setEditing(undefined);
      await loadSemesters(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<SemesterRow>[] = [
    {
      key: 'code',
      header: 'Código',
      width: '150px',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{r.code}</span>
          {r.isCurrent && <Badge tone="success">activo</Badge>}
        </div>
      ),
    },
    {
      key: 'label',
      header: 'Etiqueta',
      render: (r) => (
        <div>
          <p>{r.label}</p>
          {r.campus && <p className="text-xs text-(--color-ink-muted)">{r.campus.name}</p>}
        </div>
      ),
    },
    {
      key: 'window',
      header: 'Horario de la ventana',
      render: (r) => (
        <div className="text-xs text-(--color-ink-muted) space-y-0.5">
          <p className="tabular-nums">
            <span className="text-(--color-ink-subtle)">Abre </span>
            {formatDateTime(r.opensAt)}
          </p>
          <p className="tabular-nums">
            <span className="text-(--color-ink-subtle)">Cierra </span>
            {formatDateTime(r.closesAt)}
          </p>
          <p className="text-(--color-ink-subtle)">{minutesBetween(r.opensAt, r.closesAt)} min</p>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Modo',
      render: (r) => (
        <Badge tone={WINDOW_BADGE[r.windowMode].tone}>{WINDOW_BADGE[r.windowMode].label}</Badge>
      ),
    },
    {
      key: 'ranks',
      header: 'Preferencias',
      align: 'right',
      width: '120px',
      render: (r) => <span className="tabular-nums">{r.ranksRequired}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '260px',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            color={selectedId === r.id ? 'primary' : 'neutral'}
            variant={selectedId === r.id ? 'soft' : 'flat'}
            onClick={() => void select(r.id)}
          >
            {selectedId === r.id ? 'Seleccionado' : 'Seleccionar'}
          </Button>
          {writable && (
            <>
              <Button size="sm" color="neutral" variant="flat" onClick={() => setEditing(r)}>
                <Pencil size={14} />
              </Button>
              {r.isCurrent ? (
                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  onClick={() => setClosingPlatform(true)}
                >
                  <PowerOff size={14} /> Cerrar
                </Button>
              ) : (
                <Button size="sm" color="neutral" variant="flat" onClick={() => setActivating(r)}>
                  <CheckCircle2 size={14} /> Activar
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Semestres"
        subtitle="Cada semestre es un evento de registro: su ventana, sus estudiantes y su oferta."
        actions={
          writable && (
            <>
              {activeSemester && (
                <Button
                  color="danger"
                  variant="outlined"
                  disabled={isMutating}
                  onClick={() => setClosingPlatform(true)}
                >
                  <PowerOff size={15} /> Cerrar plataforma
                </Button>
              )}
              <Button onClick={() => setEditing(null)}>
                <CalendarPlus size={15} /> Nuevo semestre
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-col gap-3 mb-5">
        {/* Estado del portal de alumnos ahora mismo */}
        <Card className="px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">Portal de alumnos</span>
            <Badge tone={PORTAL_BADGE[portal.tone]}>{portal.label.toUpperCase()}</Badge>
            <span className="text-(--color-ink-muted)">{portal.detail}</span>
          </div>
        </Card>

        {/* Qué hace cada acción y cómo llega al alumno — plegado por defecto */}
        <Card className="px-4 py-2.5">
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold list-none">
              <ChevronRight
                size={15}
                className="transition-transform group-open:rotate-90 text-(--color-ink-muted)"
              />
              Qué hace cada acción y cómo afecta al portal
            </summary>
            <ul className="mt-2 divide-y divide-(--color-border) border-t border-(--color-border)">
              {ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.name} className="flex gap-2.5 py-2 text-xs">
                    <Icon size={14} className="mt-0.5 shrink-0 text-(--color-ink-muted)" />
                    <p className="text-(--color-ink-muted)">
                      <span className="font-semibold text-(--color-ink)">{a.name}.</span> {a.does}{' '}
                      <span
                        className={
                          a.tone === 'danger'
                            ? 'text-(--color-danger)'
                            : a.tone === 'success'
                              ? 'text-(--color-success)'
                              : a.tone === 'warning'
                                ? 'text-(--color-warning-ink)'
                                : 'text-(--color-ink-muted)'
                        }
                      >
                        {a.portal}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-(--color-ink-subtle) mt-2">
              Abrir o cerrar la ventana en vivo sin cambiar de semestre es el kill switch del
              Dashboard (<strong>Abrir</strong> / <strong>Cerrar YA</strong>), que manda sobre el
              horario programado.
            </p>
          </details>
        </Card>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        total={filtered.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Buscar por código, etiqueta o escuela…"
        emptyMessage="Todavía no hay semestres."
        mobileCard={(r) => (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{r.code}</p>
              {r.isCurrent && <Badge tone="success">activo</Badge>}
            </div>
            <p className="text-sm text-(--color-ink-muted)">{r.label}</p>
            <p className="text-xs text-(--color-ink-muted) mt-1 tabular-nums">
              Abre {formatDateTime(r.opensAt)}
            </p>
            <p className="text-xs text-(--color-ink-muted) tabular-nums">
              Cierra {formatDateTime(r.closesAt)} · {minutesBetween(r.opensAt, r.closesAt)} min
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" color="neutral" variant="outlined" onClick={() => void select(r.id)}>
                {selectedId === r.id ? 'Seleccionado' : 'Seleccionar'}
              </Button>
              {writable && (
                <Button size="sm" color="neutral" variant="flat" onClick={() => setEditing(r)}>
                  Editar
                </Button>
              )}
              {writable && r.isCurrent && (
                <Button
                  size="sm"
                  color="danger"
                  variant="flat"
                  onClick={() => setClosingPlatform(true)}
                >
                  Cerrar plataforma
                </Button>
              )}
              {writable && !r.isCurrent && (
                <Button size="sm" color="neutral" variant="flat" onClick={() => setActivating(r)}>
                  Activar
                </Button>
              )}
            </div>
          </div>
        )}
      />

      {editing !== undefined && (
        <SemesterFormModal
          semester={editing}
          campuses={campuses}
          needsCampus={needsCampus}
          isSaving={isSaving}
          onClose={() => setEditing(undefined)}
          onSubmit={save}
        />
      )}

      {activating && (
        <ConfirmDialog
          title={`Activar ${activating.code}`}
          confirmLabel="Activar"
          tone="primary"
          isBusy={isMutating}
          onClose={() => setActivating(null)}
          onConfirm={async () => {
            await setCurrent(activating.id);
            setActivating(null);
          }}
        >
          El portal público de la escuela va a apuntar a este semestre, y el que estuviera activo
          deja de estarlo. Sólo puede haber uno por escuela.
        </ConfirmDialog>
      )}

      {closingPlatform && (
        <ConfirmDialog
          title="Cerrar la plataforma de alumnos"
          confirmLabel="Cerrar plataforma"
          tone="danger"
          isBusy={isMutating}
          onClose={() => setClosingPlatform(false)}
          onConfirm={async () => {
            if (activeSemester) await clearCurrent(activeSemester.id);
            setClosingPlatform(false);
          }}
        >
          {activeSemester ? (
            <>
              <strong>{activeSemester.code}</strong> deja de ser el semestre activo. El campus queda
              sin ningún semestre activo: ningún alumno va a poder entrar al portal ni enviar su
              formulario hasta que actives un semestre de nuevo. Los envíos ya registrados no se
              tocan.
            </>
          ) : (
            'No hay ningún semestre activo.'
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
