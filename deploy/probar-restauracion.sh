#!/usr/bin/env bash
# Prueba que un respaldo SIRVE, restaurándolo en una base de PRUEBA.
#
#   ./probar-restauracion.sh [archivo.dump]      (por defecto: ultimo.dump)
#
# Pide por pantalla (sin mostrarla) la URL de una base de datos de prueba
# VACÍA. NUNCA restaura sobre producción; se niega si:
#   - la base de prueba es la misma (servidor + nombre) que DATABASE_URL o
#     DIRECT_URL del archivo de variables, o
#   - la base de prueba ya tiene tablas (tiene que estar vacía).
#
# La URL de prueba no se guarda en ningún lado ni pasa por la línea de comandos.

set -euo pipefail
umask 077

ETIQUETA="eli-restauracion"
DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source=lib-entorno.sh
source "$DIRECTORIO_DEL_SCRIPT/lib-entorno.sh"

falla() { registrar "$ETIQUETA" err "ERROR: $*"; exit 1; }

ARCHIVO="${1:-${ELI_RESPALDOS:-/var/backups/eli}/ultimo.dump}"
[[ -s "$ARCHIVO" ]] || falla "No encuentro el respaldo '$ARCHIVO' (o está vacío)."
command -v pg_restore >/dev/null && command -v psql >/dev/null || falla "Faltan psql / pg_restore (deploy/README.md, paso 3)."

# "servidor/base" de una URL, sin el '-pooler' (el pooler y el directo de Neon
# son la misma base).
huella_de() {
  ELI_U="$1" node -e '
    try {
      const u = new URL(process.env.ELI_U);
      const h = u.hostname.replace(/-pooler/, "").toLowerCase();
      console.log(h + ":" + (u.port || "5432") + "/" + decodeURIComponent(u.pathname.replace(/^\//, "")));
    } catch { process.exit(1); }
  '
}

cargar_entorno "$ARCHIVO_ENTORNO" DATABASE_URL DIRECT_URL || falla "No pude leer $ARCHIVO_ENTORNO."
HUELLA_DATABASE="$(huella_de "${DATABASE_URL:-}")" || falla "DATABASE_URL del archivo de variables no se pudo interpretar."
HUELLA_DIRECT="$(huella_de "${DIRECT_URL:-}")" || falla "DIRECT_URL del archivo de variables no se pudo interpretar."
unset DATABASE_URL DIRECT_URL

echo "Respaldo a probar: $ARCHIVO"
echo "Pega la URL de la base de PRUEBA (vacía) y pulsa Enter. No se verá lo que pegues."
read -rs -p "URL de la base de prueba: " URL_DE_PRUEBA
echo

HUELLA_PRUEBA="$(huella_de "$URL_DE_PRUEBA")" || falla "Esa no es una URL de Postgres válida."
if [[ "$HUELLA_PRUEBA" == "$HUELLA_DATABASE" || "$HUELLA_PRUEBA" == "$HUELLA_DIRECT" ]]; then
  falla "Esa base ($HUELLA_PRUEBA) es la de PRODUCCIÓN. No se toca. Crea una base de prueba aparte (deploy/README.md, paso 11)."
fi

conexion_desde_url URL_DE_PRUEBA || falla "No pude interpretar la URL de prueba."
unset URL_DE_PRUEBA

TABLAS="$(psql -v ON_ERROR_STOP=1 -Atqc "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")" \
  || falla "No pude conectarme a la base de prueba."
if [[ "$TABLAS" != "0" ]]; then
  falla "La base de prueba '$PGDATABASE' ya tiene $TABLAS tablas. Tiene que estar VACÍA (crea una nueva)."
fi

registrar "$ETIQUETA" info "Restaurando $ARCHIVO en la base de prueba '$PGDATABASE' de $PGHOST..."
# --dbname lleva sólo el NOMBRE; el servidor, usuario y clave salen de las PG*.
# Sin --dbname, pg_restore escribiría el SQL en pantalla en vez de restaurar.
pg_restore --dbname="$PGDATABASE" --no-owner --no-privileges --exit-on-error "$ARCHIVO" \
  || falla "La restauración falló. Este respaldo NO está bien: revisa el mensaje de arriba."

TABLAS_DESPUES="$(psql -Atqc "select count(*) from information_schema.tables where table_schema = 'public'")"
echo
echo "Restauración terminada. Tablas en la base de prueba: $TABLAS_DESPUES"
echo "Filas en las tablas principales (compáralas con el panel de Neon / tu sentido común):"
for tabla in negocios usuarios clientes citas; do
  if filas="$(psql -Atqc "select count(*) from \"$tabla\"" 2>/dev/null)"; then
    printf '  %-12s %s\n' "$tabla" "$filas"
  fi
done
registrar "$ETIQUETA" info "Prueba de restauración OK. Ahora puedes BORRAR la base de prueba."
