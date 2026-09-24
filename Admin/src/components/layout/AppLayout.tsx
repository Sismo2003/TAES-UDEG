import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SemesterSwitcher } from './SemesterSwitcher';

const COLLAPSE_KEY = 'taev.admin.sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Shell del panel: sidebar fijo en escritorio, cajón deslizable en móvil.
 *
 * En escritorio el sidebar se puede ocultar con la hamburguesa de la barra
 * superior — el contenido toma todo el ancho que dejaba libre. La preferencia
 * se persiste para que sobreviva a un F5. En móvil el mismo botón abre el
 * cajón (el sidebar nunca ocupa espacio ahí).
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { pathname } = useLocation();

  // Navegar cierra el cajón: en móvil, si no, tapa la pantalla a la que fuiste.
  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* almacenamiento no disponible — la preferencia dura sólo la sesión */
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen flex bg-(--color-surface-muted)">
      {!collapsed && (
        <div className="hidden lg:block sticky top-0 h-screen">
          <Sidebar />
        </div>
      )}

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="h-full shadow-xl">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
          <div
            className="flex-1 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            role="presentation"
          />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-(--color-surface)/90 backdrop-blur border-b border-(--color-border)">
          <button
            className="lg:hidden inline-flex items-center justify-center size-9 rounded-lg border border-(--color-border)"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Menú"
          >
            {drawerOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <button
            className="hidden lg:inline-flex items-center justify-center size-9 rounded-lg border border-(--color-border) hover:bg-(--color-surface-muted) transition"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
            aria-pressed={collapsed}
            title={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>

          <span className={collapsed ? 'font-semibold text-sm' : 'lg:hidden font-semibold text-sm'}>
            TAEV · Panel
          </span>

          <div className="ml-auto">
            <SemesterSwitcher />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">{children}</main>
      </div>
    </div>
  );
}
