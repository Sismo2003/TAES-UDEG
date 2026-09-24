import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { parseCsv } from '../../lib/csv';
import { cn } from '../../lib/cn';
import type { StudentInput } from '../../backend/connection';

/**
 * Carga masiva de padrón desde el CSV que exporta Control Escolar.
 *
 * El backend (`students/bulk`) es todo-o-nada: si una fila trae un código
 * inválido o repetido, rechaza el lote entero. Por eso acá se valida antes y
 * no se deja enviar hasta que el archivo esté limpio.
 */

const CODE_RE = /^\d{9}$/;

// Límites de columna en la BD (schema.prisma → SemesterStudent).
const MAX = { fullName: 160, email: 160, career: 120, studentSemesterLabel: 32 } as const;

/** Columnas esperadas (se emparejan sin distinguir mayúsculas ni espacios). */
const COLUMNS = {
  code: 'CODIGO',
  fullName: 'NOMBRE',
  studentSemesterLabel: 'SEMESTRE',
  career: 'Programa',
} as const;

/** Una columna de la especificación de formato — se muestra como tabla. */
const SPEC: { name: string; rule: string; example: string }[] = [
  { name: 'CODIGO', rule: '9 dígitos · obligatorio', example: '226071836' },
  { name: 'NOMBRE', rule: 'nombre completo · opcional', example: 'ALCALA CASTRO VANESSA' },
  { name: 'SEMESTRE', rule: 'grupo y turno · opcional', example: '2o. "A" TURNO MATUTINO' },
  { name: 'Programa', rule: 'programa o plantel · opcional', example: 'ESC. PREPARATORIA No. 2' },
];

interface ParsedRow {
  line: number;
  student: StudentInput;
  truncated: boolean;
  error: string | null;
}

interface ParseResult {
  fileName: string;
  rows: ParsedRow[];
  headerError: string | null;
}

const norm = (s: string) => s.trim().toLowerCase();

function trimTo(value: string, max: number): { value: string | null; cut: boolean } {
  const v = value.trim();
  if (!v) return { value: null, cut: false };
  if (v.length <= max) return { value: v, cut: false };
  return { value: v.slice(0, max), cut: true };
}

function analyze(fileName: string, text: string): ParseResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { fileName, rows: [], headerError: 'El archivo está vacío.' };
  }

  const header = table[0].map(norm);
  const idx = {
    code: header.indexOf(norm(COLUMNS.code)),
    fullName: header.indexOf(norm(COLUMNS.fullName)),
    studentSemesterLabel: header.indexOf(norm(COLUMNS.studentSemesterLabel)),
    career: header.indexOf(norm(COLUMNS.career)),
  };

  if (idx.code === -1) {
    return {
      fileName,
      rows: [],
      headerError: `No se encontró la columna "${COLUMNS.code}" en la primera fila.`,
    };
  }

  const seen = new Map<string, number>();
  const rows: ParsedRow[] = [];

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const line = r + 1;
    const rawCode = (cells[idx.code] ?? '').trim();

    const cut: boolean[] = [];
    const pick = (col: number, max: number) => {
      if (col === -1) return null;
      const { value, cut: c } = trimTo(cells[col] ?? '', max);
      cut.push(c);
      return value;
    };

    const student: StudentInput = {
      code: rawCode,
      fullName: pick(idx.fullName, MAX.fullName),
      studentSemesterLabel: pick(idx.studentSemesterLabel, MAX.studentSemesterLabel),
      career: pick(idx.career, MAX.career),
    };

    let error: string | null = null;
    if (!rawCode) error = 'Sin código';
    else if (!CODE_RE.test(rawCode)) error = 'El código no es de 9 dígitos';
    else if (seen.has(rawCode)) error = `Código repetido (línea ${seen.get(rawCode)})`;

    if (!error && rawCode) seen.set(rawCode, line);

    rows.push({ line, student, truncated: cut.some(Boolean), error });
  }

  return { fileName, rows, headerError: null };
}

