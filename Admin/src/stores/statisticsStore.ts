import { create } from 'zustand';
import { endpoints, errorMessage, type Statistics } from '../backend/connection';

interface StatisticsState {
  data: Statistics | null;
  isLoading: boolean;
  errorMessage: string | null;
  fetch: (semesterId: number) => Promise<void>;
}

/** Sólo la respuesta más reciente escribe: cambiar de semestre no se cruza. */
let latestRequest = 0;

export const useStatisticsStore = create<StatisticsState>((set, get) => ({
  data: null,
  isLoading: false,
  errorMessage: null,

  fetch: async (semesterId) => {
    const request = ++latestRequest;
    // Los datos anteriores se conservan mientras se actualiza, salvo que sean de
    // otro ciclo: nunca se muestran cifras que no corresponden al selector.
    const sameCycle = get().data?.shifts.some((s) => s.semester.id === semesterId) ?? false;
    set({ isLoading: true, errorMessage: null, ...(sameCycle ? {} : { data: null }) });
    try {
      const { data } = await endpoints.semester_statistics(semesterId);
      if (request === latestRequest) set({ data, isLoading: false });
    } catch (err) {
      if (request === latestRequest) set({ errorMessage: errorMessage(err), isLoading: false });
    }
  },
}));
