import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/PageHeader';
import { SHIFT_LABEL, type ShiftStatistics } from '../../../backend/connection';
import {
  balanceKind,
  balanceText,
  formatNumber,
  PHASE_LABEL,
  plural,
} from '../../../lib/statistics';
import { cn } from '../../../lib/cn';
import { BALANCE_STYLE, LegendItem } from './parts';

/** Estudiantes (enviaron + faltan) contra lugares, en la misma escala. */
function CompareBars({ stats }: { stats: ShiftStatistics }) {
  const { roster, submitted, notSubmitted, inactiveWithSubmission } = stats.students;
  const need = roster + inactiveWithSubmission;
  const max = Math.max(need, stats.seats.total, 1);
  const width = (n: number) => `${(n / max) * 100}%`;
  const sent = submitted + inactiveWithSubmission;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex justify-between gap-3 text-sm">
          <span>Estudiantes que necesitan lugar</span>
          <strong className="tabular-nums">{formatNumber(need)}</strong>
        </div>
        <div className="mt-1 flex h-4 gap-0.5" aria-hidden="true">
          {sent > 0 && (
            <div
              className={cn('bg-(--color-chart-demand)', notSubmitted === 0 && 'rounded-r')}
              style={{ width: width(sent) }}
            />
          )}
          {notSubmitted > 0 && (
            <div className="chart-hatch rounded-r" style={{ width: width(notSubmitted) }} />
          )}
        </div>
      </div>
      <div>
        <div className="flex justify-between gap-3 text-sm">
          <span>Lugares abiertos</span>
          <strong className="tabular-nums">{formatNumber(stats.seats.total)}</strong>
        </div>
        <div className="mt-1 h-4" aria-hidden="true">
          <div
            className="h-full rounded-r bg-(--color-chart-seats)"
            style={{ width: width(stats.seats.total) }}
          />
        </div>
      </div>
      {inactiveWithSubmission > 0 && (
        <p className="text-xs text-(--color-ink-muted)">
          Incluye {plural(inactiveWithSubmission, 'estudiante dado', 'estudiantes dados')} de baja
          que ya había{inactiveWithSubmission === 1 ? '' : 'n'} enviado: también ocupa
          {inactiveWithSubmission === 1 ? '' : 'n'} lugar.
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-ink-muted)">
        <LegendItem
          swatch="bg-(--color-chart-demand)"
          label={`Ya enviaron: ${formatNumber(sent)}`}
        />
        <LegendItem swatch="chart-hatch" label={`No han enviado: ${formatNumber(notSubmitted)}`} />
        <LegendItem
          swatch="bg-(--color-chart-seats)"
          label={`Lugares en ${plural(stats.seats.groups, 'grupo', 'grupos')}`}
        />
      </div>
    </div>
  );
}

function explanation(stats: ShiftStatistics): string {
  const { balance, total } = stats.seats;
  if (total === 0) {
    return 'Todavía no hay grupos activos en este turno. Abre grupos en «Oferta y grupos».';
  }
  if (balance < 0) {
    return `Para que todos puedan tener grupo, abre al menos ${plural(-balance, 'lugar', 'lugares')} más.`;
  }
  if (balance > 0) {
    return `En total hay lugar para todos los estudiantes de la lista y ${balance === 1 ? 'sobra 1' : `sobran ${formatNumber(balance)}`}.`;
  }
  return 'Hay exactamente un lugar para cada estudiante de la lista.';
}

/** Respuesta principal de un turno: ¿alcanzan los lugares? */
export function ShiftHeadline({
  stats,
  onLoadRoster,
}: {
  stats: ShiftStatistics;
  onLoadRoster: () => void;
}) {
  const noRoster = stats.students.roster + stats.students.inactiveWithSubmission === 0;
  const { balance, freeAfterPlacing } = stats.seats;
  const kind = balanceKind(balance);
  const style = BALANCE_STYLE[noRoster ? 'exact' : kind];
  const Icon = style.icon;
  const { unplaced, pending } = stats.submissions;

  return (
    <Card className={cn('p-5 flex flex-col gap-4 border-2', style.surface)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Turno {SHIFT_LABEL[stats.shift].toLowerCase()}</h4>
        <Badge tone={stats.phase === 'before' ? 'outline' : 'accent'}>
          {PHASE_LABEL[stats.phase]}
        </Badge>
      </div>

      {noRoster ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-2xl font-bold">Falta cargar la lista de estudiantes</p>
          <p className="text-sm text-(--color-ink-muted)">
            Sin la lista no se puede saber si alcanzan los lugares. Hoy hay{' '}
            {plural(stats.seats.total, 'lugar abierto', 'lugares abiertos')}.
          </p>
          <Button color="neutral" variant="outlined" onClick={onLoadRoster}>
            Ir a Estudiantes
          </Button>
        </div>
      ) : (
        <>
          <div>
            <p
              className={cn(
                'flex items-center gap-2.5 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums',
                style.text,
              )}
            >
              <Icon size={30} className="shrink-0" aria-hidden="true" />
              {kind === 'exact' ? 'Lugares exactos' : balanceText(balance)}
            </p>
            <p className="text-sm text-(--color-ink-muted) mt-1.5">{explanation(stats)}</p>
          </div>

          {unplaced > 0 && (
            <p className="rounded-lg bg-(--color-danger)/10 px-3 py-2 text-sm font-medium text-(--color-danger-ink)">
              {plural(unplaced, 'estudiante quedó', 'estudiantes quedaron')} sin lugar en la
              asignación: no se encontró cupo en ninguna de sus opciones.
            </p>
          )}
          {stats.phase === 'before' && freeAfterPlacing < 0 && (
            <p className="rounded-lg bg-(--color-danger)/10 px-3 py-2 text-sm font-medium text-(--color-danger-ink)">
              Los lugares no alcanzan ni para quienes ya enviaron:{' '}
              {balanceText(freeAfterPlacing).toLowerCase()}.
            </p>
          )}
          {stats.phase === 'partial' && (
            <p className="rounded-lg bg-(--color-warning)/15 px-3 py-2 text-sm text-(--color-warning-ink)">
              Hay {plural(pending, 'envío', 'envíos')} sin asignar todavía.
            </p>
          )}

          <CompareBars stats={stats} />
        </>
      )}
    </Card>
  );
}
