import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { cn } from '../../lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Módulo planeado pero no implementado: se ve, no se entra. */
  disabled?: boolean;
}

/**
 * El sidebar muestra el mapa COMPLETO del panel, incluidos los módulos que
 * todavía no existen. Un menú que crece de a poco esconde hacia dónde va la
 * herramienta; uno completo con ítems apagados dice "esto viene" sin mentir
 * que ya funciona.
 */
const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Operación',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/semestres', label: 'Semestres', icon: CalendarRange },
      { to: '/padron', label: 'Estudiantes', icon: Users },
      { to: '/asignaturas', label: 'Asignaturas', icon: BookOpen },
      { to: '/oferta', label: 'Oferta y grupos', icon: Layers },
    ],
  },
  {
    section: 'Resultados',
    items: [
      { to: '/envios', label: 'Envíos', icon: Inbox },
      { to: '/asignaciones', label: 'Asignaciones', icon: ClipboardCheck },
      { to: '/reportes', label: 'Reportes', icon: BarChart3, disabled: true },
      { to: '/bitacora', label: 'Bitácora', icon: ScrollText },
    ],
  },
  {
    section: 'Administración',
    items: [
      { to: '/usuarios', label: 'Usuarios', icon: ShieldCheck, disabled: true },
      { to: '/ajustes', label: 'Ajustes', icon: Settings },
    ],
  },
];

const itemBase =
  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition w-full text-left';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="w-64 shrink-0 bg-(--color-surface) border-r border-(--color-border) flex flex-col h-full">
      <div className="px-4 py-5 border-b border-(--color-border)">
        <h1 className="text-base font-bold tracking-tight">TAEV · Panel</h1>
        {user && (
          <p className="text-xs text-(--color-ink-muted) mt-1 truncate" title={user.email}>
            {user.fullName} · {user.role}
          </p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-(--color-ink-subtle)">
              {section}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map(({ to, label, icon: Icon, disabled }) =>
                disabled ? (
                  <span
                    key={to}
                    aria-disabled="true"
                    title="Módulo pendiente"
                    className={cn(itemBase, 'text-(--color-ink-subtle) cursor-not-allowed')}
                  >
                    <Icon size={16} />
                    <span className="flex-1">{label}</span>
                    <span className="text-[10px] rounded-full bg-(--color-surface-sunken) px-1.5 py-0.5">
                      pronto
                    </span>
                  </span>
                ) : (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        itemBase,
                        isActive
                          ? 'bg-(--color-primary) text-white font-medium'
                          : 'text-(--color-ink-muted) hover:bg-(--color-surface-muted) hover:text-(--color-ink)',
                      )
                    }
                  >
                    <Icon size={16} />
                    {label}
                  </NavLink>
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <button
        className={cn(itemBase, 'm-3 mt-0 w-auto text-(--color-ink-muted) hover:bg-(--color-surface-muted)')}
        onClick={logout}
      >
        <LogOut size={16} />
        Salir
      </button>
    </aside>
  );
}
