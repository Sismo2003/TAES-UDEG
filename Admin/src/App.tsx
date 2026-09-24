import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { SemestersPage } from './pages/SemestersPage';
import { StudentsPage } from './pages/StudentsPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { OfferingsPage } from './pages/OfferingsPage';
import { SubmissionsPage } from './pages/SubmissionsPage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './pages/LoginPage';
import { useAuthStore } from './stores/authStore';

/**
 * App.tsx — entry point del Admin (SPA con react-router). Astro sólo monta
 * este componente como `client:only="react"`.
 *
 * Guard de sesión: sin JWT válido no se renderiza nada del panel; sólo el login.
 * Las rutas de los módulos pendientes NO se registran a propósito — el sidebar
 * las muestra apagadas, y entrar por URL cae en el 404.
 */
export default function App() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center text-(--color-ink-muted)">Cargando…</div>
    );
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      {status === 'anon' ? (
        <LoginPage />
      ) : (
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/semestres" element={<SemestersPage />} />
              <Route path="/padron" element={<StudentsPage />} />
              <Route path="/asignaturas" element={<SubjectsPage />} />
              <Route path="/oferta" element={<OfferingsPage />} />
              <Route path="/envios" element={<SubmissionsPage />} />
              <Route path="/asignaciones" element={<AssignmentsPage />} />
              <Route path="/bitacora" element={<AuditPage />} />
              <Route path="/ajustes" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      )}
    </>
  );
}
