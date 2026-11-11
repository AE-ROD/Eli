#!/usr/bin/env bash
# Actualiza Eli en este servidor, por "releases".
#
#   cd /opt/eli/repo && git pull --ff-only && ./deploy/actualizar.sh
#
#   ./deploy/actualizar.sh                  construye y activa origin/main
#   ./deploy/actualizar.sh <rama|commit>    construye y activa esa versión
#   ./deploy/actualizar.sh --migraciones-aplicadas [rama|commit]
#        igual, pero responde "sí" de antemano a la pregunta de las
#        migraciones (para quien ya las aplicó y las revisó; no uses esto
#        sin haberlo hecho)
#
# Qué hace, en orden:
#   1. Baja los cambios de GitHub (git fetch) y decide qué commit instalar.
#   2. Si ese commit trae MIGRACIONES nuevas respecto a la versión instalada,
#      avisa y se DETIENE hasta que confirmes que ya las aplicaste a mano.
#      Este script NUNCA toca la base de datos con cambios (el contrato del
#      proyecto lo prohíbe): sólo lee, para informarte.
#   3. Arma una carpeta nueva /opt/eli/releases/<commit>, instala dependencias
#      (npm ci --ignore-scripts: NO se ejecutan los scripts de instalación de
#      las dependencias) y compila (prisma generate + npm run build) con las
#      variables de /etc/eli/eli.env. Si algo falla, la versión que está
#      andando NO se toca.
#   4. Cambia el enlace /opt/eli/current a la carpeta nueva y reinicia el
#      servicio (antes hace "reset-failed", ver más abajo). Comprueba que
#      responde (la portada y, si se configuró, ELI_URL_SALUD_EXTRA). Si no
#      responde, vuelve solo a la versión anterior.
#   5. Conserva las últimas 3 versiones y borra las más viejas.
#
# Se puede correr varias veces sin problema: si esa versión ya está activa, no
# hace nada.
#
# NO la corras entre las 12:50 y las 13:20 UTC (hora de los crons diarios). Si
# la corres, los crons esperan a que termines (comparten el candado) y salen
# un poco tarde; no se pierden.
#
# Variable de uso real (opcional): ELI_URL_SALUD_EXTRA, una o más direcciones
# (separadas por espacios) que también tienen que responder bien, además de la
# portada. Pon ahí una página pública que toque la base de datos. Se puede
# dejar en /etc/eli/eli.env o escribir antes del comando.
#
# Variables SOLO PARA PRUEBAS (no hace falta tocarlas): ELI_RAIZ, ELI_ENV_FILE,
# ELI_CMD_INSTALAR, ELI_CMD_COMPILAR, ELI_CMD_REINICIAR, ELI_URL_SALUD,
# ELI_ESPERA_SALUD, ELI_PERMITIR_ROOT.

set -euo pipefail

DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source=lib-entorno.sh
source "$DIRECTORIO_DEL_SCRIPT/lib-entorno.sh"

RAIZ="${ELI_RAIZ:-/opt/eli}"
REPO="$RAIZ/repo"
RELEASES="$RAIZ/releases"
ACTUAL="$RAIZ/current"
ANTERIOR="$RAIZ/previous"
CONSERVAR=3
URL_SALUD="${ELI_URL_SALUD:-http://127.0.0.1:3000/}"
ESPERA_SALUD_SEGUNDOS="${ELI_ESPERA_SALUD:-60}"
# --ignore-scripts: npm NO ejecuta los scripts de instalación de las ~500
# dependencias (código de terceros que correría como el usuario "eli", con
# acceso a /etc/eli/eli.env, ~/.ssh y los respaldos). Probado: la compilación y
# el arranque no los necesitan; "prisma generate" baja sus propios motores.
CMD_INSTALAR="${ELI_CMD_INSTALAR:-npm ci --no-audit --no-fund --ignore-scripts}"
# prisma generate explícito (los scripts de @prisma/client no corrieron).
# "npm run build" lo vuelve a hacer; es rápido y deja la intención a la vista.
CMD_COMPILAR="${ELI_CMD_COMPILAR:-npx prisma generate && npm run build}"
# reset-failed ANTES de reiniciar: si la versión nueva murió al arrancar, la
# unidad quedó en "failed (start-limit-hit)" y systemd rechaza "restart" hasta
# limpiarla. Los dos comandos están permitidos en deploy/sudoers-eli. El
# reset-failed puede fallar sin consecuencias (por eso ";" y no "&&").
CMD_REINICIAR="${ELI_CMD_REINICIAR:-sudo -n systemctl reset-failed eli; sudo -n systemctl restart eli}"

