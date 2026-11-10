/**
 * connection.ts — cliente HTTP hacia el Backend.
 *
 * Centraliza la base URL y los headers por defecto. Cada endpoint nuevo
 * se exporta como una función tipada acá, no se llama `axios` directamente
 * desde componentes o stores.
 */
import axios, { type AxiosError, type AxiosResponse } from 'axios';

const baseURL = import.meta.env.PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Envelope del proyecto. En éxito `data` es el payload; en fallo el Backend
 * devuelve `data: false` y `message` en UPPER_SNAKE_CASE que el Frontend
 * ramifica (no se muestra literal).
 */
export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

/** Error de axios enriquecido con el `message` machine-readable del Backend. */
export type ApiError = AxiosError<{ message?: string }> & {
  API_message: string;
  API_status: number | null;
};

/**
 * Envuelve una promesa de axios: en fallo adjunta `API_message` (la sentencia
 * del Backend) y `API_status` para ramificar en los stores.
 */
export async function request<T>(
  promise: Promise<AxiosResponse<ApiEnvelope<T>>>,
): Promise<ApiEnvelope<T>> {
  try {
    const res = await promise;
    return res.data;
  } catch (err) {
    const axErr = err as ApiError;
    axErr.API_message = axErr.response?.data?.message ?? axErr.message ?? 'NETWORK_ERROR';
    axErr.API_status = axErr.response?.status ?? null;
    throw axErr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos del portal público — reflejan los contratos de Docs/HANDOFF.md §4
// ─────────────────────────────────────────────────────────────────────────────

/** Turno: cada uno es un semestre independiente con su propio link. */
export type Shift = 'matutino' | 'vespertino';

export const SHIFT_LABEL: Record<Shift, string> = {
  matutino: 'Matutino',
  vespertino: 'Vespertino',
};

export interface Offering {
  semesterSubjectId: number;
  name: string;
  displayOrder: number;
}

export interface WindowState {
  isOpen: boolean;
  reason:
    | 'NO_ACTIVE_SEMESTER'
    | 'FORCED_CLOSED'
    | 'FORCED_OPEN'
    | 'OPEN_SCHEDULED'
    | 'NOT_YET_OPEN'
    | 'CLOSED_SCHEDULED';
  opensAt: string | null;
  closesAt: string | null;
  serverTime: string;
  opensInMs: number | null;
  closesInMs: number | null;
}

export interface TaevStatus {
  campus: { code: string; name: string };
  shift: Shift | null;
  semester: { code: string; label: string; shift: Shift; ranksRequired: number } | null;
  window: WindowState;
  offerings: Offering[];
}

export interface VerifyCodeResult {
  studentName: string | null;
  semesterLabel: string;
  shift: Shift;
  ranksRequired: number;
  offerings: Offering[];
}

export interface SubmitResult {
  semesterLabel: string;
  submittedAt: string;
  preferences: { rank: number; name: string }[];
}

export interface PreferenceInput {
  semesterSubjectId: number;
  rank: number;
}

export const endpoints = {
  health: () => request<{ status: string; env: string } | true>(api.get('/health')),

  taev_status: (campus: string, shift: Shift) =>
    request<TaevStatus>(api.get('/api/taev/status', { params: { campus, shift } })),

  taev_verifyCode: (code: string, campus: string, shift: Shift) =>
    request<VerifyCodeResult>(api.post('/api/taev/verify-code', { code, campus, shift })),

  taev_submit: (code: string, preferences: PreferenceInput[], campus: string, shift: Shift) =>
    request<SubmitResult>(api.post('/api/taev/submit', { code, campus, shift, preferences })),
};
