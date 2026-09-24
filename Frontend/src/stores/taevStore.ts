import { create } from 'zustand';
import { toast } from 'sonner';
import taevConfig from '../data/taev.config.json';
import {
  endpoints,
  type ApiError,
  type Offering,
  type WindowState,
} from '../backend/connection';

/**
 * Escuela a la que apunta este despliegue del portal. Se manda explícito como
 * `?campus=` — determinista, no depende de que haya un solo campus activo.
 */
export const CAMPUS = taevConfig.campus;

/**
 * Longitud del código de alumno UDEG: EXACTAMENTE 9 dígitos. Validación de
 * cliente; la API y la BD la revalidan. Este valor coincide con
 * `TAEV_STUDENT_CODE_LENGTH`, la columna `semester_students.code` y el CHECK
 * `semester_students_code_format`.
 */
export const CODE_LENGTH = taevConfig.codeLength;
export const CODE_PATTERN = new RegExp(`^\\d{${CODE_LENGTH}}$`);

export type TaevScreen =
  | 'loading'
  | 'closed'
  | 'code'
  | 'error'
  | 'form'
  | 'summary'
  | 'done';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Título + cuerpo para la pantalla de error, según el `message` de la API. */
export function errorContent(kind: string): { title: string; body: string } {
  switch (kind) {
    case 'INVALID_CODE_FORMAT':
      return {
        title: 'Código inválido',
        body: `El código de alumno debe tener exactamente ${CODE_LENGTH} dígitos.`,
      };
    case 'CODE_NOT_FOUND':
      return {
        title: 'Código no encontrado',
        body: 'No encontramos ningún alumno con ese código en el padrón de este semestre. Revísalo e intenta de nuevo.',
      };
    case 'ALREADY_SUBMITTED':
      return {
        title: 'Ya completaste tu registro',
        body: 'Este código ya envió sus preferencias de TAEV. El registro es una sola vez por semestre y no se puede modificar.',
      };
    default:
      return {
        title: 'Algo salió mal',
        body: 'No pudimos procesar tu solicitud. Vuelve a intentarlo en unos momentos.',
      };
  }
}

/** Submensaje de la pantalla de "registro cerrado", según el motivo de la ventana. */
export function closedContent(reason: WindowState['reason']): string {
  switch (reason) {
    case 'FORCED_CLOSED':
      return 'El registro fue cerrado por la coordinación.';
    case 'NOT_YET_OPEN':
      return 'El registro todavía no abre. Regresa a la hora indicada.';
    case 'CLOSED_SCHEDULED':
      return 'El periodo de registro ya cerró.';
    case 'NO_ACTIVE_SEMESTER':
    default:
      return 'El registro de TAEV no está disponible en este momento.';
  }
}

interface SubmittedPreference {
  rank: number;
  name: string;
}

interface TaevState {
  screen: TaevScreen;
  code: string;

  /** Offset del reloj: `serverTime - Date.now()` al montar. El cliente nunca
   *  decide si la ventana está abierta; sólo corrige su cuenta regresiva. */
  clockOffsetMs: number;
  window: WindowState | null;

  campusName: string;
  semesterLabel: string;
  ranksRequired: number;
  offerings: Offering[];
  studentName: string | null;

  /** semesterSubjectId → rank (1..ranksRequired) o null. */
  rankings: Record<number, number | null>;

  errorKind: string;
  isSubmitting: boolean;
  submittedAt: string;
  submittedPreferences: SubmittedPreference[];

  init: (opts?: { silent?: boolean }) => Promise<void>;
  setCode: (code: string) => void;
  submitCode: () => Promise<void>;
  selectRank: (semesterSubjectId: number, rank: number | null) => void;
  goSummary: () => void;
  backToForm: () => void;
  confirmSubmit: () => Promise<void>;
  retry: () => void;
  reset: () => void;
}

/** Instante actual corregido con el offset del servidor. */
export function serverNow(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs);
}

