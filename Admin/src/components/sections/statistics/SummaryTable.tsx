import type { ReactNode } from 'react';
import { Card } from '../../ui/PageHeader';
import { SHIFT_LABEL, type ShiftStatistics, type Statistics } from '../../../backend/connection';
import { formatNumber, plural } from '../../../lib/statistics';
import { BalanceChip } from './parts';

interface Row {
  label: string;
  hint?: string;
  shift: (s: ShiftStatistics) => ReactNode;
  total: ReactNode;
}

/** Total de un balance: faltantes y sobrantes juntos, sin restarlos. */
function Split({ missing, surplus }: { missing: number; surplus: number }) {
  if (missing === 0 && surplus === 0) return <BalanceChip value={0} />;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {missing > 0 && <BalanceChip value={-missing} />}
      {surplus > 0 && <BalanceChip value={surplus} />}
    </span>
  );
}

/** Sin nadie en la lista no hay balance que calcular. */
const hasDemand = (s: ShiftStatistics) =>
  s.students.roster + s.students.inactiveWithSubmission > 0;

const NoRoster = () => <span className="text-xs text-(--color-ink-muted)">falta la lista</span>;

/** Aclaraciones que sólo aparecen cuando una cifra puede verse "rara". */
function notesFor(s: ShiftStatistics): string[] {
  const turno = SHIFT_LABEL[s.shift];
  const notes: string[] = [];
  if (!hasDemand(s)) {
    notes.push(
      `${turno}: todavía no tiene lista de estudiantes, así que no entra en el balance del total.`,
    );
  }
  if (s.seats.excluded > 0) {
    notes.push(
      `${turno}: el Dashboard muestra ${formatNumber(s.seats.total + s.seats.excluded)} lugares porque suma ${plural(s.seats.excluded, 'lugar', 'lugares')} de grupos o materias inactivos. Aquí no cuentan porque la asignación no los usa.`,
    );
  }
  if (s.students.inactiveWithSubmission > 0) {
    notes.push(
      `${turno}: hay ${plural(s.students.inactiveWithSubmission, 'estudiante dado de baja que ya había enviado', 'estudiantes dados de baja que ya habían enviado')}. No cuentan en la lista, pero la asignación sí les da lugar, así que se restan en el balance y en los lugares libres (el Dashboard los incluye en «Envíos»).`,
    );
  }
  if (s.seats.assignedInInactive > 0) {
    notes.push(
      `${turno}: ${plural(s.seats.assignedInInactive, 'estudiante está asignado', 'estudiantes están asignados')} a un grupo inactivo. Revísalo en «Asignaciones»; ese grupo no se cuenta en los lugares.`,
    );
  }
  return notes;
}

