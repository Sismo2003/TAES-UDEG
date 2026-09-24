/**
 * connection.ts — cliente HTTP hacia el Backend (mismo patrón que Frontend).
 *
 * Un solo lugar define la superficie de la API: los componentes llaman a
 * `endpoints.*`, nunca a `api.get(...)` con una URL escrita a mano. El token
 * JWT se adjunta en un interceptor; vive en localStorage bajo `taev.admin.token`.
 */
import axios, { type AxiosError, type AxiosResponse } from 'axios';

const baseURL = import.meta.env.PUBLIC_API_URL || 'http://localhost:4000';

export const TOKEN_KEY = 'taev.admin.token';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export type ApiError = AxiosError<{ message?: string }> & {
  API_message: string;
  API_status: number | null;
};

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

// ── Tipos ───────────────────────────────────────────────────────────────────

export type Role = 'superadmin' | 'admin' | 'viewer';
export type WindowMode = 'scheduled' | 'force_open' | 'force_closed';
export type SubmissionStatus = 'pending' | 'allocated' | 'unplaced';

/** Forma única de todo listado paginado del panel. */
export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string | null;
  sort?: string | null;
  [key: string]: unknown;
}

/** Envíos: además de lo común, se filtran por estado y por dónde quedaron. */
export interface SubmissionQuery extends ListQuery {
  status?: SubmissionStatus;
  semesterSubjectId?: number;
  groupId?: number;
}

export interface AssignmentMutationResult {
  assignmentId: number;
  groupId: number;
}

export interface AdminUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
  campusId: number | null;
}

export interface Campus {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface SemesterRow {
  id: number;
  campusId: number;
  code: string;
  label: string;
  isCurrent: boolean;
  opensAt: string;
  closesAt: string;
  windowMode: WindowMode;
  ranksRequired: number;
  campus?: { id: number; code: string; name: string };
}

export interface StudentRow {
  id: number;
  code: string;
  fullName: string | null;
  email: string | null;
  career: string | null;
  studentSemesterLabel: string | null;
  isActive: boolean;
  createdAt: string;
  submission: { id: number; submittedAt: string; status: SubmissionStatus } | null;
}

export interface SubmissionPreferenceView {
  rank: number;
  /** Contra qué oferta se cruza para saber si esa preferencia estaba llena o inactiva. */
  semesterSubjectId: number;
  name: string;
}

export interface SubmissionAssignmentView {
  id: number;
  /** `null` ⇒ el admin lo colocó fuera de sus preferencias. */
  assignedRank: number | null;
  groupId: number;
  groupLabel: string;
  semesterSubjectId: number;
  subjectName: string;
}

export interface SubmissionRow {
  id: number;
  code: string;
  fullName: string | null;
  submittedAt: string;
  status: SubmissionStatus;
  preferences: SubmissionPreferenceView[];
  assignment: SubmissionAssignmentView | null;
}

export interface SubjectRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count: { offerings: number };
}

export interface GroupRow {
  id: number;
  label: string;
  capacity: number;
  assignedCount: number;
  displayOrder: number;
  isActive: boolean;
}

export interface OfferingRow {
  id: number;
  subjectId: number;
  displayOrder: number;
  isActive: boolean;
  subject: { id: number; code: string; name: string; description: string | null };
  groups: GroupRow[];
}

export interface AuditRow {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { id: number; fullName: string; email: string } | null;
}

export type WindowReason =
  | 'NO_ACTIVE_SEMESTER'
  | 'FORCED_CLOSED'
  | 'FORCED_OPEN'
  | 'OPEN_SCHEDULED'
  | 'NOT_YET_OPEN'
  | 'CLOSED_SCHEDULED';

export interface WindowState {
  mode?: WindowMode;
  isOpen: boolean;
  reason: WindowReason;
  opensAt: string | null;
  closesAt: string | null;
  serverTime: string;
}

export interface Overview {
  semester: {
    id: number;
    code: string;
    label: string;
    isCurrent: boolean;
    ranksRequired: number;
    windowMode: WindowMode;
  };
  window: WindowState;
  counts: {
    students: number;
    submissions: number;
    pending: number;
    allocated: number;
    unplaced: number;
  };
  offerings: {
    semesterSubjectId: number;
    name: string;
    isActive: boolean;
    capacity: number;
    assigned: number;
    groups: GroupRow[];
  }[];
}

export interface SemesterInput {
  campusId?: number;
  code: string;
  label: string;
  opensAt: string;
  closesAt?: string;
  durationMinutes?: number;
  ranksRequired?: number;
  notes?: string | null;
}

export interface StudentInput {
  code?: string;
  fullName?: string | null;
  email?: string | null;
  career?: string | null;
  studentSemesterLabel?: string | null;
  isActive?: boolean;
}

