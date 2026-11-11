#!/usr/bin/env bash
# Vuelve a mano a la versión de Eli que estaba ANTES de la última actualización.
#
#   ./deploy/volver-atras.sh
#
# No compila nada: la versión anterior sigue guardada en /opt/eli/releases
# (se conservan las últimas 3). Cambia el enlace /opt/eli/current, reinicia el
# servicio y comprueba que responde. Si lo corres otra vez, vuelve a la que
# dejaste (va y viene entre las dos).
#
# NO deshace migraciones de la base de datos: eso no se puede hacer
# automáticamente. Las migraciones del proyecto son, casi siempre, "aditivas"
# (el código viejo sigue funcionando con la base nueva); el README.md dice caso
# por caso. Si la versión de la que sales trae migraciones que la anterior no
# tiene, este script te lo avisa y pide confirmación.
#
# No lo corras entre las 12:50 y las 13:20 UTC (hora de los crons diarios): si
# lo corres, los crons esperan a que termines (comparten el candado).
#
# Como actualizar.sh, comprueba la portada y las direcciones de
# ELI_URL_SALUD_EXTRA (README.md, paso 14).
#
# Variables SOLO PARA PRUEBAS: ELI_RAIZ, ELI_CMD_REINICIAR, ELI_URL_SALUD,
# ELI_ESPERA_SALUD, ELI_ENV_FILE, ELI_PERMITIR_ROOT.

set -euo pipefail

DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=lib-entorno.sh
source "$DIRECTORIO_DEL_SCRIPT/lib-entorno.sh"

RAIZ="${ELI_RAIZ:-/opt/eli}"
ACTUAL="$RAIZ/current"
ANTERIOR="$RAIZ/previous"
URL_SALUD="${ELI_URL_SALUD:-http://127.0.0.1:3000/}"
# reset-failed antes de reiniciar: si la versión de la que sales murió al
# arrancar, la unidad está en "failed (start-limit-hit)" y systemd rechaza el
# "restart" hasta limpiarla (deploy/sudoers-eli permite los dos comandos).
CMD_REINICIAR="${ELI_CMD_REINICIAR:-sudo -n systemctl reset-failed eli; sudo -n systemctl restart eli}"
ESPERA_SALUD_SEGUNDOS="${ELI_ESPERA_SALUD:-60}"

mensaje() { printf '\n==> %s\n' "$*"; }
fallo() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(id -u)" -eq 0 && -z "${ELI_PERMITIR_ROOT:-}" ]]; then
  fallo "No corras esto como root: dejaría archivos con dueño root y el servicio no podría escribir su caché. Entra como el usuario 'eli' (su - eli)."
fi
[[ -L "$ACTUAL" ]] || fallo "No existe $ACTUAL: todavía no hay una versión instalada."
[[ -L "$ANTERIOR" ]] || fallo "No hay una versión anterior registrada ($ANTERIOR). Es el primer despliegue, o se limpió."
DESDE="$(readlink -f "$ACTUAL")"
HACIA="$(readlink -f "$ANTERIOR")"
[[ -d "$HACIA" && -f "$HACIA/.listo" ]] || fallo "La carpeta anterior ($HACIA) ya no existe o está incompleta."
[[ "$DESDE" != "$HACIA" ]] || fallo "La versión anterior y la actual son la misma."

exec 9>"$RAIZ/.candado"
flock -n 9 || fallo "Hay una actualización en curso. Espera a que termine."

echo "Versión actual:   $(basename "$DESDE")"
echo "Se vuelve a:      $(basename "$HACIA")"

# ¿La versión de la que salimos trae migraciones que la de destino no tiene?
if [[ -f "$DESDE/.commit" && -f "$HACIA/.commit" && -d "$RAIZ/repo/.git" ]]; then
  NUEVAS="$(git -C "$RAIZ/repo" diff --name-only --diff-filter=AMR "$(cat "$HACIA/.commit")" "$(cat "$DESDE/.commit")" -- prisma/migrations 2>/dev/null |
    awk -F/ 'NF >= 4 { print $3 }' | sort -u || true)"
  if [[ -n "$NUEVAS" ]]; then
    printf '\nAVISO: la versión actual trae migraciones que la anterior no conoce:\n' >&2
    sed 's/^/      - /' <<<"$NUEVAS" >&2
    echo "    Volver NO las deshace. Si son aditivas (columnas o tablas nuevas) el código" >&2
    echo "    viejo suele seguir funcionando; revisa README.md, 'Migraciones en producción'." >&2
    if [[ -t 0 ]]; then
      read -r -p "    ¿Seguir de todos modos? Escribe SI para continuar: " RESPUESTA
      [[ "$RESPUESTA" == "SI" ]] || fallo "Cancelado. No se cambió nada."
    else
      fallo "Hay migraciones de por medio y no hay una persona para confirmar."
    fi
  fi
fi

# esperar_salud: lib-entorno.sh (la portada y las ELI_URL_SALUD_EXTRA).

apuntar() {
  ln -sfn "$2" "$RAIZ/$1.nuevo"
  mv -T "$RAIZ/$1.nuevo" "$RAIZ/$1"
}

mensaje "Cambiando de versión y reiniciando..."
apuntar current "$HACIA"
apuntar previous "$DESDE"
if bash -c "$CMD_REINICIAR" && esperar_salud; then
  mensaje "Listo: Eli corre $(basename "$HACIA")."
  exit 0
fi

printf '\nERROR: la versión %s no respondió. Dejando todo como estaba...\n' "$(basename "$HACIA")" >&2
apuntar current "$DESDE"
apuntar previous "$HACIA"
bash -c "$CMD_REINICIAR" || true
esperar_salud || true
fallo "No se pudo volver atrás. Mira deploy/README.md, paso 15 (diagnóstico)."
