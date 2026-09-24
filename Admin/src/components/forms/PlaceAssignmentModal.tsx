import { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { inputClass, labelClass, selectClass } from '../ui/formStyles';
import { cn } from '../../lib/cn';
import {
  REASON_LABEL,
  REASON_TONE,
  buildOfferingIndex,
  reasonFor,
} from '../../lib/assignmentReason';
import type { Overview, SubmissionRow } from '../../backend/connection';

export type PlaceMode = 'place' | 'move';

interface GroupOption {
  groupId: number;
  subjectName: string;
  groupLabel: string;
  free: number;
  /** Rank si el grupo es de una asignatura que el alumno pidió; `null` si no. */
  prefRank: number | null;
}

/**
 * Colocar a un alumno sin lugar, o mover a uno ya asignado.
 *
 * Dos reglas de diseño que vienen del dominio, no del gusto:
 *
 *  1. **Los grupos llenos e inactivos no se listan.** El backend igual los
 *     rechaza (`GROUP_FULL`), pero un `409` no debería ser el flujo normal: si
 *     el admin puede elegirlo, el sistema le mintió sobre lo que había.
 *  2. **Las preferencias del alumno van primero.** Colocarlo fuera de lo que
 *     pidió es legítimo pero es la excepción, y la UI tiene que hacer que el
 *     camino correcto sea el más corto.
 *
 * La nota es obligatoria: es lo único que explica, seis meses después, por qué
 * este alumno terminó donde terminó.
 */
export function PlaceAssignmentModal({
  mode,
  row,
  overview,
  isSaving,
  onClose,
  onSubmit,
}: {
  mode: PlaceMode;
  row: SubmissionRow;
  overview: Overview | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (groupId: number, notes: string) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const offeringIndex = useMemo(() => buildOfferingIndex(overview), [overview]);
  const currentGroupId = row.assignment?.groupId ?? null;

  const { options, hiddenCount } = useMemo(() => {
    const list: GroupOption[] = [];
    let hidden = 0;

    for (const offering of overview?.offerings ?? []) {
      const pref = row.preferences.find((p) => p.semesterSubjectId === offering.semesterSubjectId);

      for (const group of offering.groups) {
        if (group.id === currentGroupId) continue; // ya está ahí
        const free = group.capacity - group.assignedCount;
        if (!offering.isActive || !group.isActive || free <= 0) {
          hidden += 1;
          continue;
        }
        list.push({
          groupId: group.id,
          subjectName: offering.name,
          groupLabel: group.label,
          free,
          prefRank: pref?.rank ?? null,
        });
      }
    }

    // Preferencias primero (por rank), después el resto alfabético: el orden es
    // la recomendación implícita de la pantalla.
    list.sort((a, b) => {
      if (a.prefRank !== b.prefRank) {
        if (a.prefRank == null) return 1;
        if (b.prefRank == null) return -1;
        return a.prefRank - b.prefRank;
      }
      return a.subjectName.localeCompare(b.subjectName, 'es');
    });

    return { options: list, hiddenCount: hidden };
  }, [overview, row.preferences, currentGroupId]);

  // Agrupadas por asignatura conservando el orden ya calculado.
  const grouped = useMemo(() => {
    const bySubject = new Map<string, GroupOption[]>();
    for (const option of options) {
      const bucket = bySubject.get(option.subjectName);
      if (bucket) bucket.push(option);
      else bySubject.set(option.subjectName, [option]);
    }
    return [...bySubject.entries()];
  }, [options]);

  const noteIsEmpty = notes.trim().length === 0;
  const canSubmit = groupId !== '' && !noteIsEmpty && !isSaving;

  const submit = async () => {
    if (groupId === '' || noteIsEmpty) return;
    await onSubmit(Number(groupId), notes.trim());
  };

  return (
    <Modal
      title={mode === 'place' ? 'Colocar alumno' : 'Mover alumno de grupo'}
      description={
        mode === 'place'
          ? 'Todas sus preferencias estaban llenas. Elegí dónde ubicarlo.'
          : 'El cambio queda registrado en la bitácora como movimiento manual.'
      }
      onClose={onClose}
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {isSaving ? 'Guardando…' : mode === 'place' ? 'Colocar' : 'Mover'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="rounded-xl border border-(--color-border) bg-(--color-surface-muted)/60 p-4">
          <p className="font-semibold tabular-nums">{row.code}</p>
          <p className="text-sm text-(--color-ink-muted)">{row.fullName ?? 'Sin nombre'}</p>

          {row.assignment && (
            <p className="text-xs text-(--color-ink-muted) mt-3">
              Actualmente en{' '}
              <strong className="text-(--color-ink)">
                {row.assignment.subjectName} · Grupo {row.assignment.groupLabel}
              </strong>
            </p>
          )}

          <ul className="mt-3 grid gap-1.5">
            {row.preferences.map((p) => {
              const reason = reasonFor(p.semesterSubjectId, offeringIndex);
              return (
                <li key={p.rank} className="flex items-center gap-2 text-sm">
                  <Badge tone="outline">{p.rank}ª</Badge>
                  <span className="min-w-0 truncate">{p.name}</span>
                  {reason && <Badge tone={REASON_TONE[reason]}>{REASON_LABEL[reason]}</Badge>}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <label className={labelClass} htmlFor="assignment-group">
            Grupo destino
          </label>
          <select
            id="assignment-group"
            className={selectClass}
            value={groupId}
            disabled={options.length === 0}
            onChange={(e) => setGroupId(e.currentTarget.value ? Number(e.currentTarget.value) : '')}
          >
            <option value="">Elegí un grupo…</option>
            {grouped.map(([subjectName, groupOptions]) => (
              <optgroup key={subjectName} label={subjectName}>
                {groupOptions.map((o) => (
                  <option key={o.groupId} value={o.groupId}>
                    Grupo {o.groupLabel} — {o.free} {o.free === 1 ? 'lugar' : 'lugares'}
                    {o.prefRank != null ? ` · su ${o.prefRank}ª preferencia` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {options.length === 0 ? (
            <p className="text-xs text-(--color-danger) mt-1.5">
              No hay ningún grupo con cupo. Activá un grupo o subí un cupo en{' '}
              <strong>Oferta y grupos</strong>.
            </p>
          ) : (
            hiddenCount > 0 && (
              <p className="text-xs text-(--color-ink-muted) mt-1.5">
                {hiddenCount} grupo{hiddenCount === 1 ? '' : 's'} sin cupo o inactivo
                {hiddenCount === 1 ? '' : 's'} no se muestra{hiddenCount === 1 ? '' : 'n'}.
              </p>
            )
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="assignment-notes">
            Nota (obligatoria)
          </label>
          <textarea
            id="assignment-notes"
            rows={3}
            className={cn(inputClass, 'resize-y')}
            placeholder="Por qué se hace esta excepción. Queda en la bitácora."
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
