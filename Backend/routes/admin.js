/**
 * routes/admin.js — panel interno. JWT en todos salvo el login.
 *
 * El alcance por campus NO se hace por middleware de ruta (cada recurso
 * resuelve su campus por relación): lo aplican los services con
 * `assertCampusAccess` / `scopeCampusId`.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me } from '../controllers/adminAuth.controller.js';
import * as c from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ data: false, message: 'RATE_LIMITED' }),
});

// ── Auth ────────────────────────────────────────────────────────────────────
router.post('/auth/login', loginLimiter, login);
router.get('/auth/me', requireAuth, me);

// A partir de acá, todo exige sesión.
router.use(requireAuth);

const writer = requireRole('superadmin', 'admin');

// ── Campuses ────────────────────────────────────────────────────────────────
router.get('/campuses', c.listCampuses);

// ── Catálogo de asignaturas (compartido por toda la red) ────────────────────
router.get('/subjects', c.listSubjects);
router.get('/subjects/options', c.listSubjectOptions);
router.post('/subjects', writer, c.createSubject);
router.patch('/subjects/:id', writer, c.updateSubject);

// ── Semesters ───────────────────────────────────────────────────────────────
router.get('/semesters', c.listSemesters);
router.post('/semesters', writer, c.createSemester);
router.get('/semesters/:id', c.getSemester);
router.patch('/semesters/:id', writer, c.updateSemester);
router.patch('/semesters/:id/window', writer, c.changeWindow);
router.patch('/semesters/:id/current', writer, c.setCurrent);
router.delete('/semesters/:id/current', writer, c.clearCurrent);
router.get('/semesters/:id/overview', c.overview);

// ── Padrón ──────────────────────────────────────────────────────────────────
router.get('/semesters/:id/students', c.listStudents);
router.post('/semesters/:id/students', writer, c.createStudent);
router.post('/semesters/:id/students/bulk', writer, c.bulkStudents);
router.patch('/semesters/:id/students/:studentId', writer, c.updateStudent);
router.delete('/semesters/:id/students/:studentId', writer, c.deleteStudent);

// ── Envíos ──────────────────────────────────────────────────────────────────
router.get('/semesters/:id/submissions', c.listSubmissions);

// ── Oferta y grupos ─────────────────────────────────────────────────────────
router.get('/semesters/:id/subjects', c.listOfferings);
router.post('/semesters/:id/subjects', writer, c.addOffering);
router.patch('/semesters/:id/subjects/:offeringId', writer, c.updateOffering);
router.post('/semesters/:id/groups', writer, c.createGroup);
router.patch('/semesters/:id/groups/:groupId', writer, c.updateGroup);

// ── Asignación ──────────────────────────────────────────────────────────────
router.post('/semesters/:id/allocate', writer, c.allocate);
router.post('/semesters/:id/assignments', writer, c.placeSubmission);
router.patch('/assignments/:id', writer, c.overrideAssignment);

// ── Bitácora ────────────────────────────────────────────────────────────────
router.get('/audit-log', c.auditLog);

export default router;
