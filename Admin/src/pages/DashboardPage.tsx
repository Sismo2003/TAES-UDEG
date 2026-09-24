import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Lock, LockOpen, Play, RefreshCw } from 'lucide-react';
import { PageHeader, Card } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useSemesterStore } from '../stores/semesterStore';
import { canWrite, useAuthStore } from '../stores/authStore';
import { formatDateTime } from '../lib/dates';
import type { WindowMode, WindowReason } from '../backend/connection';

const WINDOW_LABEL: Record<WindowMode, string> = {
  scheduled: 'Programado (manda el reloj)',
  force_open: 'Abierto a la fuerza',
  force_closed: 'Cerrado (kill switch)',
};

const WINDOW_REASON_LABEL: Record<WindowReason, string> = {
  NO_ACTIVE_SEMESTER: 'Sin semestre activo',
  FORCED_CLOSED: 'Cerrado forzadamente',
  FORCED_OPEN: 'Abierto forzadamente',
  OPEN_SCHEDULED: 'Abierto por horario',
  NOT_YET_OPEN: 'Aún no abre',
  CLOSED_SCHEDULED: 'Cerrado por horario',
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-(--color-ink-muted)">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${tone ?? ''}`}>{value}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { overview, isLoading, isMutating } = useSemesterStore();
  const { loadSemesters, refreshOverview, setWindow, allocate } = useSemesterStore();
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user);

  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);

  if (!overview) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <p className="text-(--color-ink-muted)">
          {isLoading ? 'Cargando…' : 'Sin semestre seleccionado.'}
        </p>
      </>
    );
  }

  const { window: win, counts, offerings, semester } = overview;
  const totalCapacity = offerings.reduce((s, o) => s + o.capacity, 0);
  const totalAssigned = offerings.reduce((s, o) => s + o.assigned, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${semester.code} — ${semester.label} · ${semester.ranksRequired} preferencias por alumno`}
        actions={
          <Button color="neutral" variant="outlined" onClick={() => void refreshOverview()} disabled={isLoading}>
            <RefreshCw size={15} /> Actualizar
          </Button>
        }
      />

      <div className="flex flex-col gap-5">
        {/* Ventana / kill switch */}
        <Card className="p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Ventana de envío</span>
                {win.isOpen ? <Badge tone="success">ABIERTA</Badge> : <Badge tone="danger">CERRADA</Badge>}
              </div>
              <p className="text-xs text-(--color-ink-muted) mt-1.5">
                Modo: {WINDOW_LABEL[semester.windowMode]} · motivo {WINDOW_REASON_LABEL[win.reason]}
              </p>
              <p className="text-xs text-(--color-ink-muted) mt-0.5 tabular-nums">
                {formatDateTime(win.opensAt)} → {formatDateTime(win.closesAt)}
              </p>
            </div>

            {writable && (
              <div className="flex flex-wrap gap-2">
                <Button
                  color="neutral"
                  variant="outlined"
                  disabled={isMutating || semester.windowMode === 'scheduled'}
                  onClick={() => void setWindow('scheduled')}
                >
                  <CalendarClock size={15} /> Programado
                </Button>
                <Button
                  color="neutral"
                  variant="outlined"
                  disabled={isMutating || semester.windowMode === 'force_open'}
                  onClick={() => void setWindow('force_open')}
                >
                  <LockOpen size={15} /> Abrir
                </Button>
                <Button
                  color="danger"
                  disabled={isMutating || semester.windowMode === 'force_closed'}
                  onClick={() => void setWindow('force_closed')}
                >
                  <Lock size={15} /> Cerrar YA
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Contadores */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Estudiantes" value={counts.students} />
          <Stat label="Envíos" value={counts.submissions} />
          <Stat label="Sin asignar" value={counts.pending} />
          <Stat label="Asignados" value={counts.allocated} tone="text-(--color-success)" />
          <Stat
            label="Sin lugar"
            value={counts.unplaced}
            tone={counts.unplaced > 0 ? 'text-(--color-danger)' : undefined}
          />
        </div>

        {/* Oferta y cupos */}
        <Card>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-(--color-border)">
            <div>
              <h3 className="text-sm font-semibold">Oferta y cupos</h3>
              <p className="text-xs text-(--color-ink-muted) mt-0.5 tabular-nums">
                {totalAssigned} de {totalCapacity} lugares ocupados
              </p>
            </div>
            {writable && (
              <Button disabled={isMutating} onClick={() => void allocate()}>
                <Play size={15} /> Ejecutar asignación
              </Button>
            )}
          </div>

          {offerings.length === 0 ? (
            <p className="px-5 py-6 text-sm text-(--color-ink-muted)">
              Este semestre no oferta nada todavía.{' '}
              <Link className="text-(--color-primary) underline" to="/oferta">
                Armá la oferta
              </Link>
              .
            </p>
          ) : (
            <div className="scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-(--color-ink-muted) bg-(--color-surface-muted)/60">
                    <th className="px-5 py-2">Asignatura</th>
                    <th className="px-4 py-2 text-right">Grupos</th>
                    <th className="px-4 py-2 text-right">Cupo</th>
                    <th className="px-4 py-2 text-right">Ocupado</th>
                    <th className="px-4 py-2 text-right">Libre</th>
                  </tr>
                </thead>
                <tbody>
                  {offerings.map((o) => (
                    <tr key={o.semesterSubjectId} className="border-t border-(--color-border)">
                      <td className="px-5 py-2">
                        {o.name}{' '}
                        {!o.isActive && <Badge tone="danger">inactiva</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{o.groups.length}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{o.capacity}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{o.assigned}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{o.capacity - o.assigned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
