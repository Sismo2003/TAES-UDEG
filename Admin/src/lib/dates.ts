/**
 * Fechas del panel.
 *
 * La API habla SIEMPRE en ISO/UTC (`timestamptz` en la base). El admin piensa
 * en hora local ("abre a las 10:00"). La conversión ocurre sólo acá: ningún
 * componente arma un string de fecha por su cuenta.
 */

const FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', FORMAT);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** ISO → valor de un `<input type="datetime-local">` (hora local, sin zona). */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de `datetime-local` (hora local) → ISO en UTC para la API. */
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

/** Minutos entre dos instantes — la duración de la ventana. */
export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
}
