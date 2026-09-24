/**
 * Estilos de formulario centralizados. Reusar — no escribir styling de input
 * nuevo en cada form (ver `.agents/skills/ui/SKILL.md` §6).
 */
export const inputClass =
  'w-full min-h-10 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 py-2 ' +
  'text-sm text-(--color-ink) transition outline-none placeholder:text-(--color-ink-subtle) ' +
  'focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)/15 ' +
  'disabled:bg-(--color-surface-muted) disabled:text-(--color-ink-muted)';

export const inputErrorClass = 'border-(--color-danger) focus:border-(--color-danger)';

export const labelClass = 'block text-xs font-medium text-(--color-ink-muted) mb-1.5';

export const selectClass = `${inputClass} pr-8 appearance-none bg-no-repeat`;

export const errorTextClass = 'text-xs text-(--color-danger) mt-1';
