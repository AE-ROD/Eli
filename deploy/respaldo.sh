#!/usr/bin/env bash
# Respaldo de la base de datos de Eli (Neon) a un archivo en este servidor.
#
#   ./respaldo.sh
#
# Lo corre cron todas las noches (deploy/cron-eli) y se puede correr a mano.
#
# - Usa DIRECT_URL (la conexión directa, no la del pooler) del archivo de
#   variables. No la imprime ni la pasa por la línea de comandos: se convierte
#   en variables PG* del entorno de este proceso (ver lib-entorno.sh).
# - Deja /var/backups/eli/eli-AAAA-MM-DD_HHMMSS.dump (formato "custom" de
#   pg_dump, ya comprimido), permisos 600, y un enlace "ultimo.dump".
# - Comprueba que el archivo sirve (no vacío y que pg_restore lo puede leer)
#   antes de darlo por bueno y de borrar respaldos viejos (más de 14 días).
# - Cualquier problema sale con código distinto de 0 y queda en el registro:
#   journalctl -t eli-respaldo
#
# Variables opcionales: ELI_RESPALDOS (carpeta), ELI_RETENCION_DIAS (14).

set -euo pipefail
umask 077

ETIQUETA="eli-respaldo"
DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source=lib-entorno.sh
source "$DIRECTORIO_DEL_SCRIPT/lib-entorno.sh"

DESTINO="${ELI_RESPALDOS:-/var/backups/eli}"
RETENCION_DIAS="${ELI_RETENCION_DIAS:-14}"

info() { registrar "$ETIQUETA" info "$*"; }
falla() { registrar "$ETIQUETA" err "ERROR: $*"; exit 1; }

[[ "$RETENCION_DIAS" =~ ^[0-9]+$ && "$RETENCION_DIAS" -ge 1 ]] || falla "ELI_RETENCION_DIAS debe ser un número de días (1 o más)."
command -v pg_dump >/dev/null || falla "No está pg_dump. Instala postgresql-client-XX (deploy/README.md, paso 3)."
command -v pg_restore >/dev/null || falla "No está pg_restore."
command -v node >/dev/null || falla "No está node."
[[ -d "$DESTINO" && -w "$DESTINO" ]] || falla "La carpeta $DESTINO no existe o no se puede escribir (deploy/README.md, paso 11)."

# Un solo respaldo a la vez.
exec 9>"$DESTINO/.candado"
flock -n 9 || falla "Ya hay otro respaldo corriendo."

cargar_entorno "$ARCHIVO_ENTORNO" DIRECT_URL || falla "No pude leer las variables."
[[ -n "${DIRECT_URL:-}" ]] || falla "Falta DIRECT_URL en $ARCHIVO_ENTORNO."
conexion_desde_url DIRECT_URL || falla "DIRECT_URL no se pudo interpretar."
unset DIRECT_URL

# El pooler de Neon (PgBouncer) no sirve para volcados: hay que ir directo.
if [[ "$PGHOST" == *-pooler* ]]; then
  falla "DIRECT_URL apunta al pooler de Neon ($PGHOST). Debe ser la conexión DIRECTA (sin '-pooler' en el servidor)."
fi

SELLO="$(date -u +%Y-%m-%d_%H%M%S)"
FINAL="$DESTINO/eli-$SELLO.dump"
TEMPORAL="$FINAL.parcial"
trap 'rm -f "$TEMPORAL"' EXIT

info "Empieza el respaldo de la base '$PGDATABASE' en $PGHOST."
if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$TEMPORAL"; then
  falla "pg_dump falló (revisa el mensaje de arriba; si dice 'server version mismatch', el postgresql-client instalado es más viejo que el Postgres de Neon: deploy/README.md, paso 3)."
fi

# Verificación: no vacío, legible, y con datos de tablas adentro.
[[ -s "$TEMPORAL" ]] || falla "El respaldo quedó vacío."
INDICE="$(pg_restore --list "$TEMPORAL")" || falla "pg_restore no puede leer el respaldo recién hecho."
TABLAS="$(grep -c ' TABLE DATA ' <<<"$INDICE" || true)"
[[ "$TABLAS" -ge 1 ]] || falla "El respaldo no trae ninguna tabla con datos."

chmod 600 "$TEMPORAL"
mv "$TEMPORAL" "$FINAL"
ln -sfn "$FINAL" "$DESTINO/ultimo.dump"
TAMANO="$(du -h "$FINAL" | cut -f1)"
info "Respaldo listo y verificado: $FINAL ($TAMANO, $TABLAS tablas con datos)."

# Retención: recién ahora, con el respaldo nuevo a salvo, se borran los viejos.
find "$DESTINO" -maxdepth 1 -type f \( -name 'eli-*.dump' -o -name 'eli-*.dump.parcial' \) -mtime "+$RETENCION_DIAS" -print -delete |
  while IFS= read -r viejo; do info "Borrado por antiguo (más de $RETENCION_DIAS días): $viejo"; done

info "Quedan $(find "$DESTINO" -maxdepth 1 -type f -name 'eli-*.dump' | wc -l) respaldos en $DESTINO."
