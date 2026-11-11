#!/usr/bin/env bash
# Prueba, con un nginx de verdad, que un cliente NO puede elegir la IP que ve la
# app (la que usa el rate limit: lib/rate-limit.ts, obtenerIp) y que /api/cron
# da 404 desde afuera.
#
#   ./deploy/probar-cabeceras.sh                                   prueba el archivo del repo
#   ./deploy/probar-cabeceras.sh /etc/nginx/sites-available/eliagenda   prueba el INSTALADO
#
# En el servidor conviene probar el instalado (el que de verdad atiende), no
# sólo el del repo: Certbot lo reescribe al poner el HTTPS (README, paso 9.6) y
# esta prueba verifica que lo que quedó sigue pisando las cabeceras de IP.
#
# NO TOCA el nginx de producción (el que sirve sistemaone.com): levanta OTRO
# nginx, de prueba, con su propia configuración, su pid y sus registros en un
# directorio temporal, escuchando sólo en 127.0.0.1:38080. No usa
# /etc/nginx/nginx.conf, no hace reload ni stop del nginx del sistema, no usa
# sudo y no abre los puertos 80/443.
#
# Qué hace:
#   0. Revisa el TEXTO del archivo: nada de "listen [::]", ni "default_server",
#      ni "$proxy_add_x_forwarded_for", ni módulo realip.
#   1. Extrae del archivo el bloque "server { ... }" que hace proxy a
#      127.0.0.1:3000 (el REAL, con su proxy_set_header, su location de /api/cron,
#      su add_header y su client_max_body_size), le quita sólo lo que depende del
#      servidor (listen, server_name, certificados) y le cambia el 3000 por el
#      puerto de un servidor "eco" de juguete en Node (127.0.0.1:38081), que
#      responde con las cabeceras que le llegaron.
#   2. Hace pedidos mintiendo en X-Vercel-Forwarded-For, X-Real-IP,
#      X-Forwarded-For, Forwarded, True-Client-IP y CF-Connecting-IP (también en
#      minúsculas, repetidas y con un "Connection:" que las nombra) y exige que
#      al eco sólo le llegue la IP real de la conexión (127.0.0.1 en esta
#      prueba), nunca lo inventado.
#   3. Comprueba que las variantes de /api/cron dan 404 SIN llegar al eco, que el
#      resto sí llega, que HSTS sale también en el 404, que el cuerpo grande se
#      corta con 413 y que no se anuncia la versión de nginx.
#   4. Apaga todo lo que levantó.
#
# Necesita: nginx (el binario; con "apt install nginx" ya está), node, curl, awk.
# Corre como el usuario eli (no hace falta sudo). Sale con 0 sólo si pasa todo.

set -euo pipefail

DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
ARCHIVO="${1:-$DIRECTORIO_DEL_SCRIPT/nginx-eliagenda.conf}"
PUERTO_NGINX=38080
PUERTO_ECO=38081

fallo() { printf '\nFALLÓ: %s\n' "$*" >&2; exit 1; }

NGINX="$(command -v nginx || true)"
[[ -z "$NGINX" && -x /usr/sbin/nginx ]] && NGINX=/usr/sbin/nginx
[[ -n "$NGINX" ]] || fallo "Falta 'nginx' (sudo apt install nginx; ya está en el VPS)."
for herramienta in node curl awk sed; do
  command -v "$herramienta" >/dev/null || fallo "Falta '$herramienta'."
done
[[ -r "$ARCHIVO" ]] || fallo "No puedo leer $ARCHIVO."
echo "Probando: $ARCHIVO"
echo "Con: $("$NGINX" -v 2>&1)"

TEMPORAL="$(mktemp -d)"
PIDS=()
limpiar() {
  for pid in "${PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done
  rm -rf "$TEMPORAL"
}
trap limpiar EXIT

ERRORES=0
comprobar() {
  local descripcion="$1" condicion="$2"
  if eval "$condicion"; then
    echo "  OK    $descripcion"
  else
    echo "  FALLA $descripcion"
    ERRORES=$((ERRORES + 1))
  fi
}

# El archivo sin las líneas de comentario.
sed -E 's/^[[:space:]]*#.*$//' "$ARCHIVO" > "$TEMPORAL/sin-comentarios"

