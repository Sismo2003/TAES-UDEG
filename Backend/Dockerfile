# =============================================================================
#  Backend/Dockerfile — API Express + cliente Prisma (TAEV)
# -----------------------------------------------------------------------------
#  Contexto de build: Backend/ (ver .github/workflows/ci-cd.yml). El esquema y
#  las migraciones viven en Backend/prisma, así que no hace falta nada más del
#  repo dentro de la imagen.
#
#  La imagen incluye el CLI de Prisma (devDependency) A PROPÓSITO: el rollout
#  corre `npm run prisma:migrate:deploy` dentro de un contenedor efímero de
#  esta misma imagen, antes de levantar la versión nueva.
# =============================================================================

FROM node:22-bookworm-slim

# Prisma necesita libssl para elegir su query engine; la imagen slim no la trae
# y sin ella Prisma cae a un engine que no corresponde y revienta al conectar.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Capa de dependencias aparte: sólo se invalida cuando cambia el lockfile.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .

# `prisma generate` sólo lee el schema — no toca la base, no necesita
# DATABASE_URL real. Se llama directo y no vía build-database-url.js porque
# ese wrapper exige DB_HOST/DB_NAME/DB_USER.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

ENV NODE_ENV=production \
    PORT=4000

# Nunca como root: si alguien logra ejecución de código en la API, no hereda
# root dentro del contenedor.
RUN chown -R node:node /app
USER node

EXPOSE 4000

# fetch global de Node 22 — evita instalar curl/wget sólo para esto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
