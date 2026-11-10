import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://astro.build/config
//
// NOTA: este proyecto NO usa sitemap ni SSR — es una SPA renderizada
// por React en islas (client:load). Si en el futuro hace falta SSR,
// cambia `output: 'static'` por `output: 'server'` y añade el adapter
// correspondiente (@astrojs/node para Node, @astrojs/vercel, etc.).
export default defineConfig({
  output: 'static',
  // `/matutino` → dist/matutino.html (no matutino/index.html): el nginx del
  // contenedor lo resuelve con `$uri.html` sin redirigir a `/matutino/`.
  build: { format: 'file' },
  integrations: [react()],
  server: {
    port: 4321,
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
