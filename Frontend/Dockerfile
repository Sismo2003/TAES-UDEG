# =============================================================================
#  Frontend/Dockerfile — portal público de alumnos (Astro estático + nginx)
# -----------------------------------------------------------------------------
#  Contexto de build: Frontend/.
#
#  OJO: las variables PUBLIC_* se hornean en el JS en tiempo de BUILD (Astro
#  compila a estático). Cambiar la URL de la API exige reconstruir la imagen.
#  Por eso viajan como --build-arg desde .github/workflows/ci-cd.yml.
# =============================================================================

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Mismo origen que el sitio: nginx-proxy enruta /api/* y /health de este
# dominio a la API, así que no hay CORS de por medio.
ARG PUBLIC_API_URL=https://prepa2.grid.nimbuscloud.mx
ENV PUBLIC_API_URL=$PUBLIC_API_URL

RUN npm run build

# --- Runtime -----------------------------------------------------------------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Lo consume deploy/rollout.sh antes de dar por bueno el deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

EXPOSE 80
