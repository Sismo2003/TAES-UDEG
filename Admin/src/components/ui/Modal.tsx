import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Único primitivo de diálogo del panel (`.agents/skills/ui/SKILL.md` §4):
 * portal a `document.body`, bloquea el scroll del fondo, cierra con Escape o
 * click en el backdrop. No se introduce Radix/Headless UI.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full rounded-2xl border border-(--color-border) bg-(--color-surface) shadow-xl my-8',
          size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-(--color-border)">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {description && (
              <p className="text-xs text-(--color-ink-muted) mt-1">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-(--color-ink-subtle) hover:text-(--color-ink) rounded-lg p-1 -m-1"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 px-6 py-4 border-t border-(--color-border) bg-(--color-surface-muted)/60 rounded-b-2xl">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
