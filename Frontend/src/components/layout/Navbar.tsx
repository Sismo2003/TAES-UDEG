export function Navbar() {
  return (
    <nav className="flex flex-wrap items-center gap-3 px-4 py-3 bg-(--color-surface)/90 backdrop-blur-md border-b border-(--color-border)">
      <div className="flex items-center gap-3 flex-wrap">
        <img src="/images/udeg-logo.webp" alt="Universidad de Guadalajara" className="h-9 w-9 object-contain" />
        <div className="w-px h-6 bg-(--color-border)" />
        {/* TODO: swap for /images/prepa2-logo.png once the real asset is dropped in — see final report */}
        <span className="flex items-center justify-center h-8 w-8 rounded-sm bg-(--color-primary) text-white text-[10px] font-heading font-semibold">
          P2
        </span>
        <span className="ml-1 font-heading font-semibold text-lg text-(--color-ink)">Portal TAEV</span>
      </div>
      <span className="ml-auto text-xs text-(--color-ink-muted)">Preparatoria 2 · Universidad de Guadalajara</span>
    </nav>
  );
}