// ── Endpoints ───────────────────────────────────────────────────────────────

const ADMIN = '/api/admin';

export const endpoints = {
  health: () => request<{ status: string } | true>(api.get('/health')),

  // Auth
  auth_login: (email: string, password: string) =>
    request<{ token: string; user: AdminUser }>(api.post(`${ADMIN}/auth/login`, { email, password })),
  auth_me: () => request<AdminUser>(api.get(`${ADMIN}/auth/me`)),

  // Campus
  campuses_list: () => request<Campus[]>(api.get(`${ADMIN}/campuses`)),

  // Semestres
  semesters_list: () => request<SemesterRow[]>(api.get(`${ADMIN}/semesters`)),
  semester_get: (id: number) => request<SemesterRow>(api.get(`${ADMIN}/semesters/${id}`)),
  semester_create: (body: SemesterInput) =>
    request<SemesterRow>(api.post(`${ADMIN}/semesters`, body)),
  semester_update: (id: number, body: Partial<SemesterInput>) =>
    request<SemesterRow>(api.patch(`${ADMIN}/semesters/${id}`, body)),
  semester_window: (id: number, windowMode: WindowMode) =>
    request<SemesterRow & { window: WindowState }>(
      api.patch(`${ADMIN}/semesters/${id}/window`, { windowMode }),
    ),
  semester_setCurrent: (id: number) =>
    request<SemesterRow>(api.patch(`${ADMIN}/semesters/${id}/current`, {})),
  semester_clearCurrent: (id: number) =>
    request<SemesterRow>(api.delete(`${ADMIN}/semesters/${id}/current`)),
  semester_overview: (id: number) => request<Overview>(api.get(`${ADMIN}/semesters/${id}/overview`)),
  semester_allocate: (id: number) =>
    request<{ placed: number; unplaced: number }>(api.post(`${ADMIN}/semesters/${id}/allocate`, {})),

  // Padrón
  students_list: (semesterId: number, params: ListQuery) =>
    request<Paginated<StudentRow>>(api.get(`${ADMIN}/semesters/${semesterId}/students`, { params })),
  student_create: (semesterId: number, body: StudentInput) =>
    request<StudentRow>(api.post(`${ADMIN}/semesters/${semesterId}/students`, body)),
  student_update: (semesterId: number, studentId: number, body: StudentInput) =>
    request<StudentRow>(api.patch(`${ADMIN}/semesters/${semesterId}/students/${studentId}`, body)),
  student_delete: (semesterId: number, studentId: number) =>
    request<{ id: number; softDelete: boolean }>(
      api.delete(`${ADMIN}/semesters/${semesterId}/students/${studentId}`),
    ),
  students_bulk: (semesterId: number, students: StudentInput[]) =>
    request<{ total: number; created: number; updated: number }>(
      api.post(`${ADMIN}/semesters/${semesterId}/students/bulk`, { students }),
    ),

  // Envíos
  submissions_list: (semesterId: number, params: SubmissionQuery) =>
    request<Paginated<SubmissionRow>>(
      api.get(`${ADMIN}/semesters/${semesterId}/submissions`, { params }),
    ),

  // Asignaciones — mismo advisory lock que el allocator; el cupo lo arbitra la BD.
  /** Mueve a un alumno YA asignado a otro grupo del mismo semestre. */
  assignment_move: (assignmentId: number, body: { groupId: number; notes: string }) =>
    request<AssignmentMutationResult>(api.patch(`${ADMIN}/assignments/${assignmentId}`, body)),
  /** Coloca a mano a un alumno que no tiene grupo (típicamente `unplaced`). */
  assignment_place: (
    semesterId: number,
    body: { submissionId: number; groupId: number; notes: string },
  ) =>
    request<AssignmentMutationResult>(
      api.post(`${ADMIN}/semesters/${semesterId}/assignments`, body),
    ),

  // Catálogo de asignaturas
  subjects_list: (params: ListQuery) =>
    request<Paginated<SubjectRow>>(api.get(`${ADMIN}/subjects`, { params })),
  subject_options: () =>
    request<{ id: number; code: string; name: string }[]>(api.get(`${ADMIN}/subjects/options`)),
  subject_create: (body: { code: string; name: string; description?: string | null }) =>
    request<SubjectRow>(api.post(`${ADMIN}/subjects`, body)),
  subject_update: (
    id: number,
    body: { name?: string; description?: string | null; isActive?: boolean },
  ) => request<SubjectRow>(api.patch(`${ADMIN}/subjects/${id}`, body)),

  // Oferta y grupos
  offerings_list: (semesterId: number) =>
    request<OfferingRow[]>(api.get(`${ADMIN}/semesters/${semesterId}/subjects`)),
  offering_add: (
    semesterId: number,
    body: { subjectId?: number; code?: string; name?: string; displayOrder?: number },
  ) => request<OfferingRow>(api.post(`${ADMIN}/semesters/${semesterId}/subjects`, body)),
  offering_update: (
    semesterId: number,
    offeringId: number,
    body: { displayOrder?: number; isActive?: boolean },
  ) => request<OfferingRow>(api.patch(`${ADMIN}/semesters/${semesterId}/subjects/${offeringId}`, body)),
  group_create: (
    semesterId: number,
    body: { semesterSubjectId: number; label: string; capacity: number; displayOrder?: number },
  ) => request<GroupRow>(api.post(`${ADMIN}/semesters/${semesterId}/groups`, body)),
  group_update: (
    semesterId: number,
    groupId: number,
    body: { label?: string; capacity?: number; displayOrder?: number; isActive?: boolean },
  ) => request<GroupRow>(api.patch(`${ADMIN}/semesters/${semesterId}/groups/${groupId}`, body)),

  // Bitácora
  auditLog: (params: ListQuery) =>
    request<Paginated<AuditRow>>(api.get(`${ADMIN}/audit-log`, { params })),
};

