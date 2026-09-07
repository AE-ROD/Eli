#!/usr/bin/env bash
# Instala el estándar de arquitectura en la raíz del proyecto.
# Uso:  bash arquitectura_docs/instalar.sh
set -euo pipefail

DOCS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$DOCS/.." && pwd)"

echo "Instalando estándar $(cat "$DOCS/VERSION") en: $RAIZ"

# Devuelve 0 siempre: con `set -e`, un respaldo omitido no debe abortar la
# instalación. Antes fallaba en instalación limpia, cuando el archivo aún no existe.
respaldar() {
  if [ -e "$1" ]; then
    cp -r "$1" "$1.bak.$(date +%s)"
    echo "  respaldo: $1.bak"
  fi
  return 0
}

# 1. CLAUDE.md en la raíz (Claude Code lo lee desde ahí, no desde subcarpetas)
respaldar "$RAIZ/CLAUDE.md"
cp "$DOCS/CLAUDE.md" "$RAIZ/CLAUDE.md"
echo "  CLAUDE.md"

# 2. Permisos
mkdir -p "$RAIZ/.claude"
respaldar "$RAIZ/.claude/settings.json"
cp "$DOCS/claude-permisos.json" "$RAIZ/.claude/settings.json"
echo "  .claude/settings.json"

# 3. Agentes y comandos (enlazados: editas en arquitectura_docs y se refleja)
mkdir -p "$RAIZ/.claude/agents" "$RAIZ/.claude/commands"
# Enlaces RELATIVOS: con rutas absolutas el repo sólo funciona en la ruta donde
# se instaló, y los enlaces se rompen al clonarlo en otra máquina.
for f in "$DOCS"/agentes/*.md;  do ln -sfn "../../arquitectura_docs/agentes/$(basename "$f")"  "$RAIZ/.claude/agents/$(basename "$f")";   done
for f in "$DOCS"/comandos/*.md; do ln -sfn "../../arquitectura_docs/comandos/$(basename "$f")" "$RAIZ/.claude/commands/$(basename "$f")"; done
echo "  .claude/agents/ (5)  .claude/commands/ (4)"

# 4. Proteger secretos
if [ -f "$RAIZ/.gitignore" ] && ! grep -q "^\.env$" "$RAIZ/.gitignore"; then
  printf '\n.env\n.env.*\n!.env.example\n.claude/settings.local.json\n' >> "$RAIZ/.gitignore"
  echo "  .gitignore actualizado"
fi

cat <<'FIN'

Listo. Antes de la primera sesión:
  1. Completa  arquitectura_docs/reglas/06-stack.md   (sin esto el agente adivina)
  2. Completa  arquitectura_docs/contexto/cliente.md
  3. Abre Claude Code y corre  /estado

  Nota: este proyecto es un SaaS multi-tenant, no un sistema de agencia.
  NO se crean core/ ni clientes/<slug>/. La regla de aislamiento vive en
  arquitectura_docs/reglas/01-arquitectura.md

Los subagentes se cargan al iniciar sesión: si editas uno, reinicia la sesión.
FIN