# 0. Revisión del texto.
echo
echo "Texto del archivo:"
comprobar "ningún 'listen [::]' (sólo IPv4)" '! grep -qE "listen[[:space:]]+\[" "$TEMPORAL/sin-comentarios"'
comprobar "ningún 'default_server'" '! grep -q "default_server" "$TEMPORAL/sin-comentarios"'
comprobar "nunca \$proxy_add_x_forwarded_for (sumaría lo que mande el cliente)" '! grep -q "proxy_add_x_forwarded_for" "$TEMPORAL/sin-comentarios"'
comprobar "sin módulo realip (set_real_ip_from / real_ip_header)" '! grep -qE "set_real_ip_from|real_ip_header" "$TEMPORAL/sin-comentarios"'

# 1. El bloque server REAL (el que hace proxy a Eli), con llaves balanceadas.
if ! awk '
  {
    linea = $0
    if (!dentro) {
      if (linea ~ /^[ \t]*server[ \t]*\{[ \t]*$/) { dentro = 1; profundidad = 0; bloque = "" } else next
    }
    abre = gsub(/\{/, "{", linea); cierra = gsub(/\}/, "}", linea)
    profundidad += abre - cierra
    bloque = bloque linea "\n"
    if (profundidad == 0) {
      dentro = 0
      if (bloque ~ /proxy_pass[ \t]+http:\/\/127\.0\.0\.1:3000[ \t]*;/) { printf "%s", bloque; hallados++ }
    }
  }
  END { if (hallados != 1) exit 3 }
' "$TEMPORAL/sin-comentarios" > "$TEMPORAL/server-crudo"; then
  fallo "Debe haber exactamente UN bloque 'server { ... }' con 'proxy_pass http://127.0.0.1:3000;' en $ARCHIVO."
fi

# Se le quita lo propio del servidor y se apunta al eco; se le pone un listen local.
sed -E \
  -e '/^[[:space:]]*(listen|server_name|ssl_[a-z_]+|include[[:space:]]+\/etc\/letsencrypt)[[:space:]]/d' \
  -e "s#127\\.0\\.0\\.1:3000#127.0.0.1:$PUERTO_ECO#" \
  -e "1a\\
    listen 127.0.0.1:$PUERTO_NGINX;\\
    server_name eliagenda.com;" \
  "$TEMPORAL/server-crudo" > "$TEMPORAL/server"

cat > "$TEMPORAL/nginx.conf" <<CONFEOF
pid $TEMPORAL/nginx.pid;
error_log $TEMPORAL/error.log notice;
daemon off;
master_process off;
events { worker_connections 64; }
http {
    access_log $TEMPORAL/access.log;
    client_body_temp_path $TEMPORAL/t-body;
    proxy_temp_path $TEMPORAL/t-proxy;
    fastcgi_temp_path $TEMPORAL/t-fastcgi;
    uwsgi_temp_path $TEMPORAL/t-uwsgi;
    scgi_temp_path $TEMPORAL/t-scgi;
    include $TEMPORAL/server;
}
CONFEOF

# 2. Servidor eco: una línea "nombre: valor" por cada cabecera recibida, y un
#    registro de cada pedido que le llega (para saber qué NO llegó).
cat > "$TEMPORAL/eco.js" <<'JSEOF'
const http = require("node:http")
const fs = require("node:fs")
const [puerto, registro] = process.argv.slice(2)
http
  .createServer((req, res) => {
    fs.appendFileSync(registro, `${req.method} ${req.url}\n`)
    req.resume()
    req.on("end", () => {
      const cuerpo = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}\n`).join("")
      res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(cuerpo) })
      res.end(cuerpo)
    })
  })
  .listen(Number(puerto), "127.0.0.1")
JSEOF
: > "$TEMPORAL/visitas"
node "$TEMPORAL/eco.js" "$PUERTO_ECO" "$TEMPORAL/visitas" &
PIDS+=("$!")

"$NGINX" -t -p "$TEMPORAL/" -c "$TEMPORAL/nginx.conf" > "$TEMPORAL/nginx-t.log" 2>&1 || {
  cat "$TEMPORAL/nginx-t.log" >&2
  fallo "nginx no acepta el bloque extraído de $ARCHIVO (nginx -t)."
}
"$NGINX" -p "$TEMPORAL/" -c "$TEMPORAL/nginx.conf" > "$TEMPORAL/nginx.log" 2>&1 &
PIDS+=("$!")

URL="http://127.0.0.1:$PUERTO_NGINX"
PEDIR=(curl --silent --noproxy "*" --max-time 5 --path-as-is -H "Host: eliagenda.com")

# Esperar a que nginx y el eco respondan (hasta ~15 s).
for _ in $(seq 1 30); do
  if "${PEDIR[@]}" --fail --output /dev/null "$URL/__listo" 2>/dev/null; then break; fi
  sleep 0.5
done
: > "$TEMPORAL/visitas"

# 3a. Las variantes de /api/cron: 404 y NINGUNA llega al eco.
echo
echo "/api/cron desde afuera (todas deben dar 404 sin llegar a la app):"
VARIANTES=(
  /api/cron /api/cron/ /api/cron/recordatorios /api/cron/recordatorios?secret=x
  /API/CRON/recordatorios /Api/Cron //api/cron/recordatorios /api//cron/recordatorios
  /api/cron%2frecordatorios /api/cron%2Frecordatorios /api/%63ron/recordatorios
  /api/x/../cron/recordatorios /api/cron/./recordatorios
)
for ruta in "${VARIANTES[@]}"; do
  codigo="$("${PEDIR[@]}" --output /dev/null --write-out '%{http_code}' "$URL$ruta" || true)"
  comprobar "$ruta -> 404 (obtuvo $codigo)" '[[ "$codigo" == "404" ]]'
done
LLEGARON="$(wc -l < "$TEMPORAL/visitas" | tr -d ' ')"
comprobar "ninguna de esas ${#VARIANTES[@]} variantes llegó a la app (llegaron $LLEGARON)" '[[ "$LLEGARON" == "0" ]]'

# 3b. Cabeceras falsificadas.
echo
RESPUESTA="$("${PEDIR[@]}" "$URL/" \
  -H 'X-Vercel-Forwarded-For: 11.11.11.11' \
  -H 'X-Real-IP: 22.22.22.22' \
  -H 'X-Forwarded-For: 33.33.33.33, 44.44.44.44' \
  -H 'Forwarded: for=55.55.55.55' \
  -H 'True-Client-IP: 66.66.66.66' \
  -H 'CF-Connecting-IP: 77.77.77.77')" || {
  echo "--- registro de nginx ---" >&2; cat "$TEMPORAL/error.log" >&2
  fallo "No obtuve respuesta del nginx de prueba."
}
echo "Cabeceras que le llegaron a la app (con IP real = 127.0.0.1):"
sed 's/^/    /' <<<"$RESPUESTA"

# Variantes más retorcidas: minúsculas, MAYÚSCULAS, repetidas, y nombradas en Connection.
RESPUESTA2="$("${PEDIR[@]}" "$URL/" \
  -H 'x-vercel-forwarded-for: 11.11.11.11' \
  -H 'X-VERCEL-FORWARDED-FOR: 12.12.12.12' \
  -H 'X-Real-IP: 22.22.22.22' -H 'x-real-ip: 23.23.23.23' \
  -H 'X-Forwarded-For: 33.33.33.33' -H 'X-Forwarded-For: 34.34.34.34' \
  -H 'X-Forwarded-Host: falso.example' -H 'X-Forwarded-Proto: https' \
  -H 'Connection: X-Real-IP, X-Forwarded-For, X-Vercel-Forwarded-For')" || fallo "No obtuve respuesta (variantes)."

echo
echo "Cabeceras falsificadas:"
comprobar "el eco respondió de verdad (si no, las demás pruebas no valen)" 'grep -q "^host: " <<<"$RESPUESTA" && grep -q "^host: " <<<"$RESPUESTA2"'
comprobar "x-vercel-forwarded-for no llega a la app" '! grep -qi "^x-vercel-forwarded-for:" <<<"$RESPUESTA"'
comprobar "x-real-ip es la IP real" 'grep -qx "x-real-ip: 127.0.0.1" <<<"$RESPUESTA"'
comprobar "x-forwarded-for es SOLO la IP real (sin lo que mandó el cliente)" 'grep -qx "x-forwarded-for: 127.0.0.1" <<<"$RESPUESTA"'
comprobar "forwarded, true-client-ip y cf-connecting-ip no llegan" '! grep -qiE "^(forwarded|true-client-ip|cf-connecting-ip):" <<<"$RESPUESTA"'
comprobar "ninguna IP inventada llegó a la app" '! grep -qE "(11\.11\.11\.11|22\.22\.22\.22|33\.33\.33\.33|44\.44\.44\.44|55\.55\.55\.55|66\.66\.66\.66|77\.77\.77\.77)" <<<"$RESPUESTA"'
comprobar "(variantes: minúsculas, repetidas, Connection) x-vercel-forwarded-for no llega" '! grep -qi "^x-vercel-forwarded-for:" <<<"$RESPUESTA2"'
comprobar "(variantes) x-real-ip y x-forwarded-for son SOLO la IP real" 'grep -qx "x-real-ip: 127.0.0.1" <<<"$RESPUESTA2" && grep -qx "x-forwarded-for: 127.0.0.1" <<<"$RESPUESTA2"'
comprobar "(variantes) ninguna IP inventada llegó" '! grep -qE "(1[12]\.1[12]\.1[12]\.1[12]|2[23]\.2[23]\.2[23]\.2[23]|3[34]\.3[34]\.3[34]\.3[34])" <<<"$RESPUESTA2"'
comprobar "x-forwarded-host es el Host real, no el inventado" 'grep -qx "x-forwarded-host: eliagenda.com" <<<"$RESPUESTA2"'
comprobar "x-forwarded-proto lo fija nginx (http en esta prueba local)" 'grep -qx "x-forwarded-proto: http" <<<"$RESPUESTA2"'
comprobar "Host llega como eliagenda.com" 'grep -qx "host: eliagenda.com" <<<"$RESPUESTA"'

# 3c. Cabeceras de respuesta, no-bloqueo de lo legítimo y tamaño de cuerpo.
echo
echo "Respuestas:"
CABECERAS_OK="$("${PEDIR[@]}" --dump-header - --output /dev/null "$URL/")"
CABECERAS_404="$("${PEDIR[@]}" --dump-header - --output /dev/null "$URL/api/cron/recordatorios")"
CODIGO_RAIZ="$("${PEDIR[@]}" --output /dev/null --write-out '%{http_code}' "$URL/")"
CODIGO_PARECIDA="$("${PEDIR[@]}" --output /dev/null --write-out '%{http_code}' "$URL/api/cronista")"
head -c 7000000 /dev/zero > "$TEMPORAL/grande"
head -c 1000000 /dev/zero > "$TEMPORAL/chico"
CODIGO_GRANDE="$("${PEDIR[@]}" --output /dev/null --write-out '%{http_code}' --data-binary "@$TEMPORAL/grande" "$URL/api/algo" || true)"
CODIGO_CHICO="$("${PEDIR[@]}" --output /dev/null --write-out '%{http_code}' --data-binary "@$TEMPORAL/chico" "$URL/api/algo" || true)"
comprobar "el resto del sitio sí llega a la app (/ obtuvo $CODIGO_RAIZ)" '[[ "$CODIGO_RAIZ" == "200" ]]'
comprobar "/api/cronista (otra ruta) NO se bloquea (obtuvo $CODIGO_PARECIDA)" '[[ "$CODIGO_PARECIDA" == "200" ]]'
comprobar "HSTS sale en las respuestas normales" 'grep -qi "^strict-transport-security: max-age=31536000" <<<"$CABECERAS_OK"'
comprobar "HSTS sale TAMBIÉN en el 404 de /api/cron (el location no pierde los add_header del server)" 'grep -qi "^strict-transport-security: max-age=31536000" <<<"$CABECERAS_404"'
comprobar "no se anuncia la versión de nginx (Server: nginx a secas)" '! grep -qiE "^server: nginx/" <<<"$CABECERAS_OK"'
comprobar "cuerpo de 7 MB: 413 (obtuvo $CODIGO_GRANDE)" '[[ "$CODIGO_GRANDE" == "413" ]]'
comprobar "cuerpo de 1 MB: pasa (obtuvo $CODIGO_CHICO)" '[[ "$CODIGO_CHICO" == "200" ]]'

echo
if [[ "$ERRORES" -eq 0 ]]; then
  echo "TODO BIEN: el cliente no puede elegir su IP y /api/cron no se alcanza desde afuera."
else
  fallo "$ERRORES comprobación(es) fallaron: el límite de intentos se podría saltar o algo quedaría expuesto. NO pongas Eli en producción así."
fi