MIGRACIONES_CONFIRMADAS=no
OBJETIVO="origin/main"
for argumento in "$@"; do
  case "$argumento" in
    --migraciones-aplicadas) MIGRACIONES_CONFIRMADAS=si ;;
    -h|--help) sed -n '2,44p' "${BASH_SOURCE[0]}"; exit 0 ;;
    -*) echo "Opción desconocida: $argumento" >&2; exit 2 ;;
    *) OBJETIVO="$argumento" ;;
  esac
done

mensaje() { printf '\n==> %s\n' "$*"; }
aviso() { printf '    AVISO: %s\n' "$*" >&2; }
fallo() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# --- 0. Comprobaciones previas ------------------------------------------------
if [[ "$(id -u)" -eq 0 && -z "${ELI_PERMITIR_ROOT:-}" ]]; then
  fallo "No corras esto como root: los archivos quedarían con dueño root y el servicio no podría escribir su caché. Entra como el usuario 'eli' (su - eli)."
fi
for herramienta in git node npm curl flock tar; do
  command -v "$herramienta" >/dev/null || fallo "Falta '$herramienta' (deploy/README.md, paso 3)."
done
[[ -d "$REPO/.git" ]] || fallo "No existe el clon del repositorio en $REPO (deploy/README.md, paso 5)."
[[ -r "$ARCHIVO_ENTORNO" ]] || fallo "No puedo leer $ARCHIVO_ENTORNO (deploy/README.md, paso 6; el usuario 'eli' tiene que poder leerlo)."
mkdir -p "$RELEASES"

exec 9>"$RAIZ/.candado"
flock -n 9 || fallo "Ya hay otra actualización en curso."

DISPONIBLE_KB="$(df --output=avail -k "$RAIZ" | tail -1 | tr -d ' ')"
if [[ "$DISPONIBLE_KB" -lt 3000000 ]]; then
  fallo "Queda poco espacio en disco (menos de 3 GB). Libera espacio antes (deploy/README.md, paso 15: 'df -h')."
fi

# --- 1. Qué versión instalar --------------------------------------------------
mensaje "Bajando los cambios de GitHub..."
git -C "$REPO" fetch origin --prune --tags --quiet || fallo "git fetch falló (¿la deploy key sigue activa en GitHub?)."
COMMIT="$(git -C "$REPO" rev-parse --verify --quiet "$OBJETIVO^{commit}")" || fallo "No encuentro '$OBJETIVO' en el repositorio."
CORTO="${COMMIT:0:12}"
echo "    Versión a instalar: $CORTO — $(git -C "$REPO" log -1 --format='%s' "$COMMIT")"

COMMIT_ACTUAL=""
if [[ -f "$ACTUAL/.commit" ]]; then
  COMMIT_ACTUAL="$(cat "$ACTUAL/.commit")"
  echo "    Versión instalada ahora:  ${COMMIT_ACTUAL:0:12}"
fi

if [[ "$COMMIT" == "$COMMIT_ACTUAL" ]]; then
  mensaje "Esa versión ya está activa. No hay nada que hacer."
  exit 0
fi

# --- 2. Migraciones: avisar y detenerse --------------------------------------
# Las migraciones se aplican A MANO con psql (README.md, "Migraciones en
# producción"). Acá sólo se detecta si hay nuevas y, de forma opcional y de
# sólo lectura, se mira en la base cuáles ya constan como aplicadas.
migraciones_nuevas() {
  if [[ -n "$COMMIT_ACTUAL" ]] && git -C "$REPO" cat-file -e "$COMMIT_ACTUAL^{commit}" 2>/dev/null; then
    git -C "$REPO" diff --name-only --diff-filter=AMR "$COMMIT_ACTUAL" "$COMMIT" -- prisma/migrations |
      awk -F/ 'NF >= 4 { print $3 }' | sort -u
  else
    git -C "$REPO" ls-tree -d --name-only "$COMMIT" prisma/migrations/ 2>/dev/null |
      awk -F/ '{ print $3 }' | sort -u
  fi
}

