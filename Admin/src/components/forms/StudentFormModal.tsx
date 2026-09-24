import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { errorTextClass, inputClass, inputErrorClass, labelClass } from '../ui/formStyles';
import { cn } from '../../lib/cn';
import type { StudentInput, StudentRow } from '../../backend/connection';

/**
 * El código es de 9 dígitos EXACTOS. La regla vive en cuatro capas
 * (`taev.config.json`, este form, `TAEV_STUDENT_CODE_LENGTH` y el CHECK de la
 * BD); si cambia, se cambian las cuatro (CLAUDE.md, regla dura #7).
 */
const schema = yup.object({
  code: yup
    .string()
    .required('El código es obligatorio.')
    .matches(/^\d{9}$/, 'Debe ser exactamente 9 dígitos.'),
  fullName: yup.string().max(160, 'Máximo 160 caracteres.').default(''),
  email: yup.string().email('Correo inválido.').max(160).default(''),
  career: yup.string().max(120).default(''),
  studentSemesterLabel: yup.string().max(32).default(''),
});

type FormValues = yup.InferType<typeof schema>;

const blank = (student?: StudentRow | null): FormValues => ({
  code: student?.code ?? '',
  fullName: student?.fullName ?? '',
  email: student?.email ?? '',
  career: student?.career ?? '',
  studentSemesterLabel: student?.studentSemesterLabel ?? '',
});

export function StudentFormModal({
  student,
  onClose,
  onSubmit,
  isSaving,
}: {
  /** `null` ⇒ alta; una fila ⇒ edición. */
  student: StudentRow | null;
  onClose: () => void;
  onSubmit: (values: StudentInput) => Promise<void>;
  isSaving: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: yupResolver(schema), defaultValues: blank(student) });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      code: values.code,
      fullName: values.fullName || null,
      email: values.email || null,
      career: values.career || null,
      studentSemesterLabel: values.studentSemesterLabel || null,
    });
  });

  const lockedCode = Boolean(student?.submission);

  return (
    <Modal
      title={student ? `Editar ${student.code}` : 'Agregar estudiante'}
      description={
        student
          ? 'Los datos personales son opcionales; el código es lo único que valida el portal.'
          : 'Sólo el código es obligatorio. El resto ayuda a identificar al alumno en los reportes.'
      }
      onClose={onClose}
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={isSaving}>
            {isSaving ? 'Guardando…' : student ? 'Guardar cambios' : 'Agregar'}
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
        <div className="sm:col-span-1">
          <label className={labelClass} htmlFor="code">
            Código UDEG (9 dígitos) *
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="off"
            className={cn(inputClass, errors.code && inputErrorClass, 'tabular-nums')}
            disabled={lockedCode}
            {...register('code')}
          />
          {errors.code && <p className={errorTextClass}>{errors.code.message}</p>}
          {lockedCode && (
            <p className="text-xs text-(--color-ink-muted) mt-1">
              El alumno ya envió su formulario: su código no se puede cambiar.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="fullName">
            Nombre completo
          </label>
          <input id="fullName" className={inputClass} {...register('fullName')} />
          {errors.fullName && <p className={errorTextClass}>{errors.fullName.message}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            type="email"
            className={cn(inputClass, errors.email && inputErrorClass)}
            {...register('email')}
          />
          {errors.email && <p className={errorTextClass}>{errors.email.message}</p>}
        </div>

        <div>
          <label className={labelClass} htmlFor="career">
            Programa / carrera
          </label>
          <input id="career" className={inputClass} {...register('career')} />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="studentSemesterLabel">
            Semestre del alumno
          </label>
          <input
            id="studentSemesterLabel"
            placeholder="4to semestre"
            className={inputClass}
            {...register('studentSemesterLabel')}
          />
        </div>
      </form>
    </Modal>
  );
}
