import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
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
  portalShiftUrl,
  SHIFT_LABEL,
  SHIFTS,
  type Campus,
  type SemesterInput,
  type SemesterRow,
  type Shift,
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
        'Ningún semestre de este turno está activo. Los alumnos ven «el registro no está disponible». Activá uno para abrir.',
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
    does: 'Marca este semestre como el activo de su turno. Puede haber uno activo por turno (matutino y vespertino a la vez); el que estuviera activo en ese mismo turno se desactiva.',
    portal:
      'El link de ese turno (/matutino o /vespertino) pasa a apuntar a este semestre: sus estudiantes, su oferta y su ventana. El otro turno no se toca.',
    tone: 'success',
  },
  {
    icon: PowerOff,
    name: 'Cerrar turno',
    does: 'Quita el semestre activo de ese turno. El turno queda sin semestre activo.',
    portal:
      'El link de ese turno deja de aceptar alumnos y muestra «el registro no está disponible» hasta que actives otro. El otro turno y los envíos ya registrados no se tocan.',
    tone: 'danger',
  },
];

/** Copia el link de un turno al portapapeles. */
async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado.');
  } catch {
    toast.error('No se pudo copiar; selecciona el link a mano.');
  }
}

/**
 * Semestres del campus — cada uno es un evento de registro de UN turno, con su
 * propia ventana, padrón y oferta. Puede haber uno ACTIVO por turno: es al que
 * apunta el link de ese turno en el portal (`/matutino`, `/vespertino`), y la
 * base lo garantiza con un índice único parcial por (campus, turno).
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
  const [closing, setClosing] = useState<SemesterRow | null>(null);
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

  // Un activo por turno. Con superadmin global pueden venir varias escuelas:
  // los links son de la escuela del portal, así que se toma el primero.
  const activeByShift = useMemo(() => {
    const map = {} as Record<Shift, SemesterRow | undefined>;
    for (const shift of SHIFTS) map[shift] = semesters.find((s) => s.isCurrent && s.shift === shift);
    return map;
  }, [semesters]);

  // La lista de semestres es corta (un puñado por escuela) y llega entera:
  // acá sí se filtra y pagina en el cliente, a diferencia del padrón.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return semesters;
    return semesters.filter(
      (s) =>
        s.code.toLowerCase().includes(term) ||
        s.label.toLowerCase().includes(term) ||
        s.shift.includes(term) ||
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
        const { data } = await endpoints.semester_create({
          ...values,
          shifts: values.shifts ?? [...SHIFTS],
        });
        const turnos = data.map((d) => SHIFT_LABEL[d.shift].toLowerCase()).join(' y ');
        toast.success(`Semestre ${data[0]?.code} creado (turno ${turnos}).`);
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
      key: 'shift',
      header: 'Turno',
      width: '120px',
      render: (r) => <Badge tone="neutral">{SHIFT_LABEL[r.shift]}</Badge>,
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
                <Button size="sm" color="danger" variant="flat" onClick={() => setClosing(r)}>
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
        subtitle="Cada semestre es un evento de registro de un turno: su ventana, sus estudiantes y su oferta."
        actions={
          writable && (
            <Button onClick={() => setEditing(null)}>
              <CalendarPlus size={15} /> Nuevo semestre
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 mb-5">
        {/* Estado y link del portal de alumnos, uno por turno */}
        <div className="grid gap-3 lg:grid-cols-2">
          {SHIFTS.map((shift) => {
            const active = activeByShift[shift];
            const portal = portalState(active, now);
            const url = portalShiftUrl(shift);
            return (
              <Card key={shift} className="px-4 py-3 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold">Turno {SHIFT_LABEL[shift].toLowerCase()}</span>
                  <Badge tone={PORTAL_BADGE[portal.tone]}>{portal.label.toUpperCase()}</Badge>
                  {writable && active && (
                    <Button
                      size="sm"
                      color="danger"
                      variant="flat"
                      className="ml-auto"
                      disabled={isMutating}
                      onClick={() => setClosing(active)}
                    >
                      <PowerOff size={14} /> Cerrar turno
                    </Button>
                  )}
                </div>
                <p className="text-xs text-(--color-ink-muted) mt-1">{portal.detail}</p>
                <div className="flex items-center gap-1 mt-2 min-w-0">
                  <code className="min-w-0 flex-1 truncate rounded bg-(--color-surface-muted) px-2 py-1 text-xs">
                    {url}
                  </code>
                  <Button
                    size="sm"
                    color="neutral"
                    variant="flat"
                    aria-label={`Copiar link del turno ${shift}`}
                    onClick={() => void copyLink(url)}
                  >
                    <Copy size={14} />
                  </Button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir link del turno ${shift}`}
                    className="inline-flex items-center justify-center rounded-md p-2 text-(--color-ink-muted) hover:text-(--color-ink)"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </Card>
            );
          })}
        </div>

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
        searchPlaceholder="Buscar por código, etiqueta, turno o escuela…"
        emptyMessage="Todavía no hay semestres."
        mobileCard={(r) => (
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{r.code}</p>
              <Badge tone="neutral">{SHIFT_LABEL[r.shift]}</Badge>
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
                <Button size="sm" color="danger" variant="flat" onClick={() => setClosing(r)}>
                  Cerrar turno
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
          title={`Activar ${activating.code} · ${SHIFT_LABEL[activating.shift]}`}
          confirmLabel="Activar"
          tone="primary"
          isBusy={isMutating}
          onClose={() => setActivating(null)}
          onConfirm={async () => {
            await setCurrent(activating.id);
            setActivating(null);
          }}
        >
          El link del turno {activating.shift} (<code>{portalShiftUrl(activating.shift)}</code>) va a
          apuntar a este semestre, y el que estuviera activo en ese turno deja de estarlo. El otro
          turno no se toca.
        </ConfirmDialog>
      )}

      {closing && (
        <ConfirmDialog
          title={`Cerrar el turno ${SHIFT_LABEL[closing.shift].toLowerCase()}`}
          confirmLabel="Cerrar turno"
          tone="danger"
          isBusy={isMutating}
          onClose={() => setClosing(null)}
          onConfirm={async () => {
            await clearCurrent(closing.id);
            setClosing(null);
          }}
        >
          <strong>
            {closing.code} · {SHIFT_LABEL[closing.shift]}
          </strong>{' '}
          deja de ser el semestre activo de su turno. Ningún alumno del turno{' '}
          {closing.shift} va a poder entrar a <code>{portalShiftUrl(closing.shift)}</code> ni enviar
          su formulario hasta que actives un semestre de ese turno. El otro turno y los envíos ya
          registrados no se tocan.
        </ConfirmDialog>
      )}
    </>
  );
}
