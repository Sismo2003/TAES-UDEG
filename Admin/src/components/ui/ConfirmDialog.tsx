import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

/** Confirmación para acciones destructivas. Nunca un `window.confirm`. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirmar',
  tone = 'danger',
  isBusy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  isBusy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isBusy}>
            Cancelar
          </Button>
          <Button color={tone} onClick={onConfirm} disabled={isBusy}>
            {isBusy ? 'Aplicando…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-(--color-ink-muted)">{children}</div>
    </Modal>
  );
}
