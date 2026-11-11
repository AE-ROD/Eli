#!/usr/bin/env bash
# Funciones compartidas por los scripts de deploy/. NO se ejecuta solo: los
# otros scripts la cargan con "source".
#
# Por qué no hacer simplemente "source /etc/eli/eli.env":
#  - systemd lee ese archivo con su propia sintaxis (sin expandir $ ni tratar
#    & ; | como operadores). Bash sí. Una DATABASE_URL de Neon trae "&"
#    (…?sslmode=require&channel_binding=require): con "source" bash la
#    cortaría y la mandaría a segundo plano. Acá se lee línea por línea, como
#    systemd, sin interpretar nada.
#  - Así los secretos tampoco pasan por la línea de comandos de ningún proceso
#    (lo que se vería con "ps").

# El archivo de variables. Se puede cambiar con ELI_ENV_FILE (para pruebas).
ARCHIVO_ENTORNO="${ELI_ENV_FILE:-/etc/eli/eli.env}"

# cargar_entorno [archivo] [CLAVE ...]
# Exporta las variables del archivo (o sólo las CLAVE nombradas).
cargar_entorno() {
  local archivo="${1:-$ARCHIVO_ENTORNO}"
  shift || true
  local solo=" $* "
  local linea clave valor
  if [[ ! -r "$archivo" ]]; then
    echo "No puedo leer $archivo (¿existe? ¿este usuario tiene permiso?)." >&2
    return 1
  fi
  while IFS= read -r linea || [[ -n "$linea" ]]; do
    linea="${linea%$'\r'}"
    linea="${linea#"${linea%%[![:space:]]*}"}"
    [[ -z "$linea" || "$linea" == \#* || "$linea" == \;* ]] && continue
    [[ "$linea" == *=* ]] || continue
    clave="${linea%%=*}"
    valor="${linea#*=}"
    valor="${valor%"${valor##*[![:space:]]}"}"
    [[ "$clave" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$valor" =~ ^\"(.*)\"$ ]]; then
      valor="${BASH_REMATCH[1]}"
    elif [[ "$valor" =~ ^\'(.*)\'$ ]]; then
      valor="${BASH_REMATCH[1]}"
    fi
    if [[ "$solo" != "  " && "$solo" != *" $clave "* ]]; then
      continue
    fi
    export "$clave=$valor"
  done < "$archivo"
}

# conexion_desde_url NOMBRE_DE_VARIABLE
# Toma la URL de Postgres guardada en la variable NOMBRE_DE_VARIABLE y exporta
# PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE (y
# PGCHANNELBINDING si la URL lo trae). psql, pg_dump y pg_restore leen esas
# variables solas. Así la contraseña NUNCA va en la línea de comandos (donde
# "ps" la mostraría a cualquiera en el servidor). La URL llega a node por el
# entorno, no por argumentos, por lo mismo.
conexion_desde_url() {
  local nombre="$1" salida
  salida="$(
    ELI_URL_A_PARSEAR="${!nombre:-}" node -e '
      const crudo = process.env.ELI_URL_A_PARSEAR;
      if (!crudo) { console.error("La variable está vacía."); process.exit(1); }
      let u;
      try { u = new URL(crudo); } catch { console.error("No es una URL válida."); process.exit(1); }
      if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
        console.error("No es una URL de Postgres (debe empezar con postgresql://)."); process.exit(1);
      }
      const q = (v) => "\x27" + String(v).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
      const base = decodeURIComponent(u.pathname.replace(/^\//, ""));
      const salida = [
        ["PGHOST", u.hostname],
        ["PGPORT", u.port || "5432"],
        ["PGUSER", decodeURIComponent(u.username)],
        ["PGPASSWORD", decodeURIComponent(u.password)],
        ["PGDATABASE", base],
        ["PGSSLMODE", u.searchParams.get("sslmode") || "require"],
      ];
      const canal = u.searchParams.get("channel_binding");
      if (canal) salida.push(["PGCHANNELBINDING", canal]);
      if (!u.hostname || !base) { console.error("Falta el servidor o el nombre de la base."); process.exit(1); }
      for (const [k, v] of salida) console.log("export " + k + "=" + q(v));
    '
  )" || return 1
  eval "$salida"
}

# Escribe a la pantalla (stderr) y al registro del sistema (journald), con una
# etiqueta. Los scripts que corren desde cron no tienen pantalla: el registro es
# lo único que queda ("journalctl -t <etiqueta>").
registrar() {
  local etiqueta="$1" prioridad="$2"
  shift 2
  echo "[$etiqueta] $*" >&2
  logger -t "$etiqueta" -p "user.$prioridad" -- "$*" 2>/dev/null || true
}
