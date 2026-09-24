# =============================================================================
#  Admin/Dockerfile — panel interno (SPA Astro + react-router, servida por nginx)
# -----------------------------------------------------------------------------
#  Contexto de build: Admin/.
#
#  Las PUBLIC_* se hornean en build (ver Frontend/Dockerfile). PUBLIC_PORTAL_URL
#  es la URL del portal de alumnos que aparece en el QR de "Envíos en vivo".
# =============================================================================

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG PUBLIC_API_URL=https://admin.prepa2.grid.nimbuscloud.mx
ARG PUBLIC_PORTAL_URL=https://prepa2.grid.nimbuscloud.mx
ENV PUBLIC_API_URL=$PUBLIC_API_URL \
    PUBLIC_PORTAL_URL=$PUBLIC_PORTAL_URL

RUN npm run build

# --- Runtime -----------------------------------------------------------------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

EXPOSE 80