export function SummaryTable({ data }: { data: Statistics }) {
  const { shifts, totals } = data;
  const showTotal = shifts.length > 1;
  const resolved = shifts.some((s) => s.phase !== 'before');
  const partial = shifts.some((s) => s.phase === 'partial');

  /** Cifras que no existen mientras un turno no se haya asignado. */
  const afterOnly = (s: ShiftStatistics, value: number) =>
    s.phase === 'before' ? (
      <span className="text-(--color-ink-muted) text-xs">sin asignar</span>
    ) : (
      formatNumber(value)
    );

  const rows: Row[] = [
    {
      label: 'Estudiantes en la lista',
      shift: (s) => formatNumber(s.students.roster),
      total: formatNumber(totals.students.roster),
    },
    {
      label: 'Ya enviaron',
      shift: (s) => formatNumber(s.students.submitted),
      total: formatNumber(totals.students.submitted),
    },
    {
      label: 'No han enviado',
      shift: (s) => formatNumber(s.students.notSubmitted),
      total: formatNumber(totals.students.notSubmitted),
    },
    {
      label: 'Lugares abiertos',
      hint: 'Cupo de los grupos activos',
      shift: (s) => formatNumber(s.seats.total),
      total: formatNumber(totals.seats.total),
    },
    {
      label: 'Lugares libres tras colocar a quienes enviaron',
      hint: resolved
        ? 'Lugares menos asignados (y menos envíos aún sin asignar)'
        : 'Lugares menos envíos recibidos',
      shift: (s) =>
        s.seats.freeAfterPlacing < 0 ? (
          <BalanceChip value={s.seats.freeAfterPlacing} />
        ) : (
          formatNumber(s.seats.freeAfterPlacing)
        ),
      total:
        totals.seats.freeAfterPlacing.missing > 0 ? (
          <Split {...totals.seats.freeAfterPlacing} />
        ) : (
          formatNumber(totals.seats.freeAfterPlacing.surplus)
        ),
    },
    {
      label: 'Si todos toman materia',
      hint: 'Lugares menos todos los que necesitan uno',
      shift: (s) => (hasDemand(s) ? <BalanceChip value={s.seats.balance} /> : <NoRoster />),
      total: shifts.some(hasDemand) ? <Split {...totals.seats.balance} /> : <NoRoster />,
    },
    ...(resolved
      ? [
          {
            label: 'Asignados',
            shift: (s: ShiftStatistics) => afterOnly(s, s.submissions.allocated),
            total: formatNumber(totals.submissions.allocated),
          },
          {
            label: 'Sin lugar',
            hint: 'Enviaron, pero no se les pudo asignar',
            shift: (s: ShiftStatistics) => afterOnly(s, s.submissions.unplaced),
            total: formatNumber(totals.submissions.unplaced),
          },
        ]
      : []),
    ...(partial
      ? [
          {
            label: 'Envíos sin asignar todavía',
            shift: (s: ShiftStatistics) => formatNumber(s.submissions.pending),
            total: formatNumber(totals.submissions.pending),
          },
        ]
      : []),
  ];

  const notes = shifts.flatMap(notesFor);
  const cell = 'px-4 py-2.5 text-right tabular-nums align-middle';

  return (
    <Card className="overflow-hidden">
      {/* Móvil: cada dato con sus turnos debajo, sin scroll de lado */}
      <ul className="sm:hidden divide-y divide-(--color-border)">
        {rows.map((row) => (
          <li key={row.label} className="px-4 py-3">
            <p className="text-sm font-medium">{row.label}</p>
            {row.hint && <p className="text-xs text-(--color-ink-muted)">{row.hint}</p>}
            <dl className="mt-2 grid auto-cols-fr grid-flow-col gap-2">
              {shifts.map((s) => (
                <div key={s.shift}>
                  <dt className="text-xs text-(--color-ink-muted)">{SHIFT_LABEL[s.shift]}</dt>
                  <dd className="mt-0.5 text-sm tabular-nums">{row.shift(s)}</dd>
                </div>
              ))}
              {showTotal && (
                <div className="rounded-lg bg-(--color-surface-muted) px-2 -my-1 py-1">
                  <dt className="text-xs font-semibold">Total</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums [&>span]:items-start">
                    {row.total}
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block scroll-x">
        <table className="w-full text-sm">
          <caption className="sr-only">Resumen de estudiantes y lugares por turno</caption>
          <thead>
            <tr className="bg-(--color-surface-muted) text-xs font-semibold text-(--color-ink-muted)">
              <th scope="col" className="px-5 py-2.5 text-left">
                Dato
              </th>
              {shifts.map((s) => (
                <th key={s.shift} scope="col" className="px-4 py-2.5 text-right">
                  {SHIFT_LABEL[s.shift]}
                </th>
              ))}
              {showTotal && (
                <th
                  scope="col"
                  className="px-4 py-2.5 text-right bg-(--color-surface-sunken) text-(--color-ink)"
                >
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-(--color-border)">
                <th scope="row" className="px-5 py-2.5 text-left font-medium">
                  {row.label}
                  {row.hint && (
                    <span className="block text-xs font-normal text-(--color-ink-muted)">
                      {row.hint}
                    </span>
                  )}
                </th>
                {shifts.map((s) => (
                  <td key={s.shift} className={cell}>
                    {row.shift(s)}
                  </td>
                ))}
                {showTotal && (
                  <td className={`${cell} bg-(--color-surface-muted) font-semibold`}>
                    {row.total}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <ul className="border-t border-(--color-border) px-5 py-3 text-xs text-(--color-ink-muted) flex flex-col gap-1.5">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
