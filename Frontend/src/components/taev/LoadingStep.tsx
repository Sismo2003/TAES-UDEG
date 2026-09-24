import { Card } from '../ui/Card';

export function LoadingStep() {
  return (
    <Card className="text-center">
      <div
        className="w-11 h-11 mx-auto mb-4 rounded-full border-[3px] border-(--color-primary)/20 border-t-(--color-primary)"
        style={{ animation: 'taev-spin 0.8s linear infinite' }}
      />
      <div className="text-lg font-heading font-semibold">Cargando el registro…</div>
      <p className="text-sm text-(--color-ink-muted) mt-2">
        Estamos consultando el estado del periodo de registro.
      </p>
    </Card>
  );
}
