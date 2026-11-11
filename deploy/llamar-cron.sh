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
#
# Si falla (código no 2xx, sin secreto, o no pudo empezar), además manda UN
# correo al día por cron a SOPORTE_EMAIL con la API de Resend (lib-entorno.sh,
# avisar_por_correo). Si faltan RESEND_API_KEY / RESEND_FROM_EMAIL /
# SOPORTE_EMAIL en eli.env, sólo queda en el registro.
#
# Comparte el candado de actualizar.sh y volver-atras.sh (/opt/eli/.candado):
# si justo hay una actualización, ESPERA (hasta 15 minutos) a que termine y
# recién entonces llama a Eli, ya reiniciado. Así un despliegue a las 13:00 UTC
# no pierde el cron del día ni lo corta a la mitad.
#
# Variables SOLO PARA PRUEBAS: ELI_URL_LOCAL, ELI_ENV_FILE, ELI_RAIZ,
# ELI_ESPERA_CANDADO, ELI_DIR_AVISOS, ELI_URL_RESEND.

set -euo pipefail
umask 077

ETIQUETA="eli-cron"
DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib-entorno.sh
source "$DIRECTORIO_DEL_SCRIPT/lib-entorno.sh"

RUTA="${1:-}"
case "$RUTA" in
  /api/cron/recordatorios|/api/cron/correos-de-prueba|/api/cron/mensajes-a-clientes) ;;
  *) registrar "$ETIQUETA" err "Ruta de cron no válida: '$RUTA'"; exit 2 ;;
esac

BASE="${ELI_URL_LOCAL:-http://127.0.0.1:3000}"
CLAVE_DE_AVISO="cron-$(basename "$RUTA")"

# falla "mensaje para el registro" ["mensaje para el correo"]
# Registra el error, avisa por correo (tope: uno al día por cron) y sale con 1.
falla() {
  local para_el_correo="${2:-$1}"
  registrar "$ETIQUETA" err "$1"
  avisar_por_correo "$CLAVE_DE_AVISO" "Eli: falló el cron $RUTA" \
"El cron $RUTA no se pudo completar hoy ($(date -u '+%Y-%m-%d %H:%M UTC')).

$para_el_correo

Los recordatorios o correos de ese cron pueden no haber salido. Entra al servidor y mira:
  journalctl -t eli-cron --since today --no-pager
y la guía: deploy/README.md, paso 15.

Este aviso se manda como mucho una vez al día por cron." || true
  exit 1
}

# Candado compartido con las actualizaciones (ver arriba).
RAIZ="${ELI_RAIZ:-/opt/eli}"
if [[ -d "$RAIZ" && -w "$RAIZ" ]] && { exec 8>"$RAIZ/.candado"; } 2>/dev/null; then
  if ! flock -w "${ELI_ESPERA_CANDADO:-900}" 8; then
    falla "$RUTA: había una actualización en curso y no terminó en ${ELI_ESPERA_CANDADO:-900} segundos; no llamé a Eli."
  fi
fi

cargar_entorno "$ARCHIVO_ENTORNO" CRON_SECRET || falla "$RUTA: no pude leer $ARCHIVO_ENTORNO"
if [[ -z "${CRON_SECRET:-}" ]]; then
  falla "$RUTA: falta CRON_SECRET en $ARCHIVO_ENTORNO"
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
# Al correo va sólo el código y el error de curl, nunca el cuerpo de la respuesta.
falla "$RUTA -> FALLÓ con código $CODIGO $RESUMEN $ERROR_DE_CURL" "$RUTA -> FALLÓ con código $CODIGO $ERROR_DE_CURL"