// ── Mensajes de error legibles ──────────────────────────────────────────────
//
// La API devuelve sentencias UPPER_SNAKE_CASE machine-readable
// (Docs/HANDOFF.md §4). El panel las traduce en UN solo lugar.

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  RATE_LIMITED: 'Demasiados intentos. Espera unos minutos.',
  UNAUTHENTICATED: 'Tu sesión expiró. Vuelve a entrar.',
  FORBIDDEN: 'Tu rol no permite esta acción.',
  CAMPUS_FORBIDDEN: 'Ese recurso pertenece a otra escuela.',
  SEMESTER_NOT_FOUND: 'El semestre no existe.',
  SEMESTER_CODE_TAKEN: 'Ya existe un semestre con ese código en esta escuela.',
  SEMESTER_NOT_CURRENT: 'Ese semestre no es el activo.',
  CLOSES_BEFORE_OPENS: 'El cierre debe ser posterior a la apertura.',
  INVALID_DATE: 'La fecha no es válida.',
  INVALID_DURATION: 'La duración debe ser un número de minutos positivo.',
  INVALID_RANKS_REQUIRED: 'Las preferencias a ordenar deben ser entre 1 y 10.',
  MISSING_FIELDS: 'Faltan campos obligatorios.',
  NOTHING_TO_UPDATE: 'No hay cambios que guardar.',
  INVALID_CODE_FORMAT: 'El código debe ser de 9 dígitos.',
  INVALID_CODE_IN_BATCH: 'Hay un código inválido en el archivo.',
  DUPLICATE_CODE_IN_BATCH: 'Hay códigos repetidos en el archivo.',
  CODE_ALREADY_IN_ROSTER: 'Ese código ya está en la lista de estudiantes de este semestre.',
  STUDENT_NOT_FOUND: 'El alumno no existe en este semestre.',
  STUDENT_HAS_SUBMISSION: 'No se puede cambiar el código: el alumno ya envió su formulario.',
  SUBJECT_CODE_TAKEN: 'Ya existe una asignatura con ese código.',
  SUBJECT_NOT_FOUND: 'La asignatura no existe.',
  SUBJECT_ALREADY_OFFERED: 'Esa asignatura ya está en la oferta del semestre.',
  OFFERING_NOT_FOUND: 'La oferta no existe en este semestre.',
  GROUP_LABEL_TAKEN: 'Ya existe un grupo con esa etiqueta en la asignatura.',
  GROUP_NOT_FOUND: 'El grupo no existe.',
  GROUP_FULL: 'El grupo ya está lleno.',
  GROUP_INACTIVE: 'El grupo o su asignatura están inactivos.',
  GROUP_OTHER_SEMESTER: 'Ese grupo pertenece a otro semestre.',
  SUBMISSION_NOT_FOUND: 'No se encontró el envío de ese alumno.',
  ASSIGNMENT_NOT_FOUND: 'No se encontró la asignación a mover.',
  ALREADY_ASSIGNED: 'Ese alumno ya tiene grupo. Usá "Mover" en lugar de "Colocar".',
  NOTE_REQUIRED: 'La nota es obligatoria: es el registro del motivo del movimiento.',
  CAPACITY_BELOW_ASSIGNED: 'El cupo no puede quedar por debajo de los alumnos ya asignados.',
  INVALID_CAPACITY: 'El cupo debe ser un entero positivo.',
  NETWORK_ERROR: 'No se pudo contactar al servidor.',
  INTERNAL_ERROR: 'Error interno del servidor.',
};

export function errorMessage(err: unknown): string {
  const code = (err as ApiError)?.API_message ?? '';
  return MESSAGES[code] ?? code ?? 'Ocurrió un error.';
}
