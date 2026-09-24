# Frontend — TAEV-UDEG-PREPA2

Sitio público. Astro como framework, React como capa de islas interactivas.

## Stack

- **Astro 5** con output `static` (sitio público sin SEO activo)
- **React 19** montado vía `@astrojs/react` con directivas `client:load`/`client:visible`
- **Tailwind CSS v4** (CSS-first, sin `tailwind.config.js`)
- **Framer Motion** para animaciones
- **Zustand** para estado global
- **react-hook-form + Yup** para formularios con validación
- **Sonner** para toasts
- **lucide-react** para iconos
- **Axios** para el cliente HTTP hacia el Backend

## Estructura

```
Frontend/
├── astro.config.mjs          # config: integrations, vite aliases, server port
├── src/
│   ├── layouts/              # Layout.astro y variantes (envuelve <head> y <body>)
│   ├── pages/                # rutas Astro (cada archivo .astro = una ruta)
│   ├── components/
│   │   ├── layout/           # Navbar, Footer (compartidos entre páginas)
│   │   ├── sections/         # bloques de página (Hero, About, etc.)
│   │   ├── ui/                 # primitivos (Button, Modal, Badge)
│   │   └── forms/               # formularios (ContactForm, etc.)
│   ├── backend/                # cliente HTTP hacia la API (axios + endpoints)
│   ├── stores/                  # Zustand: uno por dominio
│   ├── hooks/                    # useLanguage, useMediaQuery, etc.
│   ├── i18n/                      # (opcional) es.ts / en.ts si se necesita bilingüe
│   ├── data/                       # configs estáticas (contact.config.json, etc.)
│   ├── lib/                          # utils puros (cn(), formatDate, etc.)
│   └── styles/                         # global.css con tokens de Tailwind v4
└── public/                              # assets estáticos servidos tal cual
```

## Setup local

```bash
npm install
cp .env.example .env

# Asegúrate de que el Backend esté corriendo (ver Backend/README.md)
npm run dev
```

El Frontend arranca en `http://localhost:4321`.

## Scripts npm

| Script | Qué hace |
|---|---|
| `npm run dev` | Dev server con HMR |
| `npm run build` | `astro check` + build de producción |
| `npm run preview` | Sirve el build para revisar antes de deploy |
| `npm run lint` | ESLint |

## Reglas del proyecto

- Lee la skill `.agents/skills/frontend/SKILL.md` para las convenciones de
  componentes, stores, API client y forms.
- Lee la skill `.agents/skills/ui/SKILL.md` para tokens visuales, motion,
  modals, buttons y forms.

## Sin SEO

Este proyecto **no usa SEO**: no hay sitemap, no se prerenderiza para
motores de búsqueda, no se configuran meta-tags avanzados. Si más adelante
se necesita, hay que añadir `@astrojs/sitemap` y reconsiderar `output`.
