import { create } from 'zustand';
import { toast } from 'sonner';
import {
  endpoints,
  errorMessage,
  type Overview,
  type SemesterRow,
  type WindowMode,
} from '../backend/connection';

const SELECTED_KEY = 'taev.admin.semester';

/**
 * Semestre en contexto. Es global porque TODAS las pantallas del panel operan
 * sobre uno (padrón, oferta, asignación): elegirlo en cada pantalla sería
 * pedirle al admin que repita la misma decisión cinco veces. Se persiste para
 * que un F5 no lo pierda.
 */
interface SemesterState {
  semesters: SemesterRow[];
  selectedId: number | null;
  overview: Overview | null;
  isLoading: boolean;
  isMutating: boolean;

  loadSemesters: (force?: boolean) => Promise<void>;
  select: (id: number) => Promise<void>;
  refreshOverview: () => Promise<void>;
  setWindow: (mode: WindowMode) => Promise<void>;
  setCurrent: (id: number) => Promise<void>;
  clearCurrent: (id: number) => Promise<void>;
  allocate: () => Promise<void>;
}

function readStoredId(): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = Number(localStorage.getItem(SELECTED_KEY));
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

export const useSemesterStore = create<SemesterState>((set, get) => ({
  semesters: [],
  selectedId: readStoredId(),
  overview: null,
  isLoading: false,
  isMutating: false,

  loadSemesters: async (force = false) => {
    if (!force && get().semesters.length > 0) return;
    set({ isLoading: true });
    try {
      const { data } = await endpoints.semesters_list();
      const stored = get().selectedId;
      const valid = stored != null && data.some((s) => s.id === stored);
      const next = valid ? stored : (data.find((s) => s.isCurrent) ?? data[0])?.id ?? null;
      set({ semesters: data, isLoading: false });
      if (next != null && next !== stored) await get().select(next);
      else if (next != null && get().overview == null) await get().refreshOverview();
    } catch (err) {
      set({ isLoading: false });
      toast.error(errorMessage(err));
    }
  },

  select: async (id) => {
    localStorage.setItem(SELECTED_KEY, String(id));
    set({ selectedId: id, overview: null });
    await get().refreshOverview();
  },

  refreshOverview: async () => {
    const id = get().selectedId;
    if (id == null) return;
    set({ isLoading: true });
    try {
      const { data } = await endpoints.semester_overview(id);
      set({ overview: data, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      toast.error(errorMessage(err));
    }
  },

  setWindow: async (mode) => {
    const id = get().selectedId;
    if (id == null) return;
    set({ isMutating: true });
    try {
      await endpoints.semester_window(id, mode);
      toast.success(
        mode === 'force_closed'
          ? 'Registro CERRADO (kill switch).'
          : mode === 'force_open'
            ? 'Registro abierto a la fuerza.'
            : 'Ventana en modo programado.',
      );
      await get().refreshOverview();
      await get().loadSemesters(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      set({ isMutating: false });
    }
  },

  setCurrent: async (id) => {
    set({ isMutating: true });
    try {
      await endpoints.semester_setCurrent(id);
      toast.success('Semestre marcado como activo del campus.');
      await get().loadSemesters(true);
      await get().select(id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      set({ isMutating: false });
    }
  },

  clearCurrent: async (id) => {
    set({ isMutating: true });
    try {
      await endpoints.semester_clearCurrent(id);
      toast.success('Plataforma cerrada: ningún semestre activo.');
      await get().loadSemesters(true);
      await get().refreshOverview();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      set({ isMutating: false });
    }
  },

  allocate: async () => {
    const id = get().selectedId;
    if (id == null) return;
    set({ isMutating: true });
    try {
      const { data } = await endpoints.semester_allocate(id);
      toast.success(`Asignación: ${data.placed} colocados, ${data.unplaced} sin lugar.`);
      await get().refreshOverview();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      set({ isMutating: false });
    }
  },
}));
