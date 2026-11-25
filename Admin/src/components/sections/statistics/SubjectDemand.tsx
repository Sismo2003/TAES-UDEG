import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/PageHeader';
import type { ShiftStatistics, SubjectStatistics } from '../../../backend/connection';
import { formatNumber } from '../../../lib/statistics';
import { cn } from '../../../lib/cn';
import { BalanceChip, LegendItem } from './parts';

/** Barra horizontal con su valor en la punta. El ancho nunca tapa el número. */
function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label}: ${formatNumber(value)}`}>
      <span className="w-14 shrink-0 text-xs text-(--color-ink-muted)">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div
          aria-hidden="true"
          className={cn('h-3 rounded-r', color)}
          style={{ width: `calc((100% - 3rem) * ${value / max})` }}
        />
        <span className="text-xs font-semibold tabular-nums">{formatNumber(value)}</span>
      </div>
    </div>
  );
}

function SubjectName({ subject }: { subject: SubjectStatistics }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-medium">{subject.name}</span>
      {!subject.isActive && <Badge tone="warning">materia inactiva</Badge>}
    </span>
  );
}

/** "A: 30 · B: 25", con los grupos que no cuentan tachados y rotulados. */
function Groups({ subject }: { subject: SubjectStatistics }) {
  if (subject.groups.length === 0) {
    return <span className="text-(--color-ink-muted)">Sin grupos</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {subject.groups.map((g) => (
        <span
          key={g.id}
          className={cn(
            'rounded-md border border-(--color-border) px-1.5 py-0.5 text-xs tabular-nums whitespace-nowrap',
            !g.counts && 'border-dashed text-(--color-ink-muted)',
          )}
        >
          {g.label}: <strong className={cn(!g.counts && 'line-through')}>{g.capacity}</strong>
          {!g.counts && ' (inactivo)'}
        </span>
      ))}
    </span>
  );
}

export function SubjectDemand({ stats }: { stats: ShiftStatistics }) {
  const { subjects, seats } = stats;
  const resolved = stats.phase !== 'before';
  const max = Math.max(1, ...subjects.flatMap((s) => [s.seats, s.firstChoice]));
  const firstTotal = subjects.reduce((acc, s) => acc + s.firstChoice, 0);
  const noSubmissions = stats.submissions.total === 0;

  if (subjects.length === 0) {
    return (
      <Card className="p-6 text-sm text-(--color-ink-muted)">
        Este turno todavía no tiene materias en su oferta. Agrégalas en «Oferta y grupos».
      </Card>
    );
  }

  const th = 'px-3 py-2.5 text-right align-bottom';
  const td = 'px-3 py-2.5 text-right tabular-nums';

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-(--color-primary)/25 bg-(--color-primary)/5 px-4 py-3 text-sm">
        <p>
          <strong>La 1ª opción es la señal principal de demanda:</strong> cuántos quieren esa materia
          antes que cualquier otra. «Diferencia» son los lugares de la materia menos esas 1ª
          opciones.
        </p>
        <p className="mt-1 text-(--color-ink-muted)">
          Si a una materia le faltan lugares, esos estudiantes no quedan fuera de inmediato: la
          asignación sigue con su 2ª opción, luego la 3ª y así hasta la {stats.semester.ranksRequired}
          ª.
        </p>
        {noSubmissions && (
          <p className="mt-1 font-medium">
            Todavía no hay envíos en este turno, así que no hay demanda que comparar.
          </p>
        )}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Lugares contra 1ª opción</h4>
          <div className="flex gap-4 text-xs text-(--color-ink-muted)">
            <LegendItem swatch="bg-(--color-chart-seats)" label="Lugares" />
            <LegendItem swatch="bg-(--color-chart-demand)" label="1ª opción" />
          </div>
        </div>
        <ul className="mt-3 divide-y divide-(--color-border)">
          {subjects.map((s) => (
            <li
              key={s.semesterSubjectId}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(9rem,14rem)_1fr_8rem]"
            >
              <div className="text-sm min-w-0">
                <SubjectName subject={s} />
              </div>
              <div className="justify-self-end md:order-3">
                <BalanceChip value={s.difference} />
              </div>
              <div className="col-span-2 flex flex-col gap-0.5 md:order-2 md:col-span-1">
                <Bar value={s.seats} max={max} color="bg-(--color-chart-seats)" label="Lugares" />
                <Bar
                  value={s.firstChoice}
                  max={max}
                  color="bg-(--color-chart-demand)"
                  label="1ª opción"
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <h4 className="px-4 sm:px-5 py-3 text-sm font-semibold border-b border-(--color-border)">
          Detalle por materia
        </h4>

        {/* Escritorio: tabla */}
        <div className="hidden md:block scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-(--color-surface-muted) text-xs font-semibold text-(--color-ink-muted)">
                <th className="px-5 py-2.5 text-left align-bottom">Materia</th>
                <th className="px-3 py-2.5 text-left align-bottom">Grupos y su cupo</th>
                <th className={th}>Lugares</th>
                <th className={th}>1ª opción</th>
                <th className={th}>Diferencia</th>
                <th className={th} title="En cualquiera de sus opciones">
                  La incluyen
                  <span className="block font-normal">(cualquier opción)</span>
                </th>
                {resolved && (
                  <>
                    <th className={th}>Asignados</th>
                    <th className={th}>Libres</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.semesterSubjectId} className="border-t border-(--color-border)">
                  <td className="px-5 py-2.5">
                    <SubjectName subject={s} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Groups subject={s} />
                  </td>
                  <td className={td}>{formatNumber(s.seats)}</td>
                  <td className={cn(td, 'font-semibold')}>{formatNumber(s.firstChoice)}</td>
                  <td className={td}>
                    <BalanceChip value={s.difference} />
                  </td>
                  <td className={td}>{formatNumber(s.anyChoice)}</td>
                  {resolved && (
                    <>
                      <td className={td}>{formatNumber(s.assigned)}</td>
                      <td className={td}>{formatNumber(s.free)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-(--color-border-strong) bg-(--color-surface-muted) font-semibold">
                <td className="px-5 py-2.5" colSpan={2}>
                  Total del turno
                </td>
                <td className={td}>{formatNumber(seats.total)}</td>
                <td className={td}>{formatNumber(firstTotal)}</td>
                <td />
                <td />
                {resolved && (
                  <>
                    <td className={td}>{formatNumber(seats.assigned)}</td>
                    <td className={td}>{formatNumber(seats.total - seats.assigned)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Móvil: una tarjeta por materia */}
        <ul className="md:hidden divide-y divide-(--color-border)">
          {subjects.map((s) => (
            <li key={s.semesterSubjectId} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <SubjectName subject={s} />
                <BalanceChip value={s.difference} />
              </div>
              <div className="mt-1.5">
                <Groups subject={s} />
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {[
                  ['Lugares', s.seats],
                  ['1ª opción', s.firstChoice],
                  ['La incluyen', s.anyChoice],
                  ...(resolved
                    ? [
                        ['Asignados', s.assigned],
                        ['Libres', s.free],
                      ]
                    : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-(--color-ink-muted)">{label}</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {formatNumber(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
