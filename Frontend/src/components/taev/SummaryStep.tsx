import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { summaryList, useTaevStore } from '../../stores/taevStore';

export function SummaryStep() {
  const rankings = useTaevStore((s) => s.rankings);
  const offerings = useTaevStore((s) => s.offerings);
  const ranksRequired = useTaevStore((s) => s.ranksRequired);
  const isSubmitting = useTaevStore((s) => s.isSubmitting);
  const backToForm = useTaevStore((s) => s.backToForm);
  const confirmSubmit = useTaevStore((s) => s.confirmSubmit);

  const list = summaryList(rankings, offerings, ranksRequired);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="text-xs font-semibold tracking-wide uppercase text-(--color-primary)">
          Resumen de tu selección
        </div>
        <div className="text-xl font-heading font-semibold mt-1 mb-4">Confirma tu orden de preferencia</div>
        <div className="flex flex-col gap-2">
          {list.map((item) => (
            <div
              key={item.rank}
              className="flex items-center gap-3 py-2 border-b border-(--color-border) last:border-b-0"
            >
              <Badge tone="accent" className="min-w-6 justify-center">
                {item.rank}
              </Badge>
              <span className="text-sm">{item.name}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-(--color-ink-muted)/70 mt-4">
          Al confirmar, tu solicitud se enviará al sistema y se registrará con la hora exacta de envío. No podrás
          modificarla después.
        </p>
      </Card>
      <div className="flex gap-3">
        <Button color="neutral" variant="flat" className="flex-1" onClick={backToForm} disabled={isSubmitting}>
          Regresar
        </Button>
        <Button
          color="primary"
          variant="filled"
          className="flex-[2]"
          disabled={isSubmitting}
          onClick={confirmSubmit}
        >
          {isSubmitting ? 'Enviando…' : 'Confirmar y enviar'}
        </Button>
      </div>
    </div>
  );
}
