#!/usr/bin/env bash
# =============================================================================
#  deploy-trigger.sh — Lo único que la llave de CI de TAEV puede ejecutar
# -----------------------------------------------------------------------------
#  INSTALADO EN:  /usr/local/bin/taev-prepa2-deploy-trigger   (root:root, 755)
#  Esta copia es la fuente de verdad. Si la cambias, reinstálala:
#      install -m 755 -o root -g root deploy/deploy-trigger.sh \
#              /usr/local/bin/taev-prepa2-deploy-trigger
#
#  CADENA DE CONFIANZA
#    sshd  →  forced-command en authorized_keys de grid-bot-git
#          →  este script: extrae un tag válido, descarta todo lo demás
#          →  sudo -n  (ver /etc/sudoers.d/taev-prepa2-deploy)
#          →  /root/TAES-UDEG/deploy/rollout.sh  (como root)
#
#  Comparte el usuario grid-bot-git con NimbusCloud y CDIDTHAT, pero con una
#  llave SSH distinta: cada llave tiene su forced-command, así la de este repo
#  no puede disparar el deploy de otro proyecto ni al revés.
# =============================================================================
set -euo pipefail

ROLLOUT="/root/TAES-UDEG/deploy/rollout.sh"
LOG="/var/log/taev-prepa2-deploy.log"

exec > >(tee -a "$LOG") 2>&1
echo "── $(date -Is) — deploy solicitado desde ${SSH_CLIENT%% *}"

req="${SSH_ORIGINAL_COMMAND:-}"

if [ -z "$req" ]; then
  echo "RECHAZADO: esta clave no abre shell. Solo dispara el rollout."
  exit 1
fi

# El texto del cliente NUNCA se evalúa: sólo se extrae, por patrón estricto,
# algo con forma de tag.
tag="$(grep -oE '(^| )(sha-[0-9a-f]{7,40}|latest)( |$)' <<<"$req" | tr -d ' ' | head -n1 || true)"

if [ -z "$tag" ]; then
  echo "RECHAZADO: no se encontró un tag válido (sha-<hex> o latest)."
  echo "  recibido: $req"
  exit 1
fi

echo "── tag: $tag — invocando rollout como root vía sudo"
exec sudo -n "$ROLLOUT" "$tag"
