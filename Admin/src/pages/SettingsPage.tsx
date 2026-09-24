import { PageHeader, Card } from '../components/ui/PageHeader';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../stores/authStore';
import { useSemesterStore } from '../stores/semesterStore';

/**
 * Ajustes es hoy una pantalla de lectura: dice con qué sesión estás operando y
 * qué módulos faltan. Preferimos eso a inventar toggles que no hacen nada.
 */
const PENDING = [
  {
    name: 'Importar estudiantes por CSV',
    detail: 'Alta masiva desde el archivo de control escolar. El endpoint bulk ya existe.',
  },
  { name: 'Reportes', detail: 'Exportables por asignatura, grupo y alumno.' },
  { name: 'Usuarios', detail: 'Alta de administradores y viewers por escuela.' },
];

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const overview = useSemesterStore((s) => s.overview);

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Sesión actual y estado del panel." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">Sesión</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-(--color-ink-muted)">Usuario</dt>
            <dd>{user?.fullName ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Correo</dt>
            <dd className="break-all">{user?.email ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Rol</dt>
            <dd>
              <Badge tone={user?.role === 'viewer' ? 'neutral' : 'accent'}>{user?.role}</Badge>
            </dd>
            <dt className="text-(--color-ink-muted)">Alcance</dt>
            <dd>
              {user?.campusId == null ? 'Toda la red (superadmin global)' : `Campus #${user.campusId}`}
            </dd>
          </dl>
          <p className="text-xs text-(--color-ink-muted) mt-4">
            El rol y el campus se re-validan contra la base en cada request: cambiarlos en la BD
            surte efecto sin volver a iniciar sesión.
          </p>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">Semestre en contexto</h3>
          {overview ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-(--color-ink-muted)">Código</dt>
              <dd>
                {overview.semester.code} — {overview.semester.label}
              </dd>
              <dt className="text-(--color-ink-muted)">Activo</dt>
              <dd>{overview.semester.isCurrent ? 'Sí' : 'No'}</dd>
              <dt className="text-(--color-ink-muted)">Preferencias</dt>
              <dd className="tabular-nums">{overview.semester.ranksRequired}</dd>
              <dt className="text-(--color-ink-muted)">Ventana</dt>
              <dd>{overview.window.isOpen ? 'Abierta' : 'Cerrada'}</dd>
            </dl>
          ) : (
            <p className="text-sm text-(--color-ink-muted)">Sin semestre seleccionado.</p>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-1">Módulos pendientes</h3>
          <p className="text-xs text-(--color-ink-muted) mb-4">
            Aparecen apagados en el menú. El backend de varios ya existe.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PENDING.map((m) => (
              <li key={m.name} className="rounded-xl border border-(--color-border) p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.name}</span>
                  <Badge tone="neutral">pronto</Badge>
                </div>
                <p className="text-xs text-(--color-ink-muted) mt-1">{m.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
