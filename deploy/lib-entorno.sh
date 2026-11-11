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

# ---------------------------------------------------------------------------
# Comprobación de salud (la usan actualizar.sh y volver-atras.sh)
# ---------------------------------------------------------------------------

# urls_de_salud
# Imprime, una por línea, las direcciones que tienen que responder 2xx/3xx para
# dar por sana una versión: la principal (URL_SALUD, por defecto la portada
# "/") y las EXTRA de ELI_URL_SALUD_EXTRA (separadas por espacios), que puede
# venir del entorno del comando o de /etc/eli/eli.env.
#
# Por qué una extra: "/" no toca la base de datos. Una versión que arranca pero
# no puede hablar con Neon respondería 200 en "/" y se daría por buena. Conviene
# una página pública que sí consulte la base, p. ej.
#   ELI_URL_SALUD_EXTRA=http://127.0.0.1:3000/reservar/<slug-de-un-negocio-real>
# (README.md, paso 14). Si ese negocio se borra o cambia de slug, la página da
# 404 y las actualizaciones volverían atrás solas: actualiza la línea.
urls_de_salud() {
  printf '%s\n' "${URL_SALUD:-http://127.0.0.1:3000/}"
  local extra="${ELI_URL_SALUD_EXTRA:-}" url
  local -a lista=()
  if [[ -z "$extra" ]]; then
    extra="$( ( cargar_entorno "$ARCHIVO_ENTORNO" ELI_URL_SALUD_EXTRA >/dev/null 2>&1 && printf '%s' "${ELI_URL_SALUD_EXTRA:-}" ) || true )"
  fi
  read -ra lista <<<"$extra"
  for url in "${lista[@]}"; do
    if [[ "$url" == http://* || "$url" == https://* ]]; then
      printf '%s\n' "$url"
    else
      echo "    AVISO: ignoro ELI_URL_SALUD_EXTRA '$url' (debe empezar con http:// o https://)." >&2
    fi
  done
}

# esperar_salud
# Espera hasta ESPERA_SALUD_SEGUNDOS (60) a que TODAS las direcciones de
# urls_de_salud respondan 2xx/3xx. Sale con 0 si responden, 1 si no.
esperar_salud() {
  local limite=$((SECONDS + ${ESPERA_SALUD_SEGUNDOS:-60})) url codigo sana
  local -a urls=() resultado=()
  mapfile -t urls < <(urls_de_salud)
  while (( SECONDS < limite )); do
    sana=si
    resultado=()
    for url in "${urls[@]}"; do
      codigo="$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "$url" || true)"
      resultado+=("$codigo $url")
      [[ "$codigo" =~ ^[23][0-9][0-9]$ ]] || sana=no
    done
    if [[ "$sana" == si ]]; then
      for url in "${resultado[@]}"; do echo "    Responde ($url)"; done
      return 0
    fi
    sleep 2
  done
  for url in "${resultado[@]}"; do echo "    Última respuesta: $url" >&2; done
  return 1
}

# ---------------------------------------------------------------------------
# Aviso por correo cuando algo automático falla (respaldo, crons)
# ---------------------------------------------------------------------------

# avisar_por_correo CLAVE ASUNTO TEXTO
# Manda un correo a SOPORTE_EMAIL con la API de Resend (el mismo servicio y las
# mismas variables que ya usa Eli: RESEND_API_KEY, RESEND_FROM_EMAIL,
# SOPORTE_EMAIL, leídas de /etc/eli/eli.env). Es lo único que avisa si un
# respaldo o un cron falla de noche: sin esto, el fallo queda sólo en el
# registro del sistema y nadie lo ve.
#
#  - TOPE: como mucho UN correo por CLAVE y por día (UTC). Un archivo en
#    ELI_DIR_AVISOS (por defecto ~/.eli-avisos, o sea /home/eli/.eli-avisos)
#    guarda la fecha del último correo ENVIADO CON ÉXITO; si el envío falla, el
#    siguiente intento lo vuelve a probar. Está en el HOME del usuario que corre
#    cron y NO en /var/backups/eli a propósito: lo que más importa avisar es que
#    esa carpeta no exista o no se pueda escribir, y el aviso no puede depender
#    de ella.
#  - Si faltan las tres variables o no se puede escribir el archivo de estado,
#    NO se manda nada: sólo se deja constancia en el registro.
#  - Nunca hace fallar al script que lo llama, y nunca dura más de ~25 s.
#  - La clave de Resend no aparece en "ps" (curl la lee por la entrada
#    estándar, como llamar-cron.sh con CRON_SECRET) ni en ningún registro; el
#    correo lleva sólo el mensaje corto de error, nunca datos de clientes.
#  - ELI_URL_RESEND sólo existe para las pruebas.
avisar_por_correo() {
  local clave="$1" asunto="$2" texto="$3"
  local carpeta="${ELI_DIR_AVISOS:-${HOME:-/var/tmp}/.eli-avisos}"
  local hoy previo
  [[ "$clave" =~ ^[a-z0-9-]+$ ]] || return 0
  hoy="$(date -u +%Y-%m-%d)"
  if ! { mkdir -p "$carpeta" && chmod 700 "$carpeta" && [[ -w "$carpeta" ]]; } 2>/dev/null; then
    registrar eli-aviso warning "No puedo escribir en $carpeta: no mando el aviso por correo '$asunto' (queda sólo en el registro)."
    return 0
  fi
  previo="$(cat "$carpeta/$clave" 2>/dev/null || true)"
  if [[ "$previo" == "$hoy" ]]; then
    registrar eli-aviso info "Ya se avisó hoy por correo de '$clave'; no se repite."
    return 0
  fi
  if ( enviar_correo_de_aviso "$asunto" "$texto" ); then
    printf '%s\n' "$hoy" > "$carpeta/$clave" 2>/dev/null || true
    registrar eli-aviso info "Aviso por correo enviado: $asunto"
  else
    registrar eli-aviso warning "No pude mandar el aviso por correo '$asunto' (¿faltan RESEND_API_KEY, RESEND_FROM_EMAIL o SOPORTE_EMAIL en $ARCHIVO_ENTORNO, o Resend no respondió?)."
  fi
  return 0
}

# enviar_correo_de_aviso ASUNTO TEXTO
# Se corre SIEMPRE en un subshell (los secretos no quedan en el script que
# llama). Sale con 0 sólo si Resend respondió 2xx.
enviar_correo_de_aviso() {
  local asunto="$1" texto="$2" cuerpo codigo clave_escapada
  cargar_entorno "$ARCHIVO_ENTORNO" RESEND_API_KEY RESEND_FROM_EMAIL SOPORTE_EMAIL >/dev/null 2>&1 || return 1
  [[ -n "${RESEND_API_KEY:-}" && -n "${RESEND_FROM_EMAIL:-}" && -n "${SOPORTE_EMAIL:-}" ]] || return 1
  command -v node >/dev/null && command -v curl >/dev/null || return 1
  cuerpo="$(mktemp)"
  # shellcheck disable=SC2064  # se quiere expandir $cuerpo ahora
  trap "rm -f '$cuerpo'" EXIT
  # JSON armado por node (escapa bien comillas, saltos de línea y acentos). El
  # asunto y el texto viajan por el entorno de node, no por su línea de comandos.
  ELI_ASUNTO="$asunto" ELI_TEXTO="$texto" node -e '
    const e = process.env;
    process.stdout.write(JSON.stringify({
      from: e.RESEND_FROM_EMAIL,
      to: [e.SOPORTE_EMAIL],
      subject: e.ELI_ASUNTO,
      text: e.ELI_TEXTO,
    }));
  ' > "$cuerpo" || return 1
  clave_escapada="${RESEND_API_KEY//\\/\\\\}"
  clave_escapada="${clave_escapada//\"/\\\"}"
  unset RESEND_API_KEY
  codigo="$(
    printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$clave_escapada" |
      curl --silent --config - --max-time 20 --output /dev/null --write-out '%{http_code}' \
        --data-binary "@$cuerpo" "${ELI_URL_RESEND:-https://api.resend.com/emails}" 2>/dev/null
  )" || codigo="000"
  [[ "$codigo" =~ ^2[0-9][0-9]$ ]]
}
