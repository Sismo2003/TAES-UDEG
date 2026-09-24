---
name: ui
description: Sistema de diseño visual para TAEV-UDEG-PREPA2 — tokens semánticos, superficies, motion conventions, y primitivos reusables (Button, Modal, Badge). Usar para cualquier trabajo visual/UX en Frontend/src/components o Admin/src/components.
---

# UI/UX — TAEV-UDEG-PREPA2

Cada pantalla debe leerse como **una sola cosa bien hecha**: contenido claro,
superficies discretas, motion que comunica un estado (no decora), y
exclusivamente los tokens/componentes establecidos. Esta skill es diseño
visual puro — convenciones de estado/routing/i18n viven en la skill
**frontend**.

## 1. Principios de diseño — aplícalos, no los cites

- **Contenido sobre chrome.** Sin motion decorativo corriendo sin razón. Cada
  animación es una señal de estado (entró, salió, hover, focus, error).
- **Una acción primaria por vista.** Los botones filled/gradient (`Button
  color="primary" variant="filled"`) son para lo único que quieres que el
  usuario haga. Todo lo demás es `outlined` / `flat` / `ghost`.
- **Motion = señal, no decoración.** Entradas de sección:
  `initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}`. Hover de card: `whileHover={{ y: -4 }}`. Easing de
  entrada: `[0.22, 1, 0.36, 1]` para secciones; `ease: 'easeOut'` para chrome
  (navbar, toggles). Nunca `scale` en hover si causa reflow.
- **Restricción.** Antes de añadir un glow, gradient o background pattern,
  revisa si la sección ya tiene uno. Si lo tiene, no añadas otro.

## 2. Tokens de marca — define los reales en `styles/global.css`

Los tokens son **semánticos**, no nombres de Tailwind crudos. Esta es la paleta
por defecto en `Frontend/src/styles/global.css`; cuando se defina la
identidad visual real del proyecto, se ajusta `@theme` ahí y todo lo usa.

```css
@theme {
  --color-primary: #3b82f6;        /* acción principal: botones filled, links */
  --color-accent: #06b6d4;         /* detalles, focus rings, íconos */
  --color-surface: #ffffff;        /* fondo principal */
  --color-surface-muted: #f8fafc;  /* fondo secundario (cards, sidebar) */
  --color-ink: #0f172a;            /* texto primario */
  --color-ink-muted: #475569;      /* texto secundario */
  --color-border: #e2e8f0;         /* bordes hairline */
}
```

**Regla:** nunca usar `bg-blue-500`, `text-slate-700`, `border-gray-200` para
algo semántico. Usar `bg-(--color-primary)`, `text-(--color-ink-muted)`,
`border-(--color-border)`. Si necesitas un color nuevo, agrégalo a `@theme`
primero.

Estados: `emerald-500` ok, `red-500`/`rose-500` error, `amber-500` warning.

## 3. Superficies — recipe estándar

```
Card estándar:    rounded-2xl border border-(--color-border) bg-(--color-surface) p-6
Card elevada:     rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 shadow-sm
Fondo de página:  bg-(--color-surface-muted)
Chrome flotante:  bg-(--color-surface)/90 backdrop-blur-md border-b border-(--color-border)
Modal backdrop:   bg-black/50 backdrop-blur-sm
```

Bordes siempre `border-(--color-border)` o equivalente. Hover de card
aclarando el borde a `hover:border-(--color-accent)/40`.

## 4. Modales — siempre el patrón `<Modal>` existente

Existe un único primitivo `components/ui/Modal.tsx`: portal a `document.body`,
bloquea scroll del body, cierra con Escape o click en backdrop.

```tsx
import { Modal } from '../ui/Modal'

<Modal onClose={onClose}>
  <motion.div
    initial={{ scale: 0.95, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.15 }}
    onClick={(e) => e.stopPropagation()}   // necesario — si no, click dentro cierra el modal
    className="bg-white border border-(--color-border) rounded-2xl p-6 w-full max-w-md shadow-lg"
  >
    {/* contenido */}
  </motion.div>
</Modal>
```

Para overlays full-screen que necesitan `AnimatePresence` con exit,
seguir el patrón manual (`createPortal` + backdrop `div` + spring). No
introducir Headless UI, Radix u otra librería de diálogos.

## 5. Buttons — el contrato color/variant

```tsx
import { Button } from '../ui/Button'

<Button color="primary" variant="filled">Guardar</Button>
<Button color="neutral" variant="outlined">Cancelar</Button>
```

- `color`: `"primary" | "neutral"` — primary para acciones semánticas,
  neutral para chrome (cerrar, atrás).
- `variant`: `"filled" | "soft" | "outlined" | "flat"` — filled para la
  acción primaria, el resto para secundarias/terciarias.
- `isGlow` añade el shadow glow — usar con moderación, solo para CTAs hero.

Para tratamientos puntuales que `Button` no cubre (ej. CTA con gradient
hover-glow) está permitido un `<button>` con Tailwind inline, pero **matcheando**
las clases existentes de los primitivos — no inventar padding/radius/colores
nuevos.

## 6. Forms — inputs, validación y cuándo usar react-hook-form

- Estilos de input centralizados en `components/ui/formStyles.ts`: `inputClass`,
  `labelClass`. **Reusar**, no escribir input styling nuevo en cada form.
- Error en un campo: borde a `border-red-500` + mensaje `text-xs text-red-500`
  debajo del campo.
- **Forms simples (2-3 campos, estado UI-only)**: `useState` por campo está
  permitido — es el patrón aceptado para forms sin validación real.
- **Forms con validación real** (required, min-length, email format): usar
  `react-hook-form` + `yup` con `@hookform/resolvers/yup`. Schema inline con
  los strings de error desde i18n (si existe) o constantes.
- **NO agregar CAPTCHA todavía.** Si más adelante se necesita, se evalúa la
  opción (Turnstile de Cloudflare, hCaptcha, etc.).

## 7. Cards, badges y layout de sección

- `Badge` (`components/ui/Badge.tsx`) es el único primitivo de tag/pill.
  Reusar para etiquetas, no crear pills desde cero.
- Entrada de sección (cada `components/sections/*.tsx`): heading y body
  fade+slide independientes con stagger pequeño (`delay: 0.1`, `0.2`...),
  cada uno envuelto en `whileInView` con `viewport={{ once: true }}` para que
  solo se reproduzca una vez por sesión.

## 8. Modo claro/oscuro

Por defecto el proyecto es **claro**. Si más adelante se agrega dark mode,
se hace vía `@media (prefers-color-scheme: dark)` o un toggle con clase
`.dark` en `<html>`. No usar el prefijo `dark:` arbitrariamente hasta que
exista la estrategia.
