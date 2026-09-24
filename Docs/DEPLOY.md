# Despliegue y CI/CD — TAEV PREPA 2

Cómo llega el código a producción en el servidor `grid`.

| Dominio | Qué sirve |
|---|---|
| `https://prepa2.grid.nimbuscloud.mx` | Portal de alumnos (`Frontend/`) + `/api/taev/*` |
| `https://admin.prepa2.grid.nimbuscloud.mx` | Panel (`Admin/`) + `/api/*` |

Mismo patrón que `/root/cdidthat` (ver su `Docs/ci-cd.md`): si arreglas algo
del mecanismo aquí, revisa si el otro lo tiene también.

---

## 1. El recorrido de un `git push`

```
git push origin main
   │
   ▼
GitHub Actions  (.github/workflows/ci-cd.yml)
   ├─ 1. checks       Backend: node --check + migrate deploy sobre Postgres
   │                           limpio + verify_constraints.sql + npm test
   │                  Frontend y Admin: astro check + astro build
   ├─ 2. build+push   3 imágenes → ghcr.io/sismo2003/taev-udeg-{api,web,admin}
   │                  tag = sha-<12 primeros del commit> (+ latest)
   └─ 3. rollout      runner entra a la tailnet (nodo efímero)
                      ssh -p 2222 grid-bot-git@100.88.25.60
   ▼
grid: /usr/local/bin/taev-prepa2-deploy-trigger → sudo → deploy/rollout.sh
   pull → Postgres healthy → migrate deploy → up -d → healthchecks
   → instala el vhost si cambió (con nginx -t y restauración) → reload nginx
   → fija el tag en deploy/.env
```

En ramas y PRs sólo corren los checks. **El build nunca ocurre en el
servidor** (máquina de casa compartida); el servidor sólo hace `docker pull`.

> El servidor **no** hace `git pull`. `rollout.sh`, `docker-compose.yml` y el
> vhost que usa son los del checkout de `/root/TAES-UDEG`. Si cambias algo en
> `deploy/`, después del merge corre `git -C /root/TAES-UDEG pull` en el
> servidor (el siguiente rollout instala el vhost si cambió).

---

## 2. Arquitectura en el servidor

```
Internet ──► nginx-proxy :80/:443   /root/nginx/conf.d/taev-prepa2.conf
                │
   prepa2.grid… │                     admin.prepa2.grid…
   ┌────────────┼──────────┐          ┌───────────┬──────────┐
   /            /api/*     /api/admin/*→404   /     /api/*
   ▼            ▼                              ▼     ▼
taev-prepa2-web  taev-prepa2-api  ◄──────────────── taev-prepa2-admin
 (nginx+Astro)   (Express :4000)                    (nginx+SPA)
                     │  red taev-internal (internal, 172.16.42.0/24)
                     ▼
                taev-prepa2-db (Postgres 16, volumen taev_pgdata)
```

| Contenedor | Imagen | Redes |
|---|---|---|
| `taev-prepa2-web` | `ghcr.io/sismo2003/taev-udeg-web` | `nginx` |
| `taev-prepa2-admin` | `ghcr.io/sismo2003/taev-udeg-admin` | `nginx` |
| `taev-prepa2-api` | `ghcr.io/sismo2003/taev-udeg-api` | `nginx` + `taev-internal` |
| `taev-prepa2-db` | `postgres:16-alpine` | `taev-internal` **solamente** |

Decisiones:

- **Cada dominio le habla a la API por su mismo origen** (`/api/...`). Las
  imágenes se compilan con `PUBLIC_API_URL` = su propio dominio: sin CORS ni
  preflight. Cambiar un dominio exige reconstruir su imagen (las `PUBLIC_*` se
  hornean en build).
- **`/api/admin/*` devuelve 404 en el dominio público.** La API del panel sólo
  se publica en `admin.prepa2…`.
- **Subred fija `172.16.42.0/24` para `taev-internal`.** Los pools
  172.17–31 de Docker en este servidor están agotados y Docker asigna
  `192.168.x`, pero la cadena `DOCKER-USER` del firewall sólo deja pasar tráfico
  entre contenedores de `172.16.0.0/12`. Con `192.168.x` la API resuelve `db`
  pero el TCP se cae en silencio (`P1001`).
- **5xx propio.** El `nginx.conf` global redirige 502/503/504 a
  `nimbuscloud.mx`; este vhost lo sobrescribe con un 503 JSON para que un alumno
  en plena ventana no aterrice en otro sitio.
- **Sin SEO**: `X-Robots-Tag: noindex` + `robots.txt` de bloqueo en ambos.

### TLS y DNS

