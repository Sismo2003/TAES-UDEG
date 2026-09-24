import { Badge } from '../ui/Badge';
import type { TaevScreen } from '../../stores/taevStore';

const STEP_LABELS = ['Código', 'Preferencias', 'Confirmar', 'Listo'];

/** `null` ⇒ la pantalla no muestra los tags (loading / closed). */
const STEP_INDEX: Record<TaevScreen, number | null> = {
  loading: null,
  closed: null,
  code: 0,
  error: 0,
  form: 1,
  summary: 2,
  done: 3,
};

export function StepTags({ screen }: { screen: TaevScreen }) {
  const activeIndex = STEP_INDEX[screen];
  if (activeIndex === null) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {STEP_LABELS.map((label, i) => (
        <Badge key={label} tone={i === activeIndex ? 'accent' : i < activeIndex ? 'neutral' : 'outline'}>
          {i + 1} · {label}
        </Badge>
      ))}
    </div>
  );
}
