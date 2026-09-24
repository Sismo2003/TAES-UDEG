import { CircleX } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { errorContent, useTaevStore } from '../../stores/taevStore';

export function ErrorStep() {
  const errorKind = useTaevStore((s) => s.errorKind);
  const retry = useTaevStore((s) => s.retry);

  const { title, body } = errorContent(errorKind);
  const canRetry = errorKind !== 'ALREADY_SUBMITTED';

  return (
    <Card className="text-center">
      <CircleX size={40} className="mx-auto mb-3 text-(--color-primary)" strokeWidth={1.5} />
      <div className="text-lg font-heading font-semibold">{title}</div>
      <p className="text-sm text-(--color-ink-muted) mt-2">{body}</p>
      {canRetry && (
        <Button color="neutral" variant="outlined" fullWidth className="mt-4" onClick={retry}>
          Intentar de nuevo
        </Button>
      )}
    </Card>
  );
}