- `prepa2.grid…` → wildcard `*.grid.nimbuscloud.mx` (ya existía).
- `admin.prepa2.grid…` es de **tercer nivel**: ningún wildcard lo cubre. Tiene
  su propio certificado, lineage `/etc/letsencrypt/live/prepa2.grid.nimbuscloud.mx`
  (SAN: ambos nombres), emitido por DNS-01 contra Cloudflare. Lo renueva el
  cron de certbot existente (`renew_hook` recarga nginx-proxy).
- DNS: los dos nombres resuelven por el wildcard `*.grid` (gris, directo a la
  IP de casa). No hubo que crear registros.

---

## 3. Configuración en el servidor

| Qué | Dónde |
|---|---|
| Secretos de la API (`JWT_SECRET`, `ALLOWED_ORIGINS`…) | `/root/TAES-UDEG/Backend/.env` (600) |
| Postgres + tags desplegados (+ GHCR opcional) | `/root/TAES-UDEG/deploy/.env` (600) |
| Vhost | `/root/nginx/conf.d/taev-prepa2.conf` (copia de `deploy/nginx/`) |
| Trigger del bot | `/usr/local/bin/taev-prepa2-deploy-trigger` (copia de `deploy/`) |
| Permiso sudo del bot | `/etc/sudoers.d/taev-prepa2-deploy` |
| Llave de CI (pública) | `/home/grid-bot-git/.ssh/authorized_keys` (forced-command) |
| Log de despliegues | `/var/log/taev-prepa2-deploy.log` |
| Credencial del superadmin inicial | `/root/.secrets/taev-prepa2-admin.txt` (600) |

Las credenciales de la BD viven **sólo** en `deploy/.env`; el compose se las
inyecta a la API como `DB_*`. `Backend/.env` no las repite.

### Cadena de confianza del bot de CI

1. **ufw**: el 2222 sólo acepta `100.64.0.0/10` (Tailscale).
2. **`from=`** en `authorized_keys`: la llave sólo vale desde ese rango.
3. **`restrict` + forced-command**: sin shell ni forwarding; ejecuta sólo el trigger.
4. **El trigger** sólo extrae algo con forma `sha-<hex>`/`latest`; el resto se descarta.
5. `grid-bot-git` **no** está en el grupo `docker` (equivale a root).

Llave propia de este repo, distinta de las de NimbusCloud y CDIDTHAT: no puede
disparar el deploy de otro proyecto.

---

## 4. Configuración en GitHub (una vez)

`Settings → Secrets and variables → Actions → Secrets`:

| Secret | Valor |
|---|---|
| `SSH_HOST` | `100.88.25.60` |
| `SSH_USER` | `grid-bot-git` |
| `SSH_PORT` | `2222` |
| `SSH_PRIVATE_KEY` | contenido de `/root/taev-prepa2-ci-deploy-key` |
| `TS_OAUTH_CLIENT_ID` | el mismo de NimbusCloud/CDIDTHAT |
| `TS_OAUTH_SECRET` | el mismo de NimbusCloud/CDIDTHAT |

Después de copiar la llave privada a GitHub, **bórrala del servidor**:

```bash
shred -u /root/taev-prepa2-ci-deploy-key /root/taev-prepa2-ci-deploy-key.pub
```

Los paquetes de ghcr.io nacen **privados**. `root` ya tiene `docker login
ghcr.io` en el servidor; si ese token no alcanza a estos paquetes, pon
`GHCR_USER`/`GHCR_TOKEN` (PAT con `read:packages`) en `deploy/.env`.

---

## 5. Operación diaria

```bash
# Versión corriendo
grep TAG /root/TAES-UDEG/deploy/.env

# Estado y logs
docker ps --filter name=taev-prepa2
docker logs taev-prepa2-api -f
tail -f /var/log/taev-prepa2-deploy.log
tail -f /root/nginx/logs/taev-prepa2-access.log /root/nginx/logs/taev-prepa2-admin-access.log

# Rollback (tag = sha-<12 primeros del commit>)
/root/TAES-UDEG/deploy/rollout.sh sha-abc123def456

# psql
docker exec -it taev-prepa2-db psql -U taev -d taev_udeg_prepa2

# Backup lógico
docker exec taev-prepa2-db pg_dump -U taev -Fc taev_udeg_prepa2 > /root/backups/taev-$(date +%F).dump
```

### Crear o resetear un admin

No hay seed en producción (`Database/seeds/` es sólo local). El hash se genera
dentro del contenedor:

```bash
docker exec -it taev-prepa2-api node scripts/hash-string.js   # pide la contraseña oculta
docker exec -it taev-prepa2-db psql -U taev -d taev_udeg_prepa2
#   UPDATE users SET password_hash = '<hash>', updated_at = now() WHERE email = '...';
```
