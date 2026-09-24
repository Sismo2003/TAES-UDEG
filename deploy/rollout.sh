#!/usr/bin/env bash
# =============================================================================
#  rollout.sh — Despliegue de TAEV PREPA 2 en el servidor `grid`
# -----------------------------------------------------------------------------
#  Lo invoca .github/workflows/ci-cd.yml por SSH:  ./rollout.sh sha-abc123def
#  También se puede correr a mano:                 ./rollout.sh
#  Rollback a una versión anterior:                ./rollout.sh sha-<commit>
#
#  Corre como root vía sudo (ver /etc/sudoers.d/taev-prepa2-deploy). Es
#  idempotente y falla temprano: si algo sale mal corta antes de tocar más
#  cosas y el stack anterior sigue en pie.
#
#  Mismo patrón que /root/cdidthat/deploy/rollout.sh — si arreglas un bug aquí,
#  revisa si el otro lo tiene también.
# =============================================================================
set -euo pipefail

TAG="${1:-latest}"

# Se revalida aunque el trigger ya lo filtró: este script corre como root y el
# valor se interpola más abajo en un `sed` y en referencias de imagen.
if ! [[ "$TAG" =~ ^(latest|sha-[0-9a-f]{7,40})$ ]]; then
  echo "ERROR: tag inválido: '$TAG' (se espera 'latest' o 'sha-<hex>')" >&2
  exit 1
fi

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
BACKEND_ENV="$DEPLOY_DIR/../Backend/.env"
VHOST_SRC="$DEPLOY_DIR/nginx/taev-prepa2.conf"
VHOST_DST="/root/nginx/conf.d/taev-prepa2.conf"

log() { echo "[rollout $(date +%H:%M:%S)] $*"; }

cd "$DEPLOY_DIR"

# --- Comprobaciones previas --------------------------------------------------
[ -f "$ENV_FILE" ]    || { echo "FALTA $ENV_FILE (cópialo de deploy/.env.template)"; exit 1; }
[ -f "$BACKEND_ENV" ] || { echo "FALTA $BACKEND_ENV (cópialo de Backend/.env.example)"; exit 1; }

docker network inspect nginx >/dev/null 2>&1 || {
  log "creando red faltante: nginx"
  docker network create nginx
}

# --- Login a ghcr.io (opcional) ----------------------------------------------
GHCR_USER=$(grep -E '^GHCR_USER=' "$ENV_FILE" | cut -d= -f2- || true)
GHCR_TOKEN=$(grep -E '^GHCR_TOKEN=' "$ENV_FILE" | cut -d= -f2- || true)
if [ -n "$GHCR_USER" ] && [ -n "$GHCR_TOKEN" ]; then
  log "login en ghcr.io como $GHCR_USER"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
else
  log "sin GHCR_USER/GHCR_TOKEN en deploy/.env — se usa el login de docker existente"
fi

# --- Fijar el tag a desplegar ------------------------------------------------
# Viaja como variable de entorno (tiene prioridad sobre deploy/.env). El .env
# se reescribe SOLO al final, cuando el deploy salió bien: si el pull fallara,
# un reinicio del servidor no debe apuntar a una imagen inexistente.
export TAEV_API_TAG="$TAG"
export TAEV_WEB_TAG="$TAG"
export TAEV_ADMIN_TAG="$TAG"
log "desplegando tag: $TAG"

log "pull de imágenes"
docker compose pull api web admin

# --- Base de datos + migraciones --------------------------------------------
log "levantando Postgres"
docker compose up -d db
for i in $(seq 1 30); do
  status=$(docker inspect taev-prepa2-db --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)
  [ "$status" = "healthy" ] && { log "Postgres OK"; break; }
  [ "$i" -eq 30 ] && { log "ERROR: Postgres no llegó a healthy (estado: $status)"; docker logs taev-prepa2-db --tail 40; exit 1; }
  sleep 2
done

# Migraciones ANTES de cambiar la app: el código nuevo asume el esquema nuevo.
# `migrate deploy` sólo aplica las pendientes; nunca genera ni resetea.
log "migraciones"
docker compose run --rm --no-deps api npm run --silent prisma:migrate:deploy

# --- Aplicar la nueva versión ------------------------------------------------
log "levantando servicios"
docker compose up -d --no-deps api web admin

log "esperando healthchecks"
for svc in taev-prepa2-api taev-prepa2-web taev-prepa2-admin; do
  for i in $(seq 1 30); do
    status=$(docker inspect "$svc" --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)
    [ "$status" = "healthy" ] && { log "$svc OK"; break; }
    [ "$i" -eq 30 ] && {
      log "ERROR: $svc no llegó a healthy (estado: $status)"
      docker logs "$svc" --tail 40
      exit 1
    }
    sleep 3
  done
done

# --- Vhost + recarga del proxy -----------------------------------------------
# El vhost del repo es la fuente de verdad. Si cambió, se instala; si nginx -t
# falla, se restaura el anterior para no dejar el proxy de TODO el servidor sin
# poder recargar.
if [ -f "$VHOST_SRC" ] && ! cmp -s "$VHOST_SRC" "$VHOST_DST"; then
  log "instalando vhost actualizado"
  [ -f "$VHOST_DST" ] && cp "$VHOST_DST" "$VHOST_DST.prev"
  cp "$VHOST_SRC" "$VHOST_DST"
  if ! docker exec nginx-proxy nginx -t; then
    log "ERROR: nginx -t falló con el vhost nuevo — restaurando el anterior"
    if [ -f "$VHOST_DST.prev" ]; then mv "$VHOST_DST.prev" "$VHOST_DST"; else rm -f "$VHOST_DST"; fi
    exit 1
  fi
  rm -f "$VHOST_DST.prev"
fi

log "validando y recargando nginx-proxy"
docker exec nginx-proxy nginx -t
docker exec nginx-proxy nginx -s reload

# --- Registrar la versión desplegada -----------------------------------------
log "fijando $TAG en $ENV_FILE"
sed -i -E "s|^TAEV_API_TAG=.*|TAEV_API_TAG=$TAG|"     "$ENV_FILE"
sed -i -E "s|^TAEV_WEB_TAG=.*|TAEV_WEB_TAG=$TAG|"     "$ENV_FILE"
sed -i -E "s|^TAEV_ADMIN_TAG=.*|TAEV_ADMIN_TAG=$TAG|" "$ENV_FILE"

# Sin esto cada deploy deja la imagen anterior colgada y llena el disco.
log "limpiando imágenes huérfanas"
docker image prune -f >/dev/null

log "rollout completo — tag $TAG"
