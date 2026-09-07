#!/usr/bin/env bash
# Chequeo de seguridad detectable por texto. Corre antes de cada commit.
# Uso:  bash arquitectura_docs/seguridad/verificar.sh
# NO reemplaza el checklist de 05-checklist-entrega.md: detecta lo obvio, nada más.
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
FALLOS=0
EXCL=":(exclude)*/node_modules/*  :(exclude)*.lock  :(exclude)*/dist/*  :(exclude)*/build/*  :(exclude)arquitectura_docs/*"

buscar() { # patrón, mensaje
  local hits
  hits=$(git grep -nIE "$1" -- . $EXCL 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "FALLO: $2"; echo "$hits" | head -10 | sed 's/^/   /'; echo
    FALLOS=$((FALLOS+1))
  fi
}

echo "Revisando $RAIZ"; echo

buscar 'sb_secret_[A-Za-z0-9_-]+'                 "llave secreta de Supabase en el codigo"
buscar 'sk_live_[A-Za-z0-9]+'                     "llave de Stripe de produccion en el codigo"
buscar '\bAKIA[0-9A-Z]{16}\b'                     "credencial de AWS en el codigo"
buscar 'ghp_[A-Za-z0-9]{20,}'                     "token de GitHub en el codigo"
buscar '(NEXT_PUBLIC|VITE|REACT_APP|EXPO_PUBLIC)_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN)' \
                                                  "variable secreta con prefijo publico: se inyecta en el bundle"
buscar 'service_role'                             "referencia a service_role: verifica que no llegue al cliente"
buscar '(password|passwd|contrasena)\s*[:=]\s*["'"'"'][^"'"'"']{6,}' "contrasena escrita directo en el codigo"
buscar 'USING\s*\(\s*true\s*\)'                   "politica RLS abierta: USING (true)"
buscar '\b(DEBUG|debug)\s*[:=]\s*(True|true)\b'   "modo depuracion activo"

# .env versionado
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "FALLO: .env esta versionado en git"; echo; FALLOS=$((FALLOS+1))
fi
if [ -f .gitignore ] && ! grep -qE '^\.env' .gitignore; then
  echo "FALLO: .gitignore no cubre .env"; echo; FALLOS=$((FALLOS+1))
fi

# tablas sin RLS en las migraciones
CREATE=$(git grep -lIiE 'CREATE TABLE' -- '*.sql' 2>/dev/null || true)
if [ -n "$CREATE" ]; then
  for f in $CREATE; do
    grep -qiE 'ENABLE ROW LEVEL SECURITY' "$f" || {
      echo "AVISO: $f crea tablas y no activa RLS en el mismo archivo"; }
  done
  echo
fi

if [ "$FALLOS" -eq 0 ]; then
  echo "Sin hallazgos automaticos."
  echo "Recuerda: esto detecta patrones de texto. El checklist completo esta en"
  echo "arquitectura_docs/seguridad/05-checklist-entrega.md"
else
  echo "$FALLOS hallazgo(s). No commitees hasta resolverlos."
  exit 1
fi
