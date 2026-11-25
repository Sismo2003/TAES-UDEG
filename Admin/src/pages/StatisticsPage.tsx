import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { NotSubmitted } from '../components/sections/statistics/NotSubmitted';
import { ShiftHeadline } from '../components/sections/statistics/ShiftHeadline';
import { SubjectDemand } from '../components/sections/statistics/SubjectDemand';
import { SummaryTable } from '../components/sections/statistics/SummaryTable';
import { BalanceChip, SectionHeading } from '../components/sections/statistics/parts';
import { useSemesterStore } from '../stores/semesterStore';
import { useStatisticsStore } from '../stores/statisticsStore';
import { useAppHeaderHeight } from '../hooks/useAppHeaderHeight';
import { SHIFT_LABEL, type Shift, type Statistics } from '../backend/connection';
import { formatNumber, plural } from '../lib/statistics';
import { formatDateTime } from '../lib/dates';
import { cn } from '../lib/cn';

function Skeleton() {
  return (
    <div role="status" aria-label="Cargando estadísticas" className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-(--color-surface-sunken)" />
        <div className="h-64 animate-pulse rounded-2xl bg-(--color-surface-sunken)" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-(--color-surface-sunken)" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** Los dos turnos juntos, sin restar el sobrante de uno al faltante del otro. */
function CombinedStrip({ data }: { data: Statistics }) {
  if (data.shifts.length < 2) return null;
  const { students, seats } = data.totals;
  const withRoster = data.shifts.filter(
    (s) => s.students.roster + s.students.inactiveWithSubmission > 0,
  );
  const withoutRoster = data.shifts.filter((s) => !withRoster.includes(s));

  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-2">
      <p className="text-sm">
        <strong>Los dos turnos juntos:</strong>{' '}
        {plural(students.roster, 'estudiante', 'estudiantes')} en la lista y{' '}
        {plural(seats.total, 'lugar abierto', 'lugares abiertos')}.
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {withRoster.map((s) => (
          <li key={s.shift} className="flex items-center gap-1.5">
            {SHIFT_LABEL[s.shift]}: <BalanceChip value={s.seats.balance} unit />
          </li>
        ))}
        {withoutRoster.map((s) => (
          <li key={s.shift} className="text-(--color-ink-muted)">
            {SHIFT_LABEL[s.shift]}: falta cargar la lista
          </li>
        ))}
      </ul>
      {seats.balance.missing > 0 && (
        <p className="text-sm">
          En total hay que abrir al menos{' '}
          <strong className="tabular-nums">
            {formatNumber(seats.balance.missing)}{' '}
            {seats.balance.missing === 1 ? 'lugar' : 'lugares'}
          </strong>
          .
        </p>
      )}
      <p className="text-xs text-(--color-ink-muted)">
        Los lugares de un turno no sirven para el otro: lo que sobra en uno no cubre lo que falta en
        el otro.
      </p>
    </Card>
  );
}

/**
 * Estadísticas — para decidir qué grupos abrir en cada turno antes de asignar.
 * Se lee de arriba abajo: respuesta, resumen, materias y quiénes faltan.
 */
export function StatisticsPage() {
  const semesterId = useSemesterStore((s) => s.selectedId);
  const semesters = useSemesterStore((s) => s.semesters);
  const isLoadingSemesters = useSemesterStore((s) => s.isLoading);
  const loadSemesters = useSemesterStore((s) => s.loadSemesters);
  const select = useSemesterStore((s) => s.select);
  const { data, isLoading, errorMessage, fetch } = useStatisticsStore();
  const navigate = useNavigate();
  const headerHeight = useAppHeaderHeight();

  const selected = semesters.find((s) => s.id === semesterId);
  const ready = selected != null;

  const [pickedShift, setPickedShift] = useState<Shift | null>(null);

  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);

  useEffect(() => {
    // El detalle sigue al turno elegido en el selector de arriba.
    setPickedShift(null);
    if (ready && semesterId != null) void fetch(semesterId);
  }, [ready, semesterId, fetch]);

  const refresh = () => {
    if (semesterId != null) void fetch(semesterId);
  };

  /** Cambia el semestre del panel (si hace falta) y abre otra pantalla. */
  const openIn = (targetId: number, path: string) => {
    if (targetId !== semesterId) void select(targetId);
    navigate(path);
  };

  if (!ready) {
    return (
      <>
        <PageHeader title="Estadísticas" />
        {isLoadingSemesters ? (
          <Skeleton />
        ) : (
          <Card className="p-6 flex flex-col items-start gap-3 text-sm">
            <p className="text-(--color-ink-muted)">
              No hay ningún semestre que mostrar. Crea uno en{' '}
              <Link className="text-(--color-primary) underline" to="/semestres">
                Semestres
              </Link>
              .
            </p>
            <Button color="neutral" variant="outlined" onClick={() => void loadSemesters(true)}>
              <RefreshCw size={15} /> Volver a intentar
            </Button>
          </Card>
        )}
      </>
    );
  }

  const detail =
    data?.shifts.find((s) => s.shift === pickedShift) ??
    data?.shifts.find((s) => s.shift === selected.shift) ??
    data?.shifts[0];

  return (
    <>
      <PageHeader
        title="Estadísticas"
        subtitle={
          data
            ? `Ciclo ${data.code} · ${data.campus.name} · actualizado ${formatDateTime(data.generatedAt)}`
            : `Ciclo ${selected.code}`
        }
        actions={
          <Button color="neutral" variant="outlined" onClick={refresh} disabled={isLoading}>
            <RefreshCw size={15} className={cn(isLoading && 'animate-spin')} /> Actualizar
          </Button>
        }
      />

      {errorMessage && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-(--color-danger)/40 bg-(--color-danger)/5 p-4 text-sm"
        >
          <TriangleAlert size={18} className="text-(--color-danger-ink)" aria-hidden="true" />
          <p className="flex-1 min-w-48">
            <strong>No se pudieron {data ? 'actualizar' : 'cargar'} las estadísticas.</strong>{' '}
            {errorMessage}
            {data && ' Los números que ves son de la última consulta.'}
          </p>
          <Button color="neutral" variant="outlined" onClick={refresh} disabled={isLoading}>
            Volver a intentar
          </Button>
        </div>
      )}

      {!data ? (
        errorMessage ? null : <Skeleton />
      ) : (
        <div className="flex flex-col gap-10 max-w-6xl">
          <section className="flex flex-col gap-4">
            <SectionHeading step={1} title="¿Alcanzan los lugares?">
              Cada turno por separado, si todos los estudiantes de la lista toman una materia.
            </SectionHeading>
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              {data.shifts.map((s) => (
                <ShiftHeadline
                  key={s.shift}
                  stats={s}
                  onLoadRoster={() => openIn(s.semester.id, '/padron')}
                />
              ))}
              {data.missingShifts.map((shift) => (
                <Card key={shift} className="p-5 text-sm text-(--color-ink-muted) border-dashed">
                  <p className="font-semibold text-(--color-ink)">
                    Turno {SHIFT_LABEL[shift].toLowerCase()}
                  </p>
                  <p className="mt-1">
                    No hay un semestre {data.code} para este turno. Si lo necesitas, créalo en{' '}
                    <Link className="text-(--color-primary) underline" to="/semestres">
                      Semestres
                    </Link>
                    .
                  </p>
                </Card>
              ))}
            </div>
            <CombinedStrip data={data} />
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading step={2} title="Resumen">
              Estudiantes y lugares, turno por turno.
            </SectionHeading>
            <SummaryTable data={data} />
          </section>

          {detail && (
            <div className="flex flex-col gap-8">
              {data.shifts.length > 1 && (
                // Queda fijo bajo la barra superior: siempre se sabe qué turno se ve.
                <div
                  style={{ top: headerHeight - 1 }}
                  className="sticky z-20 -mx-4 sm:mx-0 flex flex-wrap items-center gap-3 border-y sm:border sm:rounded-xl border-(--color-border) bg-(--color-surface) shadow-sm px-4 py-2.5">
                  <span className="text-sm font-semibold" id="detail-shift-label">
                    Detalle del turno:
                  </span>
                  <div
                    role="group"
                    aria-labelledby="detail-shift-label"
                    className="inline-flex rounded-lg bg-(--color-surface-sunken) p-1"
                  >
                    {data.shifts.map((s) => (
                      <button
                        key={s.shift}
                        type="button"
                        aria-pressed={s.shift === detail.shift}
                        onClick={() => setPickedShift(s.shift)}
                        className={cn(
                          'min-h-8 rounded-md px-3 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)/40',
                          s.shift === detail.shift
                            ? 'bg-(--color-primary) text-white'
                            : 'text-(--color-ink-muted) hover:text-(--color-ink)',
                        )}
                      >
                        {SHIFT_LABEL[s.shift]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <section className="flex flex-col gap-4">
                <SectionHeading
                  step={3}
                  title={`Lugares contra demanda por materia · ${SHIFT_LABEL[detail.shift]}`}
                >
                  Ordenadas de la más pedida en 1ª opción a la menos pedida.
                </SectionHeading>
                <SubjectDemand stats={detail} />
              </section>

              <section className="flex flex-col gap-4">
                <SectionHeading
                  step={4}
                  title={`Quiénes no han enviado · ${SHIFT_LABEL[detail.shift]}`}
                >
                  Primero los grupos donde nadie ha enviado y después los que más faltan.
                </SectionHeading>
                <NotSubmitted
                  key={detail.semester.id}
                  stats={detail}
                  cycle={data.code}
                  onSeeMissing={() => openIn(detail.semester.id, '/padron?estado=activos&envio=no')}
                />
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}
