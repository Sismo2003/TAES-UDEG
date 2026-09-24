# stores

Stores Zustand, uno por dominio. Convención de forma:

```ts
import { create } from 'zustand';

interface MiState {
  data: Tipo[];
  isLoading: boolean;
  errorMessage: string | null;
  fetch: () => Promise<void>;
}

export const useMiStore = create<MiState>((set) => ({
  data: [],
  isLoading: false,
  errorMessage: null,
  fetch: async () => {
    set({ isLoading: true, errorMessage: null });
    try {
      // llamada al cliente API (src/backend/)
      const res = await endpoints.mi_recurso();
      set({ data: res, isLoading: false });
    } catch (err) {
      set({ errorMessage: err.API_message, isLoading: false });
    }
  },
}));
```

No usar Redux. No usar Context para estado global.
