import { ArrowRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { selectClass } from '../ui/formStyles';
import { canContinue, selectedCount, useTaevStore } from '../../stores/taevStore';

/** Ancho fijo del select de rango: no depende del texto de la opción elegida. */
const SELECT_WIDTH = 224;

export function PreferencesStep() {
  const studentName = useTaevStore((s) => s.studentName);
  const offerings = useTaevStore((s) => s.offerings);
  const ranksRequired = useTaevStore((s) => s.ranksRequired);
  const rankings = useTaevStore((s) => s.rankings);
  const selectRank = useTaevStore((s) => s.selectRank);
  const goSummary = useTaevStore((s) => s.goSummary);

  const nameRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowMinHeight, setRowMinHeight] = useState<number>();

  useLayoutEffect(() => {
    const measure = () => {
      const tallestText = nameRefs.current.reduce(
        (max, el) => (el ? Math.max(max, el.scrollHeight) : max),
        0,
      );
      if (!tallestText || !rowRef.current) return;
      const style = getComputedStyle(rowRef.current);
      const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setRowMinHeight(tallestText + paddingY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [offerings]);

  const count = selectedCount(rankings);
  const ready = canContinue(rankings, ranksRequired);
  const greeting = studentName ? `Hola, ${studentName}` : 'Registro de preferencias';

  const rankOptions = Array.from({ length: ranksRequired }, (_, i) => i + 1);
  const rankLabel = (rank: number) => {
    if (rank === 1) return '1 · Más preferida';
    if (rank === ranksRequired) return `${rank} · Menos preferida`;
    return String(rank);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card elevation="sm" className="p-4">
        <div className="text-xs font-semibold tracking-wide uppercase text-(--color-primary)">{greeting}</div>
        <div className="text-xl font-heading font-semibold mt-1">Elige tus preferencias de TAEV</div>
        <p className="text-sm text-(--color-ink-muted) mt-2">
          Ordena tus opciones asignando <strong>1</strong> a la que más prefieres y{' '}
          <strong>{ranksRequired}</strong> a la que menos. El registro se asigna por orden de llegada, así
          que confirma con cuidado.
        </p>
      </Card>

      <Card className="px-6 md:px-8">
        {offerings.map((offering, i) => (
          <div
            key={offering.semesterSubjectId}
            ref={i === 0 ? rowRef : undefined}
            className="flex items-center gap-3 py-3 border-b border-(--color-border) last:border-b-0"
            style={rowMinHeight ? { minHeight: rowMinHeight } : undefined}
          >
            <span
              ref={(el) => {
                nameRefs.current[i] = el;
              }}
              className="text-sm flex-1 min-w-0 break-words"
            >
              {offering.name}
            </span>
            <select
              className={`${selectClass} shrink-0`}
              style={{ width: SELECT_WIDTH }}
              value={rankings[offering.semesterSubjectId] ?? ''}
              onChange={(e) =>
                selectRank(offering.semesterSubjectId, e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Sin preferencia</option>
              {rankOptions.map((rank) => (
                <option key={rank} value={rank}>
                  {rankLabel(rank)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between text-xs text-(--color-ink-muted)">
        <span>
          Seleccionadas: {count} de {ranksRequired}
        </span>
        {!ready && <span>Asigna {rankOptions.join(', ')} para continuar</span>}
      </div>

      <Button color="primary" variant="filled" fullWidth disabled={!ready} onClick={goSummary}>
        Revisar y confirmar
        <ArrowRight size={14} />
      </Button>
    </div>
  );
}
