import { useEffect, useState } from 'react';
import { CalendarClock, Lock } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { closedContent, serverNow, useTaevStore } from '../../stores/taevStore';

/** mm:ss / hh:mm:ss restantes, calculado contra el reloj del servidor. */
function useCountdown(target: string | null, offsetMs: number): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setLabel(null);
      return;
    }
    const targetMs = new Date(target).getTime();

    const tick = () => {
      const diff = targetMs - serverNow(offsetMs).getTime();
      if (diff <= 0) {
        setLabel('00:00');
        useTaevStore.getState().init();
        return;
      }
      const total = Math.floor(diff / 1000);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setLabel(h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, offsetMs]);

  return label;
}

export function ClosedStep() {
  const window = useTaevStore((s) => s.window);
  const offsetMs = useTaevStore((s) => s.clockOffsetMs);
  const init = useTaevStore((s) => s.init);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await init({ silent: true });
    setRefreshing(false);
  };

  const reason = window?.reason ?? 'NO_ACTIVE_SEMESTER';
  const showCountdown = reason === 'NOT_YET_OPEN' && window?.opensAt;
  const countdown = useCountdown(showCountdown ? (window?.opensAt ?? null) : null, offsetMs);

  const Icon = showCountdown ? CalendarClock : Lock;

  return (
    <Card className="text-center">
      <Icon size={40} className="mx-auto mb-3 text-(--color-primary)" strokeWidth={1.5} />
      <div className="text-lg font-heading font-semibold">Registro no disponible</div>
      <p className="text-sm text-(--color-ink-muted) mt-2">{closedContent(reason)}</p>

      {showCountdown && countdown && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-(--color-ink-muted)">Abre en</div>
          <div className="text-3xl font-heading font-semibold tabular-nums mt-1">{countdown}</div>
        </div>
      )}

      <Button
        color="neutral"
        variant="outlined"
        fullWidth
        className="mt-5 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
        onClick={handleRefresh}
        disabled={refreshing}
      >
        {refreshing ? (
          <span
            className="w-4 h-4 rounded-full border-2 border-(--color-primary)/30 border-t-(--color-primary)"
            style={{ animation: 'taev-spin 0.7s linear infinite' }}
          />
        ) : (
          'Actualizar'
        )}
      </Button>
    </Card>
  );
}
