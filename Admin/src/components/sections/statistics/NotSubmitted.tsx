import { useState } from 'react';
import { toast } from 'sonner';
import { CircleCheck, Download, TriangleAlert, Users } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/PageHeader';
import {
  endpoints,
  errorMessage,
  SHIFT_LABEL,
  type ShiftStatistics,
  type StudentRow,
} from '../../../backend/connection';
import { downloadCsv } from '../../../lib/csv';
import { formatNumber, NO_GROUP_LABEL, plural, schoolGroupName } from '../../../lib/statistics';
import { LegendItem } from './parts';

/** Tamaño máximo de página que acepta la API. */
const PAGE_SIZE = 200;

/** Todos los activos sin envío, página por página, con el listado de Estudiantes. */
async function fetchMissing(semesterId: number): Promise<StudentRow[]> {
  const all: StudentRow[] = [];
  for (let page = 1; ; page++) {
    const { data } = await endpoints.students_list(semesterId, {
      page,
      pageSize: PAGE_SIZE,
      isActive: true,
      hasSubmission: false,
      sort: 'code:asc',
    });
    all.push(...data.rows);
    if (data.rows.length === 0 || all.length >= data.total) return all;
  }
}

export function NotSubmitted({
  stats,
  cycle,
  onSeeMissing,
}: {
  stats: ShiftStatistics;
  cycle: string;
  onSeeMissing: () => void;
}) {
  const [isDownloading, setDownloading] = useState(false);
  const { roster, submitted, notSubmitted } = stats.students;
  const shiftName = SHIFT_LABEL[stats.shift].toLowerCase();

  const download = async () => {
    setDownloading(true);
    try {
      const rows = (await fetchMissing(stats.semester.id))
        .map((r) => [r.code, r.fullName ?? '', schoolGroupName(r)])
        .sort(
          (a, b) =>
            a[2].localeCompare(b[2], 'es-MX', { numeric: true }) ||
            a[1].localeCompare(b[1], 'es-MX'),
        );
      downloadCsv(`sin-envio_${cycle}_${stats.shift}.csv`, [
        ['CODIGO', 'NOMBRE', 'GRUPO'],
        ...rows,
      ]);
      toast.success(`Archivo listo: ${plural(rows.length, 'estudiante', 'estudiantes')}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  if (roster === 0) {
    return (
      <Card className="p-6 text-sm text-(--color-ink-muted)">
        Todavía no hay estudiantes cargados en el turno {shiftName}.
      </Card>
    );
  }

  /** Marcar grupos en cero sólo dice algo cuando el resto del turno ya envía. */
  const flagEmpty = submitted > 0;
  const emptyGroups = flagEmpty ? stats.schoolGroups.filter((g) => g.submitted === 0).length : 0;
  const max = Math.max(1, ...stats.schoolGroups.map((g) => g.roster));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 border-b border-(--color-border)">
        <div>
          <p className="flex items-center gap-2 text-2xl font-bold tabular-nums">
            {notSubmitted === 0 && (
              <CircleCheck size={22} className="text-(--color-success-ink)" aria-hidden="true" />
            )}
            {notSubmitted === 0
              ? 'Todos han enviado'
              : `${plural(notSubmitted, 'estudiante no ha', 'estudiantes no han')} enviado`}
          </p>
          <p className="text-sm text-(--color-ink-muted) mt-0.5">
            De {formatNumber(roster)} en la lista, {formatNumber(submitted)} ya enviaron.
          </p>
        </div>
        {notSubmitted > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onSeeMissing}
              title={`Abre «Estudiantes» del turno ${shiftName} con el filtro «Sin enviar»`}
            >
              <Users size={15} /> Ver quiénes faltan
            </Button>
            <Button
              color="neutral"
              variant="outlined"
              disabled={isDownloading}
              onClick={() => void download()}
            >
              <Download size={15} /> {isDownloading ? 'Preparando…' : 'Descargar CSV'}
            </Button>
          </div>
        )}
      </div>

      {!flagEmpty && (
        <p className="px-4 sm:px-5 py-2.5 text-sm bg-(--color-surface-muted) text-(--color-ink-muted)">
          Todavía no hay envíos en este turno.
        </p>
      )}
      {emptyGroups > 0 && (
        <p className="flex items-start gap-2 px-4 sm:px-5 py-2.5 text-sm bg-(--color-warning)/10 text-(--color-warning-ink)">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {emptyGroups === 1
              ? 'Hay 1 grupo donde nadie ha enviado.'
              : `Hay ${formatNumber(emptyGroups)} grupos donde nadie ha enviado.`}{' '}
            Revisa que su lista esté correcta y que hayan recibido el enlace.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 pt-3">
        <h4 className="text-sm font-semibold">Por grupo escolar</h4>
        <div className="flex gap-4 text-xs text-(--color-ink-muted)">
          <LegendItem swatch="bg-(--color-chart-demand)" label="Ya enviaron" />
          <LegendItem swatch="chart-hatch" label="Faltan" />
        </div>
      </div>

      <ul className="px-4 sm:px-5 pb-2 divide-y divide-(--color-border)">
        {stats.schoolGroups.map((g) => (
          <li
            key={g.name ?? ''}
            className="grid gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(10rem,18rem)_1fr_17rem] md:items-center"
          >
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium min-w-0 break-words">
              {g.name ?? NO_GROUP_LABEL}
              {flagEmpty && g.submitted === 0 && (
                <Badge tone="warning">
                  <TriangleAlert size={12} aria-hidden="true" /> Nadie ha enviado
                </Badge>
              )}
            </div>
            {/* El largo de la barra es el tamaño del grupo. */}
            <div className="flex h-3 gap-0.5" aria-hidden="true">
              {g.submitted > 0 && (
                <div
                  className="bg-(--color-chart-demand)"
                  style={{ width: `${(g.submitted / max) * 100}%` }}
                />
              )}
              {g.missing > 0 && (
                <div
                  className="chart-hatch rounded-r"
                  style={{ width: `${(g.missing / max) * 100}%` }}
                />
              )}
            </div>
            <p className="text-xs text-(--color-ink-muted) tabular-nums md:text-right">
              <strong className="text-sm text-(--color-ink)">
                {g.missing === 0
                  ? 'Completo'
                  : `${g.missing === 1 ? 'Falta' : 'Faltan'} ${formatNumber(g.missing)}`}
              </strong>{' '}
              · enviaron {formatNumber(g.submitted)} de {formatNumber(g.roster)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
