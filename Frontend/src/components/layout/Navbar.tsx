/** Sitios oficiales a los que llevan los logos (pestaña nueva: el alumno no pierde su registro). */
const UDG_URL = 'https://www.udg.mx/';
const PREPA2_URL = 'https://prepa2.sems.udg.mx/inicio';

export function Navbar() {
  return (
    <nav className="flex flex-wrap items-center gap-3 px-4 py-3 bg-(--color-surface)/90 backdrop-blur-md border-b border-(--color-border)">
      <div className="flex items-center gap-3 flex-wrap">
        <a
          href={UDG_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Universidad de Guadalajara — sitio oficial"
          className="shrink-0 rounded-sm transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)"
        >
          <img src="/images/udeg-logo.webp" alt="Universidad de Guadalajara" className="h-9 w-9 object-contain" />
        </a>
        <div className="w-px h-6 bg-(--color-border)" />
        <a
          href={PREPA2_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Preparatoria No. 2 — sitio oficial"
          className="shrink-0 rounded-full transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)"
        >
          <img src="/images/prepa2-logo.png" alt="Preparatoria No. 2 UdeG" width={40} height={40} className="h-10 w-10 object-contain" />
        </a>
        <span className="ml-1 font-heading font-semibold text-lg text-(--color-ink)">Portal TAEV</span>
      </div>
      <span className="ml-auto text-xs text-(--color-ink-muted)">Preparatoria 2 · Universidad de Guadalajara</span>
    </nav>
  );
}
