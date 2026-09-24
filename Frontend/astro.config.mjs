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
