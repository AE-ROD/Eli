#!/usr/bin/env bash
# Prueba, con Caddy de verdad, que un cliente NO puede elegir la IP que ve la
# app (la que usa el rate limit: lib/rate-limit.ts, obtenerIp).
#
#   ./deploy/probar-cabeceras.sh                      prueba el Caddyfile del repo
#   ./deploy/probar-cabeceras.sh /etc/caddy/Caddyfile  prueba el que está INSTALADO
#
# En el servidor conviene probar el instalado (el que de verdad atiende), no
# sólo el del repo: si el del repo cambió y nadie lo volvió a copiar, el de
# /etc/caddy seguiría viejo (README.md, paso 12.5 y "Re-aplicar cambios").
#
# Qué hace (no toca el Caddy ni la app que están sirviendo):
#   0. Revisa el TEXTO del Caddyfile: que cada sitio tenga "bind 0.0.0.0"
#      (sólo IPv4: ver el Caddyfile) y que cierre /api/cron/* con un 404.
#   1. Toma el bloque "reverse_proxy" (y el cierre de /api/cron/*) del Caddyfile.
#   2. Arma con él un Caddy de prueba en el puerto 38080 (sólo local, sin HTTPS)
#      que reenvía a un servidor "eco" de juguete en el puerto 38081, que
#      responde con las cabeceras que le llegaron.
#   3. Hace un pedido mintiendo en X-Vercel-Forwarded-For, X-Real-IP y
#      X-Forwarded-For, y comprueba que lo que le llega a la app es la IP real
#      de la conexión (127.0.0.1 en esta prueba) y no lo inventado. Y que
#      /api/cron/recordatorios da 404 sin llegar a la app.
#   4. Apaga todo lo que levantó.
#
# Necesita: caddy, python3, curl. Corre como el usuario eli (no hace falta sudo).
# Sale con código 0 sólo si pasa todo.

set -euo pipefail

DIRECTORIO_DEL_SCRIPT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CADDYFILE="${1:-$DIRECTORIO_DEL_SCRIPT/Caddyfile}"
PUERTO_CADDY=38080
PUERTO_ECO=38081

fallo() { printf '\nFALLÓ: %s\n' "$*" >&2; exit 1; }
for herramienta in caddy python3 curl awk; do
  command -v "$herramienta" >/dev/null || fallo "Falta '$herramienta'."
done
[[ -r "$CADDYFILE" ]] || fallo "No puedo leer $CADDYFILE."
echo "Probando: $CADDYFILE"

TEMPORAL="$(mktemp -d)"
PIDS=()
limpiar() {
  for pid in "${PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done
  rm -rf "$TEMPORAL"
}
trap limpiar EXIT

# 1. El bloque reverse_proxy del Caddyfile real, apuntando al servidor eco.
awk -v puerto="$PUERTO_ECO" '
  /^\treverse_proxy 127\.0\.0\.1:3000 \{/ { dentro = 1; print "\treverse_proxy 127.0.0.1:" puerto " {"; next }
  dentro && /^\t\}/ { print; exit }
  dentro { print }
' "$CADDYFILE" > "$TEMPORAL/bloque"
[[ -s "$TEMPORAL/bloque" ]] || fallo "No encontré el bloque 'reverse_proxy 127.0.0.1:3000 { ... }' en $CADDYFILE."

# El cierre de /api/cron/* (dos líneas del Caddyfile), si está.
grep -E '^[[:space:]]+(@cron[[:space:]]+path[[:space:]]|respond[[:space:]]+@cron[[:space:]]+404[[:space:]]*$)' "$CADDYFILE" > "$TEMPORAL/cron" || true

{
  printf '{\n\tadmin off\n\tauto_https off\n\thttp_port %s\n}\n' "$PUERTO_CADDY"
  printf 'http://:%s {\n' "$PUERTO_CADDY"
  cat "$TEMPORAL/cron"
  cat "$TEMPORAL/bloque"
  printf '}\n'
} > "$TEMPORAL/Caddyfile"