export const useTaevStore = create<TaevState>((set, get) => ({
  screen: 'loading',
  code: '',
  clockOffsetMs: 0,
  window: null,
  campusName: '',
  semesterLabel: '',
  ranksRequired: 0,
  offerings: [],
  studentName: null,
  rankings: {},
  errorKind: '',
  isSubmitting: false,
  submittedAt: '',
  submittedPreferences: [],

  init: async ({ silent = false } = {}) => {
    if (!silent) set({ screen: 'loading' });
    try {
      const { data } = await endpoints.taev_status(CAMPUS);
      const offset = new Date(data.window.serverTime).getTime() - Date.now();
      if (silent) await sleep(1000);

      set({
        clockOffsetMs: offset,
        window: data.window,
        campusName: data.campus.name,
        semesterLabel: data.semester?.label ?? '',
        ranksRequired: data.semester?.ranksRequired ?? 0,
        offerings: data.offerings,
        rankings: Object.fromEntries(data.offerings.map((o) => [o.semesterSubjectId, null])),
        screen: data.window.isOpen ? 'code' : 'closed',
      });
    } catch {
      if (silent) await sleep(1000);
      set({
        screen: 'closed',
        window: {
          isOpen: false,
          reason: 'NO_ACTIVE_SEMESTER',
          opensAt: null,
          closesAt: null,
          serverTime: new Date().toISOString(),
          opensInMs: null,
          closesInMs: null,
        },
      });
    }
  },

  setCode: (code) => set({ code: code.replace(/\D/g, '').slice(0, CODE_LENGTH) }),

  submitCode: async () => {
    const { code } = get();
    if (!CODE_PATTERN.test(code)) {
      set({ screen: 'error', errorKind: 'INVALID_CODE_FORMAT' });
      return;
    }

    set({ isSubmitting: true });
    try {
      const { data } = await endpoints.taev_verifyCode(code, CAMPUS);
      await sleep(1000);
      set({
        studentName: data.studentName,
        semesterLabel: data.semesterLabel,
        ranksRequired: data.ranksRequired,
        offerings: data.offerings,
        rankings: Object.fromEntries(data.offerings.map((o) => [o.semesterSubjectId, null])),
        isSubmitting: false,
        screen: 'form',
      });
    } catch (err) {
      set({ isSubmitting: false });
      handleApiError(err as ApiError, set, get);
    }
  },

  selectRank: (semesterSubjectId, rank) =>
    set((state) => {
      const rankings = { ...state.rankings };
      if (rank !== null) {
        for (const key of Object.keys(rankings)) {
          if (rankings[Number(key)] === rank) rankings[Number(key)] = null;
        }
      }
      rankings[semesterSubjectId] = rank;
      return { rankings };
    }),

  goSummary: () => set({ screen: 'summary' }),
  backToForm: () => set({ screen: 'form' }),

  confirmSubmit: async () => {
    const { rankings, ranksRequired } = get();
    const preferences = Object.entries(rankings)
      .filter(([, rank]) => rank !== null)
      .map(([id, rank]) => ({ semesterSubjectId: Number(id), rank: rank as number }));

    if (preferences.length !== ranksRequired) {
      toast.error('Completa todas tus preferencias antes de enviar.');
      return;
    }

    set({ isSubmitting: true });
    try {
      const { data } = await endpoints.taev_submit(get().code, preferences, CAMPUS);
      set({
        screen: 'done',
        isSubmitting: false,
        submittedAt: data.submittedAt,
        semesterLabel: data.semesterLabel,
        submittedPreferences: data.preferences,
      });
    } catch (err) {
      set({ isSubmitting: false });
      handleApiError(err as ApiError, set, get);
    }
  },

  retry: () => set({ screen: 'code', code: '', errorKind: '' }),

  reset: () => {
    set({ code: '', errorKind: '', studentName: null, rankings: {}, isSubmitting: false });
    void get().init();
  },
}));

/**
 * Ramifica por el `message` machine-readable de la API. La ventana la decide
 * SIEMPRE el servidor: un 403 manda a la pantalla de cerrado con el motivo real.
 */
function handleApiError(
  err: ApiError,
  set: (partial: Partial<TaevState>) => void,
  get: () => TaevState,
) {
  const kind = err.API_message;

  if (err.API_status === 403) {
    const reason = (
      [
        'NO_ACTIVE_SEMESTER',
        'FORCED_CLOSED',
        'NOT_YET_OPEN',
        'CLOSED_SCHEDULED',
      ] as const
    ).includes(kind as never)
      ? (kind as WindowState['reason'])
      : 'NO_ACTIVE_SEMESTER';

    set({
      screen: 'closed',
      window: {
        ...(get().window ?? {
          opensAt: null,
          closesAt: null,
          serverTime: new Date().toISOString(),
          opensInMs: null,
          closesInMs: null,
        }),
        isOpen: false,
        reason,
      },
    });
    return;
  }

  if (kind === 'INVALID_PREFERENCES') {
    toast.error('Revisa tus preferencias e intenta de nuevo.');
    set({ screen: 'form' });
    return;
  }

  if (kind === 'RATE_LIMITED') {
    toast.error('Demasiados intentos. Espera un momento y vuelve a intentar.');
    return;
  }

  set({ screen: 'error', errorKind: kind });
}

// ─────────────────────────────────────────────────────────────────────────────
// Selectores derivados
// ─────────────────────────────────────────────────────────────────────────────

export function selectedCount(rankings: Record<number, number | null>): number {
  return Object.values(rankings).filter((r) => r !== null).length;
}

export function canContinue(
  rankings: Record<number, number | null>,
  ranksRequired: number,
): boolean {
  const ranks = Object.values(rankings).filter((r): r is number => r !== null);
  if (ranks.length !== ranksRequired) return false;
  const seen = new Set(ranks);
  return Array.from({ length: ranksRequired }, (_, i) => i + 1).every((r) => seen.has(r));
}

export function summaryList(
  rankings: Record<number, number | null>,
  offerings: Offering[],
  ranksRequired: number,
): { rank: number; name: string }[] {
  const nameById = new Map(offerings.map((o) => [o.semesterSubjectId, o.name]));
  return Array.from({ length: ranksRequired }, (_, i) => i + 1).map((rank) => {
    const entry = Object.entries(rankings).find(([, r]) => r === rank);
    return { rank, name: entry ? (nameById.get(Number(entry[0])) ?? '') : '' };
  });
}