export function StudentImportModal({
  onClose,
  onImport,
  isSaving,
}: {
  onClose: () => void;
  onImport: (students: StudentInput[]) => Promise<void>;
  isSaving: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!result) return null;
    const invalid = result.rows.filter((r) => r.error).length;
    const truncated = result.rows.filter((r) => r.truncated).length;
    return { total: result.rows.length, valid: result.rows.length - invalid, invalid, truncated };
  }, [result]);

  const readFile = async (file: File) => {
    setReadError(null);
    setResult(null);
    try {
      const text = await file.text();
      setResult(analyze(file.name, text));
    } catch {
      setReadError('No se pudo leer el archivo.');
    }
  };

  const canImport =
    result != null &&
    !result.headerError &&
    stats != null &&
    stats.invalid === 0 &&
    stats.valid > 0 &&
    !isSaving;

  const submit = async () => {
    if (!canImport || !result) return;
    await onImport(result.rows.map((r) => r.student));
  };

  return (
    <Modal
      title="Importar padrón desde CSV"
      description="Carga masiva de alumnos a partir del archivo que exporta Control Escolar."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!canImport}>
            {isSaving
              ? 'Importando…'
              : stats
                ? `Importar ${stats.valid} alumno${stats.valid === 1 ? '' : 's'}`
                : 'Importar'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl border border-(--color-border) bg-(--color-surface-muted)/50 p-4">
          <h4 className="font-semibold text-sm text-(--color-ink) flex items-center gap-2">
            <FileSpreadsheet size={15} /> Formato requerido
          </h4>

          <div className="mt-3 overflow-x-auto rounded-lg border border-(--color-border)">
            <table className="w-full text-left text-xs">
              <thead className="bg-(--color-surface-muted) text-(--color-ink)">
                <tr>
                  {SPEC.map((col) => (
                    <th key={col.name} className="px-3 py-2 font-semibold whitespace-nowrap">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-(--color-ink-muted)">
                <tr className="border-t border-(--color-border)">
                  {SPEC.map((col) => (
                    <td key={col.name} className="px-3 py-2 align-top">
                      {col.rule}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-(--color-border) bg-(--color-surface)">
                  {SPEC.map((col) => (
                    <td key={col.name} className="px-3 py-2 align-top font-mono text-(--color-ink-subtle)">
                      {col.example}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-1 text-xs text-(--color-ink-muted) list-disc pl-4">
            <li>Primera fila = encabezados, en ese orden. Archivo .csv en UTF-8, separado por comas.</li>
            <li>Los valores con comas o comillas van entre comillas dobles.</li>
            <li>Código repetido en el archivo: se rechaza. Código que ya está en el padrón: se actualiza.</li>
          </ul>
        </section>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void readFile(file);
              e.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={isSaving}
            className={cn(
              'flex w-full flex-col items-center gap-2 rounded-xl border border-dashed',
              'border-(--color-border) bg-(--color-surface) px-4 py-6 text-sm transition',
              'hover:border-(--color-primary)/50 hover:bg-(--color-primary)/5',
              'disabled:opacity-45 disabled:cursor-not-allowed',
            )}
          >
            <UploadCloud size={22} className="text-(--color-ink-subtle)" />
            <span className="font-medium text-(--color-ink)">
              {result ? 'Elegir otro archivo' : 'Seleccionar archivo CSV'}
            </span>
            {result && (
              <span className="text-xs text-(--color-ink-muted)">{result.fileName}</span>
            )}
          </button>
        </div>

        {readError && (
          <p className="text-sm text-(--color-danger) flex items-center gap-1.5">
            <AlertTriangle size={14} /> {readError}
          </p>
        )}

        {result?.headerError && (
          <p className="text-sm text-(--color-danger) flex items-center gap-1.5">
            <AlertTriangle size={14} /> {result.headerError}
          </p>
        )}

        {result && !result.headerError && stats && (
          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{stats.total} filas</Badge>
              <Badge tone="success">{stats.valid} listas</Badge>
              {stats.invalid > 0 && <Badge tone="danger">{stats.invalid} con error</Badge>}
              {stats.truncated > 0 && (
                <Badge tone="warning">{stats.truncated} con texto recortado</Badge>
              )}
            </div>

            {stats.invalid > 0 && (
              <p className="text-xs text-(--color-danger)">
                Corregí las filas marcadas en el archivo y volvé a seleccionarlo. La importación no
                corre mientras haya errores.
              </p>
            )}

            <div className="max-h-64 overflow-auto rounded-xl border border-(--color-border)">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-(--color-surface-muted) text-(--color-ink-muted)">
                  <tr>
                    <th className="px-3 py-2 font-medium">Línea</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 100).map((r) => (
                    <tr key={r.line} className="border-t border-(--color-border)">
                      <td className="px-3 py-1.5 tabular-nums text-(--color-ink-subtle)">{r.line}</td>
                      <td className="px-3 py-1.5 tabular-nums font-medium">{r.student.code || '—'}</td>
                      <td className="px-3 py-1.5 text-(--color-ink-muted)">
                        {r.student.fullName ?? '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.error ? (
                          <span className="text-(--color-danger)">{r.error}</span>
                        ) : r.truncated ? (
                          <span className="text-(--color-ink-subtle)">texto recortado</span>
                        ) : (
                          <span className="text-(--color-ink-subtle)">ok</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 100 && (
                <p className="px-3 py-2 text-xs text-(--color-ink-subtle) border-t border-(--color-border)">
                  … y {result.rows.length - 100} filas más.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
