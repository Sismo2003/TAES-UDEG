import { twMerge } from 'tailwind-merge';

/** Une clases condicionales resolviendo conflictos de Tailwind (la última gana). */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(' '));
}
