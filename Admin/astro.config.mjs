import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://astro.build/config
//
// El Admin es una SPA montada como isla: una sola página Astro (`/admin/index.astro`)
// que monta `<App client:only="react" />` y todo el ruteo interno lo hace
// react-router. Esto evita tener N páginas Astro por cada vista del panel
// y mantiene un bundle coherente para code-splitting por ruta.
export default defineConfig({
  output: 'static',
  integrations: [react()],
  server: {
    port: 4322,
    host: true,
  },
  vite: {
    envPrefix: ['VITE_', 'PUBLIC_'],
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        backend: path.resolve(process.cwd(), 'src/backend'),
      },
    },
  },
});