estado_en_la_base() {
  # Imprime las migraciones (de la lista recibida por stdin) que NO constan
  # como terminadas en la tabla _prisma_migrations. Sólo lectura. Si no se
  # puede consultar, no imprime nada y sale con 1.
  command -v psql >/dev/null || return 1
  (
    cargar_entorno "$ARCHIVO_ENTORNO" DIRECT_URL >/dev/null 2>&1 || exit 1
    conexion_desde_url DIRECT_URL 2>/dev/null || exit 1
    aplicadas="$(PGCONNECT_TIMEOUT=10 psql -v ON_ERROR_STOP=1 -Atqc \
      "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null" 2>/dev/null)" || exit 1
    while IFS= read -r nombre; do
      [[ -n "$nombre" ]] || continue
      grep -qxF "$nombre" <<<"$aplicadas" || echo "$nombre"
    done
  )
}

MIGRACIONES="$(migraciones_nuevas || true)"
PRIMERA_VEZ=no
[[ -z "$COMMIT_ACTUAL" ]] && PRIMERA_VEZ=si

if [[ "$PRIMERA_VEZ" == "si" || -n "$MIGRACIONES" ]]; then
  if [[ "$PRIMERA_VEZ" == "si" ]]; then
    mensaje "PRIMER DESPLIEGUE en este servidor: no sé qué versión corría antes."
    echo "    Este script no puede saber qué migraciones faltan. La base tiene que tener"
    echo "    aplicadas TODAS las de prisma/migrations de esta versión."
  else
    mensaje "ESTA VERSIÓN TRAE MIGRACIONES NUEVAS DE LA BASE DE DATOS:"
    sed 's/^/      - /' <<<"$MIGRACIONES"
    echo "    Este script NO las aplica. Se aplican a mano, con respaldo antes y fuera"
    echo "    del horario de atención: README.md, sección 'Migraciones en producción'."
    echo "    Cada migración dice si va ANTES de desplegar (casi siempre) o después."
  fi
  if PENDIENTES="$(estado_en_la_base <<<"$MIGRACIONES")"; then
    if [[ -z "$PENDIENTES" ]]; then
      echo "    Consulta de solo lectura a la base: todas constan como aplicadas."
    else
      aviso "La base NO tiene registradas como aplicadas:"
      sed 's/^/        - /' <<<"$PENDIENTES" >&2
      aviso "(Si ya las aplicaste pero no corriste 'npx prisma migrate resolve --applied ...', sale así.)"
    fi
  else
    aviso "No pude consultar la base para verificarlo; confía sólo en lo que tú sepas."
  fi

  if [[ "$MIGRACIONES_CONFIRMADAS" == "si" ]]; then
    echo "    Se usó --migraciones-aplicadas: se da por confirmado."
  elif [[ -t 0 ]]; then
    echo
    echo "    Para continuar, escribe exactamente:  YA APLIQUE LAS MIGRACIONES"
    echo "    (cualquier otra cosa cancela; no se cambia nada)"
    read -r -p "    > " RESPUESTA
    if [[ "$RESPUESTA" != "YA APLIQUE LAS MIGRACIONES" ]]; then
      fallo "Cancelado. No se cambió nada. Aplica las migraciones y vuelve a correr este script."
    fi
  else
    fallo "Hay migraciones y no hay una persona para confirmarlas. Aplícalas y corre de nuevo con --migraciones-aplicadas."
  fi
else
  echo "    Sin migraciones nuevas respecto a la versión instalada."
fi

# --- 3. Armar la versión nueva ------------------------------------------------
DESTINO="$RELEASES/$CORTO"
if [[ -f "$DESTINO/.listo" ]]; then
  mensaje "La carpeta $DESTINO ya estaba construida. Se reutiliza."
