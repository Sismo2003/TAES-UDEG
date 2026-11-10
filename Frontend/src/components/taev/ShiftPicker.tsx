import { ChevronRight, Sun, Sunset } from 'lucide-react';
import { Navbar } from '../layout/Navbar';
import { Card } from '../ui/Card';

const SHIFTS = [
  { href: '/matutino', label: 'Turno matutino', icon: Sun },
  { href: '/vespertino', label: 'Turno vespertino', icon: Sunset },
] as const;

/**
 * Raíz del portal. Cada turno tiene su propio link (`/matutino`,
 * `/vespertino`) porque es un semestre independiente: padrón, oferta, cupos y
 * ventana separados. Lo normal es que el alumno llegue directo a su link; esta
 * pantalla sólo cubre a quien entra por la raíz.
 */
export function ShiftPicker() {
  return (
    <div className="min-h-screen flex flex-col bg-(--color-surface-muted)">
      <Navbar />
      <main className="flex-1 flex justify-center px-4 md:px-6 py-10 md:py-14">
        <div className="w-full max-w-md flex flex-col gap-4">
          <Card elevation="lg">
            <div className="text-lg font-heading font-semibold">Registro TAEV</div>
            <p className="text-sm text-(--color-ink-muted) mt-1 mb-5">
              Elige tu turno. Si te equivocas de turno, tu código no va a aparecer.
            </p>
            <div className="flex flex-col gap-3">
              {SHIFTS.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center gap-3 border border-(--color-border) px-4 py-3.5 text-(--color-ink) transition-colors hover:border-(--color-primary) hover:bg-(--color-surface-muted) focus-visible:outline-2 focus-visible:outline-(--color-primary)"
                >
                  <Icon size={20} className="text-(--color-primary)" strokeWidth={1.75} />
                  <span className="font-medium">{label}</span>
                  <ChevronRight size={18} className="ml-auto text-(--color-ink-muted)" />
                </a>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
