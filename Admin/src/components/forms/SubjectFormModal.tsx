import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { errorTextClass, inputClass, inputErrorClass, labelClass } from '../ui/formStyles';
import { cn } from '../../lib/cn';
import type { SubjectRow } from '../../backend/connection';

const schema = yup.object({
  code: yup
    .string()
    .required('El código es obligatorio.')
    .max(32, 'Máximo 32 caracteres.')
    .matches(/^[A-Za-z0-9-]+$/, 'Sólo letras, números y guiones.'),
  name: yup.string().required('El nombre es obligatorio.').max(120, 'Máximo 120 caracteres.'),
  description: yup.string().max(500, 'Máximo 500 caracteres.').default(''),
});

type FormValues = yup.InferType<typeof schema>;

export interface SubjectSubmit {
  code: string;
  name: string;
  description: string | null;
}

/**
 * Alta/edición en el catálogo maestro. El catálogo es compartido por toda la
 * red: crear una asignatura acá NO la pone en ningún semestre — eso se hace en
 * "Oferta y grupos".
 */
export function SubjectFormModal({
  subject,
  onClose,
  onSubmit,
  isSaving,
}: {
  subject: SubjectRow | null;
  onClose: () => void;
  onSubmit: (values: SubjectSubmit) => Promise<void>;
  isSaving: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      code: subject?.code ?? '',
      name: subject?.name ?? '',
      description: subject?.description ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      code: values.code.toUpperCase(),
      name: values.name,
      description: values.description || null,
    });
  });

  return (
    <Modal
      title={subject ? `Editar ${subject.code}` : 'Nueva asignatura'}
      description="El catálogo es compartido por toda la red. Ofrecerla en un semestre es otro paso."
      onClose={onClose}
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={isSaving}>
            {isSaving ? 'Guardando…' : subject ? 'Guardar cambios' : 'Crear'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-4"
      >
        <div>
          <label className={labelClass} htmlFor="subject-code">
            Código *
          </label>
          <input
            id="subject-code"
            placeholder="TAEV-ROB"
            autoComplete="off"
            className={cn(inputClass, errors.code && inputErrorClass, 'uppercase')}
            disabled={Boolean(subject)}
            {...register('code')}
          />
          {errors.code && <p className={errorTextClass}>{errors.code.message}</p>}
          {subject && (
            <p className="text-xs text-(--color-ink-muted) mt-1">
              El código identifica a la asignatura en toda la red: no se cambia.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="subject-name">
            Nombre *
          </label>
          <input
            id="subject-name"
            placeholder="Robótica"
            className={cn(inputClass, errors.name && inputErrorClass)}
            {...register('name')}
          />
          {errors.name && <p className={errorTextClass}>{errors.name.message}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="subject-description">
            Descripción
          </label>
          <textarea
            id="subject-description"
            rows={3}
            className={cn(inputClass, 'min-h-20 resize-y')}
            {...register('description')}
          />
          {errors.description && <p className={errorTextClass}>{errors.description.message}</p>}
        </div>
      </form>
    </Modal>
  );
}
