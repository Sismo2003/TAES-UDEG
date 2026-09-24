import { useSemesterStore } from '../../stores/semesterStore';
import { selectClass } from '../ui/formStyles';
import { cn } from '../../lib/cn';

/**
 * Selector del semestre en contexto. Vive en el chrome (no en cada pantalla)
 * porque el semestre es el eje de todo el panel: cambiarlo acá recarga padrón,
 * oferta y dashboard sin que el admin lo elija de nuevo en cada vista.
 */
export function SemesterSwitcher() {
  const { semesters, selectedId, select, isLoading } = useSemesterStore();

  if (semesters.length === 0) {
    return <span className="text-xs text-(--color-ink-muted)">Sin semestres</span>;
  }

  return (
    <label className="flex items-center gap-2 text-xs text-(--color-ink-muted)">
      <span className="hidden sm:inline">Semestre</span>
      <select
        className={cn(selectClass, 'min-h-9 w-auto text-sm')}
        value={selectedId ?? ''}
        disabled={isLoading}
        onChange={(e) => void select(Number(e.currentTarget.value))}
      >
        {semesters.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} — {s.label}
            {s.isCurrent ? ' (activo)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