else
  CONSTRUYENDO="$RELEASES/$CORTO.construyendo"
  rm -rf "$CONSTRUYENDO"
  [[ -e "$DESTINO" ]] && rm -rf "$DESTINO"   # restos de un intento anterior sin terminar
  mkdir -p "$CONSTRUYENDO"
  trap 'rm -rf "$CONSTRUYENDO"' EXIT

  mensaje "Copiando el código de $CORTO..."
  git -C "$REPO" archive "$COMMIT" | tar -x -C "$CONSTRUYENDO"
  echo "$COMMIT" > "$CONSTRUYENDO/.commit"

  mensaje "Instalando dependencias (npm ci)... suele tardar 1-3 minutos."
  # Sin NODE_ENV=production: con él npm omite las dependencias de desarrollo
  # (typescript, tailwind, prisma) que SÍ hacen falta para compilar.
  # OJO, para no engañarse: aquí NO se cargan las variables de eli.env, pero eso
  # NO protege nada por sí solo: todo lo que corre aquí corre como el usuario
  # "eli", que puede leer /etc/eli/eli.env (permiso 640, grupo eli), ~/.ssh y
  # /var/backups/eli directamente. La defensa real es --ignore-scripts (no corre
  # el código de instalación de las dependencias) y, a futuro, separar el usuario
  # que construye del que sirve (README.md, "Mejoras futuras").
  ( cd "$CONSTRUYENDO" && env -u NODE_ENV bash -c "$CMD_INSTALAR" ) || fallo "npm ci falló. La versión instalada no se tocó."

  mensaje "Compilando (prisma generate + npm run build)... suele tardar 1-3 minutos."
  # Con las variables de eli.env (prisma.config.ts exige DATABASE_URL).
  ( cd "$CONSTRUYENDO" && cargar_entorno "$ARCHIVO_ENTORNO" && bash -c "$CMD_COMPILAR" ) || fallo "La compilación falló. La versión instalada no se tocó."

  touch "$CONSTRUYENDO/.listo"
  mv -T "$CONSTRUYENDO" "$DESTINO"
  trap - EXIT
  echo "    Compilado bien: $DESTINO"
fi

# --- 4. Activar, reiniciar, comprobar, y volver si falla ----------------------
# esperar_salud (lib-entorno.sh): la portada y las ELI_URL_SALUD_EXTRA.
apuntar_a() {
  # Cambio atómico del enlace: nunca hay un instante sin "current".
  ln -sfn "$1" "$RAIZ/current.nuevo"
  mv -T "$RAIZ/current.nuevo" "$ACTUAL"
}

DIR_ANTERIOR=""
[[ -L "$ACTUAL" ]] && DIR_ANTERIOR="$(readlink -f "$ACTUAL")"

mensaje "Activando la versión nueva y reiniciando el servicio..."
apuntar_a "$DESTINO"
if bash -c "$CMD_REINICIAR" && esperar_salud; then
  if [[ -n "$DIR_ANTERIOR" && "$DIR_ANTERIOR" != "$DESTINO" ]]; then
    ln -sfn "$DIR_ANTERIOR" "$RAIZ/previous.nuevo"
    mv -T "$RAIZ/previous.nuevo" "$ANTERIOR"
  fi
  mensaje "Listo: Eli corre la versión $CORTO."
else
  printf '\nERROR: la versión nueva NO respondió bien.\n' >&2
  journalctl -u eli -n 25 --no-pager 2>/dev/null | sed 's/^/    | /' >&2 || true
  if [[ -n "$DIR_ANTERIOR" && -d "$DIR_ANTERIOR" ]]; then
    mensaje "Volviendo a la versión anterior ($(basename "$DIR_ANTERIOR"))..."
    apuntar_a "$DIR_ANTERIOR"
    # CMD_REINICIAR empieza con "reset-failed": si la versión nueva agotó el
    # límite de arranques de systemd ("start-limit-hit"), sin eso este reinicio
    # sería rechazado y el regreso automático fallaría.
    if bash -c "$CMD_REINICIAR" && esperar_salud; then
      fallo "La versión nueva falló y se VOLVIÓ a la anterior (que responde bien). Revisa: journalctl -u eli -n 100 --no-pager"
    fi
    fallo "La versión nueva falló Y la anterior tampoco responde. Mira deploy/README.md, paso 15."
  fi
  fallo "La versión nueva no responde y no hay versión anterior a la que volver. Mira deploy/README.md, paso 15."
fi

# --- 5. Limpieza: conservar las últimas $CONSERVAR versiones ------------------
mensaje "Limpiando versiones viejas (se conservan las últimas $CONSERVAR)..."
ACTIVA="$(readlink -f "$ACTUAL")"
PREVIA="$( [[ -L "$ANTERIOR" ]] && readlink -f "$ANTERIOR" || true )"
mapfile -t TODAS < <(
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9a-f]{12}' -printf '%T@ %p\n' |
    sort -rn | cut -d' ' -f2-
)
CONTADOR=0
for carpeta in "${TODAS[@]}"; do
  CONTADOR=$((CONTADOR + 1))
  if [[ "$carpeta" == "$ACTIVA" || "$carpeta" == "$PREVIA" || "$CONTADOR" -le "$CONSERVAR" ]]; then
    continue
  fi
  echo "    Borrando $(basename "$carpeta")"
  rm -rf -- "$carpeta"
done
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -name '*.construyendo' -exec rm -rf -- {} +
echo "    Versiones guardadas: $(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | wc -l)"
