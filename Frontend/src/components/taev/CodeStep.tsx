import { ArrowRight } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { inputClass, labelClass } from '../ui/formStyles';
import { CODE_LENGTH, useTaevStore } from '../../stores/taevStore';

export function CodeStep() {
  const code = useTaevStore((s) => s.code);
  const setCode = useTaevStore((s) => s.setCode);
  const submitCode = useTaevStore((s) => s.submitCode);
  const isSubmitting = useTaevStore((s) => s.isSubmitting);

  return (
    <Card>
      <div className="text-xs font-semibold tracking-wide uppercase text-(--color-primary)">Registro TAEV</div>
      <h1 className="text-2xl md:text-3xl mt-2 mb-3">Bienvenido al registro de TAEV</h1>
      <p className="text-sm text-(--color-ink-muted)">
        Ingresa tu código de alumno para continuar con tu proceso de selección de Trayectorias de Aprendizaje
        Especializante y Vinculación.
      </p>
      <div className="mt-4">
        <label className={labelClass} htmlFor="taev-code">
          Código de alumno
        </label>
        <input
          id="taev-code"
          className={inputClass}
          placeholder="Ej. 218327451"
          inputMode="numeric"
          maxLength={CODE_LENGTH}
          value={code}
          disabled={isSubmitting}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isSubmitting) submitCode();
          }}
        />
      </div>
      <p className="text-xs text-(--color-ink-muted)/70 mt-2">
        Tu código de alumno consta de {CODE_LENGTH} dígitos.
      </p>
      <Button
        color="primary"
        variant="filled"
        fullWidth
        className="mt-6 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
        onClick={submitCode}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <span
            className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
            style={{ animation: 'taev-spin 0.7s linear infinite' }}
          />
        ) : (
          <>
            Continuar
            <ArrowRight size={14} />
          </>
        )}
      </Button>
    </Card>
  );
}
