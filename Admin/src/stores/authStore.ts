import { create } from 'zustand';
import { endpoints, errorMessage, TOKEN_KEY, type AdminUser } from '../backend/connection';

interface AuthState {
  user: AdminUser | null;
  status: 'loading' | 'anon' | 'authed';
  errorMessage: string | null;
  isSubmitting: boolean;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

/** `viewer` sólo lee: el panel esconde toda acción de escritura para ese rol. */
export function canWrite(user: AdminUser | null): boolean {
  return user?.role === 'superadmin' || user?.role === 'admin';
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  errorMessage: null,
  isSubmitting: false,

  bootstrap: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ status: 'anon' });
      return;
    }
    try {
      const { data } = await endpoints.auth_me();
      set({ user: data, status: 'authed' });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ status: 'anon' });
    }
  },

  login: async (email, password) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const { data } = await endpoints.auth_login(email, password);
      localStorage.setItem(TOKEN_KEY, data.token);
      set({ user: data.user, status: 'authed', isSubmitting: false });
    } catch (err) {
      set({ isSubmitting: false, errorMessage: errorMessage(err) });
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null, status: 'anon' });
  },
}));
