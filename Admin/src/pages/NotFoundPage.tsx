import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="text-center py-16">
      <h2 className="text-2xl font-bold mb-2">404</h2>
      <p className="text-(--color-ink-muted) mb-4">Esta ruta no existe.</p>
      <Link to="/" className="text-(--color-primary) hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
