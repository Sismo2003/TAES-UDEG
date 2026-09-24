import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { inputClass, labelClass } from '../components/ui/formStyles';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const errorMessage = useAuthStore((s) => s.errorMessage);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen grid place-items-center bg-(--color-surface-muted) p-4">
      <form
        className="w-full max-w-sm rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void login(email.trim(), password);
        }}
      >
        <h1 className="text-xl font-bold tracking-tight">TAEV · Panel</h1>
        <p className="text-sm text-(--color-ink-muted) mt-1 mb-6">Acceso interno.</p>

        <div className="mb-4">
          <label className={labelClass} htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </div>

        {errorMessage && <p className="text-sm text-(--color-danger) mt-4">{errorMessage}</p>}

        <Button type="submit" fullWidth className="mt-6" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  );
}
