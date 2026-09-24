# Admin — TAEV-UDEG-PREPA2

Panel de administración. Proyecto Astro independiente del Frontend público.

## Stack

- **Astro 5** con output `static`, una sola página que monta una SPA
- **React 19** vía `@astrojs/react` con directiva `client:only="react"`
- **react-router-dom 7** para navegación interna (rutas anidadas dentro del Admin)
- **Tailwind CSS v4** (mismo setup que el Frontend)
- **Zustand** para estado global
- **react-hook-form + Yup** para formularios
- **lucide-react**, **sonner**, **axios**

## Estructura

```
Admin/
├── astro.config.mjs          # port 4322, integración react
├── src/
│   ├── App.tsx                # SPA: BrowserRouter + Routes + Sidebar
│   ├── layouts/                # Layout.astro (solo monta <App client:only />)
│   ├── pages/
│   │   └── index.astro          # única página Astro → monta <App />
│   ├── pages/                   # páginas internas (componentes React)
│   │   ├── DashboardPage.tsx
│   │   ├── UsersPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── components/
│   │   ├── layout/              # Sidebar, Topbar, etc.
│   │   ├── sections/
│   │   ├── ui/                    # primitivos (Button, Modal, Table)
│   │   └── forms/                  # formularios de admin
│   ├── backend/                  # cliente HTTP hacia la API (mismo patrón que Frontend)
│   ├── stores/                    # Zustand: uno por dominio (authStore, usersStore, etc.)
│   ├── hooks/                      # useAuth, useDebounce, etc.
│   ├── lib/                          # utils puros
│   └── styles/                         # global.css
```

## Patrón SPA sobre Astro

Astro solo monta el shell (`index.astro` → `<App client:only="react" />`).
**Toda la navegación interna del Admin ocurre en React** vía `react-router-dom`.
Esto evita tener N páginas `.astro` por cada vista y permite code-splitting por ruta.

```astro
---
// src/pages/index.astro
import Layout from '../layouts/Layout.astro';
import App from '../App';
---
<Layout>
  <App client:only="react" />
</Layout>
```

## Setup local

```bash
npm install
cp .env.example .env

# El Backend debe estar corriendo en http://localhost:4000
npm run dev
```

El Admin arranca en `http://localhost:4322`.

## Auth

Cuando se implemente autenticación, este proyecto será donde viva el login
del Admin (formulario + `authStore`). El Frontend público **no** consume auth.

## Reglas del proyecto

Las mismas que el Frontend — lee `.agents/skills/frontend/SKILL.md` y
`.agents/skills/ui/SKILL.md`.
