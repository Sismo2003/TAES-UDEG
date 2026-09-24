import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { errorTextClass, inputClass, inputErrorClass, labelClass, selectClass } from '../ui/formStyles';
import { cn } from '../../lib/cn';
import { fromLocalInputValue, minutesBetween, toLocalInputValue } from '../../lib/dates';
import type { Campus, SemesterInput, SemesterRow } from '../../backend/connection';

const schema = yup.object({
  campusId: yup.number().nullable().default(null),
  code: yup
    .string()
    .required('El código es obligatorio.')
    .max(16, 'Máximo 16 caracteres.')
    .matches(/^[A-Za-z0-9-]+$/, 'Sólo letras, números y guiones.'),
  label: yup.string().required('La etiqueta es obligatoria.').max(64),
  opensAt: yup.string().required('Indicá cuándo abre.'),
  durationMinutes: yup
    .number()
    .typeError('Poné los minutos que dura la ventana.')
    .required('Poné los minutos que dura la ventana.')
    .integer('Debe ser un entero.')
    .min(1, 'Al menos 1 minuto.')
    .max(1440, 'Máximo 24 horas.'),
  ranksRequired: yup
    .number()
    .typeError('Entre 1 y 10.')
    .required()
    .integer()
    .min(1, 'Al menos 1.')
    .max(10, 'Máximo 10.'),
  notes: yup.string().max(1000).default(''),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Alta/edición de semestre — el "evento".
 *
 * La ventana se pide como **apertura + duración**, que es como la piensa quien
 * la opera ("abre 10:00, dura 15 minutos"). El backend deriva `closesAt` en un
 * solo lugar (`deriveClosesAt`), así que acá no se calcula nada a mano.
 */
export function SemesterFormModal({
  semester,
  campuses,
  needsCampus,
  onClose,
  onSubmit,
  isSaving,
}: {
  semester: SemesterRow | null;
  campuses: Campus[];
  /** Sólo el superadmin global elige escuela; un admin de campus la hereda. */
  needsCampus: boolean;
  onClose: () => void;
  onSubmit: (values: SemesterInput) => Promise<void>;
  isSaving: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      campusId: semester?.campusId ?? campuses[0]?.id ?? null,
      code: semester?.code ?? '',
      label: semester?.label ?? '',
      opensAt: toLocalInputValue(semester?.opensAt) || toLocalInputValue(new Date().toISOString()),
      durationMinutes: semester ? minutesBetween(semester.opensAt, semester.closesAt) : 15,
      ranksRequired: semester?.ranksRequired ?? 3,
      notes: '',
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      ...(needsCampus && values.campusId ? { campusId: Number(values.campusId) } : {}),
      code: values.code.toUpperCase(),
      label: values.label,
      opensAt: fromLocalInputValue(values.opensAt),
      durationMinutes: values.durationMinutes,
      ranksRequired: values.ranksRequired,
      notes: values.notes || null,
    });
  });

  return (
    <Modal
      title={semester ? `Editar ${semester.code}` : 'Nuevo semestre'}
      description="La ventana de envío se define como hora de apertura + duración en minutos."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={isSaving}>
            {isSaving ? 'Guardando…' : semester ? 'Guardar cambios' : 'Crear semestre'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        {needsCampus && !semester && (
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="campusId">
              Escuela *
            </label>
            <select id="campusId" className={selectClass} {...register('campusId')}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="code">
            Código *
          </label>
          <input
            id="code"
            placeholder="2026A"
            className={cn(inputClass, errors.code && inputErrorClass, 'uppercase')}
            disabled={Boolean(semester)}
            {...register('code')}
          />
          {errors.code && <p className={errorTextClass}>{errors.code.message}</p>}
          {semester && (
            <p className="text-xs text-(--color-ink-muted) mt-1">
              El código identifica al ciclo dentro de la escuela: no se cambia.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="label">
            Etiqueta visible *
          </label>
          <input
            id="label"
            placeholder="2026-A"
            className={cn(inputClass, errors.label && inputErrorClass)}
            {...register('label')}
          />
          {errors.label && <p className={errorTextClass}>{errors.label.message}</p>}
          <p className="text-xs text-(--color-ink-muted) mt-1">Es lo que ve el alumno al terminar.</p>
        </div>

        <div>
          <label className={labelClass} htmlFor="opensAt">
            Abre (hora local) *
          </label>
          <input
            id="opensAt"
            type="datetime-local"
            className={cn(inputClass, errors.opensAt && inputErrorClass)}
            {...register('opensAt')}
          />
          {errors.opensAt && <p className={errorTextClass}>{errors.opensAt.message}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="durationMinutes">
            Duración (minutos) *
          </label>
          <input
            id="durationMinutes"
            type="number"
            min={1}
            className={cn(inputClass, errors.durationMinutes && inputErrorClass, 'tabular-nums')}
            {...register('durationMinutes')}
          />
          {errors.durationMinutes && (
            <p className={errorTextClass}>{errors.durationMinutes.message}</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="ranksRequired">
            Preferencias a ordenar *
          </label>
          <input
            id="ranksRequired"
            type="number"
            min={1}
            max={10}
            className={cn(inputClass, errors.ranksRequired && inputErrorClass, 'tabular-nums')}
            {...register('ranksRequired')}
          />
          {errors.ranksRequired && <p className={errorTextClass}>{errors.ranksRequired.message}</p>}
          <p className="text-xs text-(--color-ink-muted) mt-1">
            Cuántas asignaturas rankea cada alumno (1 a 10).
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="notes">
            Notas internas
          </label>
          <textarea id="notes" rows={2} className={cn(inputClass, 'resize-y')} {...register('notes')} />
        </div>
      </form>
    </Modal>
  );
}
