import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'sonner';
import { Navbar } from '../layout/Navbar';
import { StepTags } from './StepTags';
import { LoadingStep } from './LoadingStep';
import { ClosedStep } from './ClosedStep';
import { CodeStep } from './CodeStep';
import { ErrorStep } from './ErrorStep';
import { PreferencesStep } from './PreferencesStep';
import { SummaryStep } from './SummaryStep';
import { DoneStep } from './DoneStep';
import { useTaevStore, type TaevScreen } from '../../stores/taevStore';
import { SHIFT_LABEL, type Shift } from '../../backend/connection';

const STEP_COMPONENTS: Record<TaevScreen, () => React.JSX.Element> = {
  loading: LoadingStep,
  closed: ClosedStep,
  code: CodeStep,
  error: ErrorStep,
  form: PreferencesStep,
  summary: SummaryStep,
  done: DoneStep,
};

/**
 * Portal de un turno. Cada turno es un semestre independiente con su propio
 * link (`/matutino`, `/vespertino`): la página Astro pasa `shift` y todas las
 * requests lo llevan.
 */
export function TaevPortal({ shift }: { shift: Shift }) {
  const screen = useTaevStore((s) => s.screen);
  const init = useTaevStore((s) => s.init);
  const setShift = useTaevStore((s) => s.setShift);
  const StepComponent = STEP_COMPONENTS[screen];

  useEffect(() => {
    setShift(shift);
    void init();
  }, [shift, setShift, init]);

  return (
    <div className="min-h-screen flex flex-col bg-(--color-surface-muted)">
      <Toaster position="top-center" richColors />
      <Navbar />
      <main className="flex-1 flex justify-center px-4 md:px-6 py-10 md:py-14">
        <div className="w-full max-w-md flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
            Turno {SHIFT_LABEL[shift].toLowerCase()} ·{' '}
            <a href="/" className="font-normal normal-case underline underline-offset-2 hover:text-(--color-ink)">
              cambiar turno
            </a>
          </p>
          <StepTags screen={screen} />
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <StepComponent />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