# 2. Servidor eco: devuelve una línea "nombre: valor" por cada cabecera recibida.
cat > "$TEMPORAL/eco.py" <<'PYEOF'
import http.server, sys

class Eco(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        cuerpo = "".join(f"{k.lower()}: {v}\n" for k, v in self.headers.items()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)
    def log_message(self, *args):
        pass

http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Eco).serve_forever()
PYEOF
python3 -I "$TEMPORAL/eco.py" "$PUERTO_ECO" &
PIDS+=("$!")

XDG_CONFIG_HOME="$TEMPORAL/xdg-config" XDG_DATA_HOME="$TEMPORAL/xdg-data" \
  caddy run --config "$TEMPORAL/Caddyfile" --adapter caddyfile > "$TEMPORAL/caddy.log" 2>&1 &
PIDS+=("$!")

# Esperar a que Caddy responda (hasta ~15 s).
for _ in $(seq 1 30); do
  if curl --silent --output /dev/null --max-time 1 "http://127.0.0.1:$PUERTO_CADDY/"; then break; fi
  sleep 0.5
done

# 3. El pedido con mentiras.
RESPUESTA="$(curl --silent --max-time 5 "http://127.0.0.1:$PUERTO_CADDY/" \
  -H 'X-Vercel-Forwarded-For: 11.11.11.11' \
  -H 'X-Real-IP: 22.22.22.22' \
  -H 'X-Forwarded-For: 33.33.33.33, 44.44.44.44')" || {
  echo "--- registro de Caddy ---" >&2; cat "$TEMPORAL/caddy.log" >&2
  fallo "No obtuve respuesta del Caddy de prueba."
}

echo "Cabeceras que le llegaron a la app (con IP real = 127.0.0.1):"
sed 's/^/    /' <<<"$RESPUESTA"
SITIOS="$(grep -cE '^[^#[:space:]{][^{]*\{[[:space:]]*$' "$CADDYFILE" || true)"
BINDS="$(grep -cE '^[[:space:]]+bind[[:space:]]+0\.0\.0\.0[[:space:]]*$' "$CADDYFILE" || true)"
CODIGO_CRON="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "http://127.0.0.1:$PUERTO_CADDY/api/cron/recordatorios" || true)"
CODIGO_RAIZ="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "http://127.0.0.1:$PUERTO_CADDY/" || true)"

echo
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
comprobar "x-vercel-forwarded-for fue borrada" '! grep -qi "^x-vercel-forwarded-for:" <<<"$RESPUESTA"'
comprobar "x-real-ip es la IP real" 'grep -qx "x-real-ip: 127.0.0.1" <<<"$RESPUESTA"'
comprobar "x-forwarded-for es SOLO la IP real (sin lo que mandó el cliente)" 'grep -qx "x-forwarded-for: 127.0.0.1" <<<"$RESPUESTA"'
comprobar "ninguna IP inventada llegó a la app" '! grep -qE "(11\.11\.11\.11|22\.22\.22\.22|33\.33\.33\.33|44\.44\.44\.44)" <<<"$RESPUESTA"'
comprobar "cada sitio escucha sólo en IPv4 (bind 0.0.0.0: $BINDS de $SITIOS sitios)" '[[ "$SITIOS" -ge 1 && "$SITIOS" == "$BINDS" ]]'
comprobar "/api/cron/recordatorios desde afuera da 404 (obtuvo $CODIGO_CRON)" '[[ "$CODIGO_CRON" == "404" ]]'
comprobar "el resto del sitio sí llega a la app (/ obtuvo $CODIGO_RAIZ)" '[[ "$CODIGO_RAIZ" == "200" ]]'

echo
if [[ "$ERRORES" -eq 0 ]]; then
  echo "TODO BIEN: el cliente no puede elegir su IP."
else
  fallo "$ERRORES comprobación(es) fallaron: el límite de intentos se podría saltar o algo quedaría expuesto. NO pongas Eli en producción así."
fi
