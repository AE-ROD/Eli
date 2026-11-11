#!/usr/bin/env bash
# Llama a un cron de Eli (por ejemplo /api/cron/recordatorios) en este mismo
# servidor, con el secreto que exige lib/cron.ts, y registra el resultado.
#
#   ./llamar-cron.sh /api/cron/recordatorios
#
# Lo usa /etc/cron.d/eli (deploy/cron-eli). También sirve para probar a mano.
#
# Autorización: lib/cron.ts acepta "Authorization: Bearer <CRON_SECRET>" (lo
# que mandaba Vercel). Se manda eso.
#
# El secreto NO aparece en la lista de procesos (ps) ni en los logs:
#  - se lee del archivo de variables, no se pasa como argumento;
#  - curl lo recibe por la entrada estándar (--config -), nunca en su línea de
#    comandos;
#  - del resultado sólo se registra el código HTTP y el resumen de la respuesta
#    (son contadores, sin datos de clientes).
#
# El resultado queda en el registro del sistema:  journalctl -t eli-cron
# Sale con código 0 sólo si Eli respondió 2xx.

set -euo pipefail
umask 077

ETIQUETA="eli-cron"
DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source=lib-entorno.sh
source "$DIRECTORIO_DEL_SCRIPT/lib-entorno.sh"

RUTA="${1:-}"
case "$RUTA" in
  /api/cron/recordatorios|/api/cron/correos-de-prueba|/api/cron/mensajes-a-clientes) ;;
  *) registrar "$ETIQUETA" err "Ruta de cron no válida: '$RUTA'"; exit 2 ;;
esac

BASE="${ELI_URL_LOCAL:-http://127.0.0.1:3000}"

cargar_entorno "$ARCHIVO_ENTORNO" CRON_SECRET || { registrar "$ETIQUETA" err "$RUTA: no pude leer $ARCHIVO_ENTORNO"; exit 1; }
if [[ -z "${CRON_SECRET:-}" ]]; then
  registrar "$ETIQUETA" err "$RUTA: falta CRON_SECRET en $ARCHIVO_ENTORNO"
  exit 1
fi

CUERPO="$(mktemp)"
trap 'rm -f "$CUERPO" "$CUERPO.error"' EXIT

# Escapa \ y " para el formato de archivo de configuración de curl.
SECRETO_ESCAPADO="${CRON_SECRET//\\/\\\\}"
SECRETO_ESCAPADO="${SECRETO_ESCAPADO//\"/\\\"}"
unset CRON_SECRET

# printf es un comando interno de bash: no crea un proceso con el secreto a la
# vista. --max-time 180: la corrida tiene un presupuesto de ~50 s de trabajo.
CODIGO="$(
  printf 'header = "Authorization: Bearer %s"\n' "$SECRETO_ESCAPADO" |
    curl --silent --show-error --config - --max-time 180 \
      --output "$CUERPO" --write-out '%{http_code}' "$BASE$RUTA" 2>"$CUERPO.error"
)" || CODIGO="000"
unset SECRETO_ESCAPADO

RESUMEN="$(head -c 400 "$CUERPO" | tr '\n\r' '  ')"
ERROR_DE_CURL="$(head -c 200 "$CUERPO.error" 2>/dev/null | tr '\n\r' '  ' || true)"
rm -f "$CUERPO.error"

if [[ "$CODIGO" =~ ^2[0-9][0-9]$ ]]; then
  registrar "$ETIQUETA" info "$RUTA -> $CODIGO $RESUMEN"
  exit 0
fi
registrar "$ETIQUETA" err "$RUTA -> FALLÓ con código $CODIGO $RESUMEN $ERROR_DE_CURL"
exit 1
