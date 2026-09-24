---
name: frontend
description: Convenciones para el frontend público (Frontend/) y el admin (Admin/) — Astro + React + TypeScript + Tailwind v4 + Zustand. Usar al leer o editar cualquier archivo bajo Frontend/src/ o Admin/src/ — páginas, stores, componentes, hooks, API client.
---

# Frontend — TAEV-UDEG-PREPA2

Astro 5 como framework, React 19 como capa de islas interactivas. TypeScript
estricto, Tailwind CSS v4 (CSS-first, sin `tailwind.config.js`), Zustand para
estado global, react-hook-form + Yup para forms validados, sonner para toasts,
lucide-react para íconos, framer-motion para animación.

## Diferencia clave Frontend vs Admin

- **Frontend/**: sitio público. Cada ruta es una página Astro. Las islas React
  se montan con `client:load` o `client:visible` cuando hace falta
  interactividad. **No usa** react-router (Astro maneja routing).
- **Admin/**: panel interno. **Una sola página Astro** (`src/pages/index.astro`)
  que monta `<App client:only="react" />` y **toda la navegación interna ocurre
  vía react-router-dom**. Esto evita tener N páginas Astro y permite
  code-splitting por ruta interna.

Ambos comparten convenciones de componentes, stores, API client, forms y motion
— salvo donde se indique lo contrario.

## Layout

```
Frontend/src/
├── components/
│   ├── layout/         # Navbar, Footer (compartidos entre páginas Astro)
│   ├── sections/        # bloques de página (Hero, About, Services...)
│   ├── ui/                # primitivos (Button, Modal, Badge, Input)
│   └── forms/              # formularios autocontenidos (ContactForm, etc.)
├── layouts/              # Layout.astro y variantes (envuelve <head> y <body>)
├── pages/                # cada .astro = una ruta
├── backend/                # axios API client: connection.ts, endpoints
├── stores/                  # Zustand: uno por dominio
├── hooks/                    # useLanguage, useMediaQuery, useDebounce
├── i18n/                      # (opcional) es.ts / en.ts
├── data/                       # configs estáticas (contact.config.json...)
├── lib/                          # utils puros (cn, formatDate, etc.)
└── styles/                         # global.css con tokens de Tailwind v4
```

```
Admin/src/   (mismo patrón, con la diferencia del SPA único)
├── App.tsx                # BrowserRouter + Routes + Sidebar
├── pages/index.astro        # única página Astro que monta <App client:only />
├── pages/                   # páginas internas (componentes .tsx)
├── components/{layout,sections,ui,forms}/
├── backend/                  # mismo cliente HTTP que Frontend
├── stores/, hooks/, lib/, styles/
```

## State — Zustand, no Redux ni Context

`create()` directo, **un store por dominio en un solo archivo**:

```ts
// stores/usersStore.ts
import { create } from 'zustand';
import { endpoints } from '@/backend/connection';

interface UsersState {
  users: User[];
  isLoading: false;
  errorMessage: null | string;
  fetch: () => Promise<void>;
}

export const useUsersStore = create<UsersState>((set) => ({
  users: [],
  isLoading: false,
  errorMessage: null,
  fetch: async () => {
    set({ isLoading: true, errorMessage: null });
    try {
      const res = await endpoints.users_list();
      set({ users: res.data, isLoading: false });
    } catch (err) {
      set({ errorMessage: err.API_message, isLoading: false });
    }
  },
}));
```

Store shape convention: campos de datos + booleans por concern async
(`isLoading`, `isSubmitting`) + `errorMessage` + acciones que llaman al
cliente API y hacen `set(...)` optimista/éxito o `toast.error(...)` en
fallo. **No** Context, **no** Redux.

## Cliente API (`backend/`)

`connection.ts` exporta funciones tipadas por endpoint (`endpoints.users_list()`,
etc.) sobre `axios.create({ baseURL, withCredentials: true })`. **No llamar
`axios` directamente desde componentes o stores** — siempre pasar por
`endpoints.*`.

Helper `request(promise)` envuelve la promesa para que los errores traigan
`err.API_message` listo para `toast.error` o mostrar inline. Usar este campo,
no derivar mensaje de `err.message`.

Cuando se implemente auth: agregar interceptor que adjunte el token y refresh
logic acá. **Un solo lugar**, no en cada componente.

## Routing

- **Frontend**: `src/pages/*.astro` = rutas. No se usa react-router.
- **Admin**: dentro de `src/App.tsx`, `react-router-dom` con `BrowserRouter`
  + `Routes` + `Route`. Las rutas internas son `DashboardPage`, `UsersPage`,
  etc.
- **Admin — fallback SPA**: `src/pages/404.astro` monta el mismo shell que
  `index.astro` (`<Layout><App client:only="react" /></Layout>`). Sin él, un
  refresh o el full-reload del HMR sobre una ruta profunda (`/semestres`) pide
  esa URL al servidor de Astro, que no la conoce y sirve su 404 sin montar el
  SPA. Con `404.astro`, `astro dev` sirve ese archivo para toda ruta no
  resuelta → el SPA arranca y react-router pinta la vista. **No borrar.**

## Styling

Tailwind CSS v4 (`@import "tailwindcss"` en `global.css`, sin
`tailwind.config.js`). CSS-first: tokens via `@theme {}`, no en JS.
No CSS modules, no styled-components, no `.css` por componente. Inline
`style={}` solo para valores que Tailwind no expresa limpio (gradientes con
stops dinámicos, etc.).

## Forms

Dos patrones aceptados según complejidad — ver skill `ui` §6 para el detalle:
- `useState` por campo para forms simples, sin validación real.
- `react-hook-form` + `Yup` (`@hookform/resolvers/yup`) para forms con
  validación (required, min-length, formato email, etc.).

Ambos canales de submit van por una **acción del store**, no por un `fetch`
directo en el componente.

## i18n (opcional)

Si el sitio se hace bilingüe, los strings van en `i18n/es.ts` e `i18n/en.ts`
con la misma forma exacta. Componentes consumen `t` (el objeto del idioma
activo) pasado como prop, no llaman al hook hasta el fondo. Si no se hace
bilingüe, este folder queda vacío y los textos van hardcoded en español.

## Contact info (regla futura, cuando se necesite)

Si el sitio muestra email/teléfono/WhatsApp/redes sociales, los valores
viven en `data/contact.config.json`. Nunca hardcodear un canal de contacto
en un componente. Patrón completo en `Docs/contact-info.md` cuando se cree.

## TypeScript

Estricto (`astro/tsconfigs/strict`). Componentes nuevos en `.tsx`. Si se
extiende un archivo `.js` existente, mantener `.js`. No hacer rewrites
drive-by a `.ts`.
