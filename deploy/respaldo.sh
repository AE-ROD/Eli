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
# - Comprueba que el archivo sirve antes de darlo por bueno y de borrar
#   respaldos viejos: no vacío, que pg_restore lo puede leer, y que las tablas
#   clave (usuarios, negocios, citas) traen casi tantas filas como la base en
#   este momento (un volcado cortado o vacío no pasa).
# - Borra los respaldos con más de 14 días (336 horas; ELI_RETENCION_DIAS). En
#   la práctica quedan 14 o 15 archivos.
# - Cualquier problema sale con código distinto de 0, queda en el registro
#   (journalctl -t eli-respaldo) y manda UN correo al día a SOPORTE_EMAIL con la
#   API de Resend (lib-entorno.sh, avisar_por_correo). Si faltan las variables
#   de Resend en eli.env, sólo queda en el registro.
#   OJO: avisa cuando FALLA; si cron deja de correr del todo, no hay quien avise
#   (por eso la guía pide mirar a mano cada mes que el último .dump sea reciente).
#
# Variables opcionales: ELI_RESPALDOS (carpeta), ELI_RETENCION_DIAS (14).
# Sólo para pruebas: ELI_ENV_FILE, ELI_DIR_AVISOS, ELI_URL_RESEND.

set -euo pipefail
umask 077

ETIQUETA="eli-respaldo"
DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source=lib-entorno.sh
source "$DIRECTORIO_DEL_SCRIPT/lib-entorno.sh"

DESTINO="${ELI_RESPALDOS:-/var/backups/eli}"
RETENCION_DIAS="${ELI_RETENCION_DIAS:-14}"

info() { registrar "$ETIQUETA" info "$*"; }
ULTIMO_ERROR=""
falla() { ULTIMO_ERROR="$*"; registrar "$ETIQUETA" err "ERROR: $*"; exit 1; }

# Al salir (bien o mal): borra el archivo parcial y, si terminó con error,
# avisa por correo. Va en un solo EXIT para cubrir también las salidas que no
# pasan por falla() (p. ej. un comando que aborta por "set -e").
TEMPORAL=""
al_salir() {
  local codigo=$?
  [[ -n "$TEMPORAL" ]] && rm -f "$TEMPORAL"
  if [[ "$codigo" -ne 0 ]]; then
    avisar_por_correo respaldo "Eli: FALLÓ el respaldo de la base de datos" \
"El respaldo nocturno de la base de datos no se completó ($(date -u '+%Y-%m-%d %H:%M UTC')).

${ULTIMO_ERROR:-El script terminó con un error inesperado (código $codigo).}

Mientras no se arregle, el último respaldo bueno es el de antes. Entra al servidor y mira:
  journalctl -t eli-respaldo --since today --no-pager
  ls -lh /var/backups/eli
y la guía: deploy/README.md, pasos 11 y 15.

Este aviso se manda como mucho una vez al día." || true
  fi
}
trap al_salir EXIT

[[ "$RETENCION_DIAS" =~ ^[0-9]+$ && "$RETENCION_DIAS" -ge 1 ]] || falla "ELI_RETENCION_DIAS debe ser un número de días (1 o más)."
command -v pg_dump >/dev/null || falla "No está pg_dump. Instala postgresql-client-XX (deploy/README.md, paso 3)."
command -v pg_restore >/dev/null || falla "No está pg_restore."
command -v psql >/dev/null || falla "No está psql (viene con postgresql-client-XX: deploy/README.md, paso 3)."
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

info "Empieza el respaldo de la base '$PGDATABASE' en $PGHOST."
if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$TEMPORAL"; then
  falla "pg_dump falló (revisa el mensaje de arriba; si dice 'server version mismatch', el postgresql-client instalado es más viejo que el Postgres de Neon: deploy/README.md, paso 3)."
fi

# Verificación: no vacío, legible, y con datos de tablas adentro.
[[ -s "$TEMPORAL" ]] || falla "El respaldo quedó vacío."
INDICE="$(pg_restore --list "$TEMPORAL")" || falla "pg_restore no puede leer el respaldo recién hecho."
TABLAS="$(grep -c ' TABLE DATA ' <<<"$INDICE" || true)"
[[ "$TABLAS" -ge 1 ]] || falla "El respaldo no trae ninguna tabla con datos."

# Filas de las tablas clave: las del respaldo contra las de la base ahora. La
# base sigue en uso mientras se respalda, así que no tienen que ser idénticas;
# sí tiene que haber casi todas. Falla si el respaldo trae menos del 95 % de las
# filas (y faltan más de 5), o 0 filas cuando la base tiene. Si una tabla no se
# puede contar (p. ej. se renombró) sólo se avisa en el registro.
for tabla in usuarios negocios citas; do
  EN_EL_RESPALDO="$(pg_restore --data-only --schema=public --table="$tabla" --file=- "$TEMPORAL" | awk '/^COPY /{d=1; next} /^\\\.$/{d=0} d{n++} END{print n+0}')" ||
    falla "No pude leer la tabla '$tabla' del respaldo recién hecho."
  if ! EN_LA_BASE="$(psql -v ON_ERROR_STOP=1 -Atqc "select count(*) from public.\"$tabla\"" 2>/dev/null)"; then
    registrar "$ETIQUETA" warning "No pude contar las filas de '$tabla' en la base; no se compara esa tabla (¿cambió el nombre? revisa deploy/respaldo.sh)."
    continue
  fi
  if (( EN_LA_BASE > 0 && EN_EL_RESPALDO == 0 )) || (( EN_EL_RESPALDO * 100 < EN_LA_BASE * 95 && EN_LA_BASE - EN_EL_RESPALDO > 5 )); then
    falla "El respaldo trae $EN_EL_RESPALDO filas de '$tabla' y la base tiene $EN_LA_BASE: el respaldo está incompleto."
  fi
  info "Filas de '$tabla': $EN_EL_RESPALDO en el respaldo, $EN_LA_BASE en la base."
done

chmod 600 "$TEMPORAL"
mv "$TEMPORAL" "$FINAL"
ln -sfn "$FINAL" "$DESTINO/ultimo.dump"
TAMANO="$(du -h "$FINAL" | cut -f1)"
info "Respaldo listo y verificado: $FINAL ($TAMANO, $TABLAS tablas con datos)."

# Retención: recién ahora, con el respaldo nuevo a salvo, se borran los viejos.
# -mmin (minutos) y no -mtime: "-mtime +14" borra desde los 15 días cumplidos
# (find redondea hacia abajo); así "más de 14 días" es literalmente eso.
find "$DESTINO" -maxdepth 1 -type f \( -name 'eli-*.dump' -o -name 'eli-*.dump.parcial' \) -mmin "+$((RETENCION_DIAS * 1440))" -print -delete |
  while IFS= read -r viejo; do info "Borrado por antiguo (más de $RETENCION_DIAS días): $viejo"; done

info "Quedan $(find "$DESTINO" -maxdepth 1 -type f -name 'eli-*.dump' | wc -l) respaldos en $DESTINO."
