import { CircleCheck } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useTaevStore } from '../../stores/taevStore';

export function DoneStep() {
  const semesterLabel = useTaevStore((s) => s.semesterLabel);
  const preferences = useTaevStore((s) => s.submittedPreferences);
  const reset = useTaevStore((s) => s.reset);

  return (
    <Card elevation="lg" className="text-center">
      <CircleCheck size={44} className="mx-auto mb-3 text-(--color-primary)" strokeWidth={1.5} />
      <div className="text-lg font-heading font-semibold">¡Registro enviado con éxito!</div>
      <p className="text-sm text-(--color-ink-muted) mt-2">
        Tu selección de TAEV quedó registrada para el semestre {semesterLabel}.
      </p>
      <div className="flex flex-col gap-1.5 my-4 text-left">
        {preferences.map((item) => (
          <div key={item.rank} className="flex items-center gap-3 text-sm">
            <Badge tone="outline" className="min-w-5.5 justify-center">
              {item.rank}
            </Badge>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-(--color-ink-muted)/70">
        La coordinación publicará los grupos asignados una vez que cierre el periodo de registro. Guarda una
        captura de esta pantalla como comprobante de tu envío.
      </p>
      <Button color="neutral" variant="flat" className="mt-4" onClick={reset}>
        Volver al inicio
      </Button>
    </Card>
  );
}
